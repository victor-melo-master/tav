import { Injectable } from '@nestjs/common';
import { EstadoAmpliacion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EstadoSemaforo, SemaforoResultado } from './ledger.dto';
import { ConfigFaltanteException, NoEncontradoException } from './ledger.exceptions';

const MS_POR_DIA = 86_400_000;
const NIVELES: EstadoSemaforo[] = ['verde', 'ambar', 'rojo'];

/**
 * Semáforo de dos ejes: días de deuda y porcentaje del límite consumido.
 * Manda el peor de los dos. Este cálculo vive SOLO aquí: la app móvil y el
 * panel consumen el resultado, nunca lo repiten.
 *
 * Los umbrales salen de la tabla Config, nunca quemados:
 *   semaforo.dias_ambar · semaforo.dias_rojo · semaforo.pct_ambar
 * El 100% (bloqueo) sí es regla firme del negocio.
 */
@Injectable()
export class SemaforoService {
  constructor(private readonly prisma: PrismaService) {}

  async calcular(cajeroId: string, ahora: Date = new Date()): Promise<SemaforoResultado> {
    const [perfil, ampliacion, config] = await Promise.all([
      this.prisma.perfilCajero.findUnique({ where: { usuarioId: cajeroId } }),
      this.prisma.ampliacionCredito.findFirst({
        where: { cajeroId, estado: EstadoAmpliacion.aprobada },
        orderBy: { resueltaAt: 'asc' },
      }),
      this.leerUmbrales(),
    ]);
    if (!perfil) throw new NoEncontradoException('cajero', cajeroId);

    // Mientras la ampliación esté activa, el porcentaje se calcula sobre el cupo ampliado.
    const limiteEfectivo = perfil.limiteCents + (ampliacion?.montoCents ?? 0n);

    const dias = perfil.deudaDesde
      ? Math.max(0, Math.floor((ahora.getTime() - perfil.deudaDesde.getTime()) / MS_POR_DIA))
      : 0;

    // pct se calcula solo sobre deuda (max(0, saldo)). Un cajero con saldo
    // a favor (saldoCents < 0) está en 0% y en verde.
    const deuda = perfil.saldoCents > 0n ? perfil.saldoCents : 0n;
    const pct = limiteEfectivo > 0n ? Number(deuda) / Number(limiteEfectivo) : 0;

    const porDias = dias >= config.diasRojo ? 2 : dias >= config.diasAmbar ? 1 : 0;
    const porCredito = pct >= 1 ? 2 : pct >= config.pctAmbar ? 1 : 0;
    const nivel = Math.max(porDias, porCredito);

    const bloqueado = pct >= 1;
    // disponible = límite efectivo + saldo a favor. Si el saldo es negativo
    // (saldo a favor), el disponible sube. Si es positivo, se resta.
    const disponibleBruto = limiteEfectivo - perfil.saldoCents;
    const disponibleCents = disponibleBruto > 0n ? disponibleBruto : 0n;

    return {
      estado: NIVELES[nivel],
      dias,
      pct,
      bloqueado,
      motivo: this.motivo(nivel, porDias, porCredito, dias, bloqueado),
      disponibleCents,
    };
  }

  private motivo(
    nivel: number,
    porDias: number,
    porCredito: number,
    dias: number,
    bloqueado: boolean,
  ): string {
    if (nivel === 0) return 'Al día';
    if (bloqueado) return 'Sin cupo';
    // Con empate de ejes, se explica el de crédito: es el que bloquea operaciones.
    if (porCredito >= porDias) {
      return porCredito === 2 ? 'Sin cupo' : 'Cerca del límite';
    }
    return porDias === 2 ? `Deuda vencida (${dias} días)` : `Deuda por vencer (${dias} días)`;
  }

  private async leerUmbrales(): Promise<{ diasAmbar: number; diasRojo: number; pctAmbar: number }> {
    const claves = ['semaforo.dias_ambar', 'semaforo.dias_rojo', 'semaforo.pct_ambar'];
    const filas = await this.prisma.config.findMany({ where: { clave: { in: claves } } });
    const mapa = new Map(filas.map((f) => [f.clave, f.valor]));
    for (const clave of claves) {
      if (!mapa.has(clave)) throw new ConfigFaltanteException(clave);
    }
    return {
      diasAmbar: Number(mapa.get('semaforo.dias_ambar')),
      diasRojo: Number(mapa.get('semaforo.dias_rojo')),
      pctAmbar: Number(mapa.get('semaforo.pct_ambar')),
    };
  }
}
