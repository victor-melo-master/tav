import { Injectable } from '@nestjs/common';
import { TipoAviso } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CrearAvisoDto } from '../cobrador/dto/enviar-cierre.dto';

const MS_POR_DIA = 86_400_000;

export interface AvisoResponse {
  id: string;
  cajeroId: string;
  tipo: TipoAviso;
  titulo: string;
  cuerpo: string;
  enviadoAt: Date;
  leidoAt: Date | null;
  resueltoAt: Date | null;
  enviadoPorId: string | null;
  cajeroNombre?: string;
}

/**
 * Notificaciones del sistema (y manuales del cobrador).
 *
 * Se evalúan cuando alguien consulta una lista, como los avisos de abono.
 * Con menos de cincuenta usuarios no hace falta cron ni push.
 *
 * Reglas de negocio (docs/01-reglas-de-negocio.md, sección 7):
 *   - 7 días de deuda → aviso tipo `vencido`.
 *   - tope del 100% del cupo → aviso tipo `sin_cupo`.
 *   - 3 días sin conectarse → aviso tipo `sin_conexion` (solo admin).
 *   - el cobrador puede enviar un aviso manual (`cobro_manual`).
 *
 * Un episodio no se duplica: mientras haya un aviso abierto del mismo tipo
 * para el mismo cajero, no se crea otro. Cuando la condición desaparece,
 * se cierra el episodio con `resueltoAt`.
 */
@Injectable()
export class AvisosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evalúa y mantiene los avisos automáticos para los cajeros indicados.
   * Si no se pasan IDs, evalúa a todos.
   */
  async sincronizar(cajeroIds?: string[], incluirSinConexion = false): Promise<void> {
    const perfiles = await this.prisma.perfilCajero.findMany({
      where: cajeroIds ? { usuarioId: { in: cajeroIds } } : {},
      include: { usuario: true },
    });

    await Promise.all(
      perfiles.map((p) => this._evaluarCajero(p, incluirSinConexion)),
    );
  }

  private async _evaluarCajero(
    perfil: {
      usuarioId: string;
      saldoCents: bigint;
      limiteCents: bigint;
      deudaDesde: Date | null;
      usuario: { ultimaVezAt: Date | null };
    },
    incluirSinConexion: boolean,
  ): Promise<void> {
    const ahora = Date.now();
    const diasDeuda = perfil.deudaDesde
      ? Math.floor((ahora - perfil.deudaDesde.getTime()) / MS_POR_DIA)
      : 0;
    const bloqueado = perfil.saldoCents > 0n && perfil.saldoCents >= perfil.limiteCents;
    const diasSinConectarse = perfil.usuario.ultimaVezAt
      ? Math.floor((ahora - perfil.usuario.ultimaVezAt.getTime()) / MS_POR_DIA)
      : null;

    await Promise.all([
      this._mantener(
        perfil.usuarioId,
        'vencido',
        diasDeuda >= 7,
        {
          titulo: '7 días de deuda',
          cuerpo: `El cajero lleva ${diasDeuda} días con deuda pendiente.`,
        },
      ),
      this._mantener(
        perfil.usuarioId,
        'sin_cupo',
        bloqueado,
        {
          titulo: 'Cupo agotado',
          cuerpo: `El cajero alcanzó el 100% de su límite (${perfil.limiteCents.toString()} G$ centavos) y no puede registrar operaciones hasta abonar o ampliar el cupo.`,
        },
      ),
      incluirSinConexion && diasSinConectarse != null && diasSinConectarse >= 3
        ? this._mantener(
            perfil.usuarioId,
            'sin_conexion',
            true,
            {
              titulo: 'Sin conexión',
              cuerpo: `El cajero no se conecta desde hace ${diasSinConectarse} días.`,
            },
          )
        : this._mantener(
            perfil.usuarioId,
            'sin_conexion',
            false,
            { titulo: '', cuerpo: '' },
          ),
    ]);
  }

  private async _mantener(
    cajeroId: string,
    tipo: TipoAviso,
    condicion: boolean,
    contenido: { titulo: string; cuerpo: string },
  ): Promise<void> {
    const abierto = await this.prisma.aviso.findFirst({
      where: { cajeroId, tipo, resueltoAt: null },
    });

    if (condicion) {
      if (!abierto) {
        await this.prisma.aviso.create({
          data: {
            cajeroId,
            tipo,
            titulo: contenido.titulo,
            cuerpo: contenido.cuerpo,
          },
        });
      }
      return;
    }

    if (abierto) {
      await this.prisma.aviso.update({
        where: { id: abierto.id },
        data: { resueltoAt: new Date() },
      });
    }
  }

  /**
   * El cobrador envía un aviso manual a un cajero.
   */
  async crearManual(cobradorId: string, dto: CrearAvisoDto): Promise<AvisoResponse> {
    const aviso = await this.prisma.aviso.create({
      data: {
        cajeroId: dto.cajeroId,
        tipo: 'cobro_manual',
        titulo: dto.titulo,
        cuerpo: dto.cuerpo,
        enviadoPorId: cobradorId,
      },
    });

    return this._toResponse(aviso);
  }

  /**
   * Lista los avisos no resueltos de un cajero. Excluye `sin_conexion`,
   * que es solo para el admin.
   */
  async listarPorCajero(cajeroId: string): Promise<AvisoResponse[]> {
    await this.sincronizar([cajeroId], false);

    const avisos = await this.prisma.aviso.findMany({
      where: {
        cajeroId,
        resueltoAt: null,
        tipo: { not: 'sin_conexion' },
      },
      orderBy: { enviadoAt: 'desc' },
    });

    return avisos.map((a) => this._toResponse(a));
  }

  /**
   * Marca un aviso del cajero como leído.
   * Los avisos manuales del cobrador se resuelven al leerlos.
   */
  async marcarLeido(cajeroId: string, avisoId: string): Promise<AvisoResponse> {
    const aviso = await this.prisma.aviso.findUnique({
      where: { id: avisoId },
    });

    if (!aviso || aviso.cajeroId !== cajeroId) {
      // No revelar existencia.
      throw new Error('Aviso no encontrado');
    }

    const data: { leidoAt: Date; resueltoAt?: Date } = { leidoAt: new Date() };
    if (aviso.tipo === 'cobro_manual') {
      data.resueltoAt = new Date();
    }

    const actualizado = await this.prisma.aviso.update({
      where: { id: avisoId },
      data,
    });

    return this._toResponse(actualizado);
  }

  /**
   * Avisos que el cobrador puede ver: los automáticos del sistema
   * (`vencido`, `sin_cupo`) y los manuales que envió cualquier cobrador.
   */
  async listarParaCobrador(): Promise<AvisoResponse[]> {
    await this.sincronizar(undefined, false);

    const avisos = await this.prisma.aviso.findMany({
      where: {
        resueltoAt: null,
        tipo: { in: ['vencido', 'sin_cupo', 'cobro_manual'] },
      },
      orderBy: { enviadoAt: 'desc' },
      include: {
        cajero: { include: { usuario: { select: { nombre: true } } } },
      },
    });

    return avisos.map((a) => ({
      ...this._toResponse(a),
      cajeroNombre: a.cajero.usuario.nombre,
    }));
  }

  /**
   * Todos los avisos no resueltos de un cajero, incluyendo `sin_conexion`.
   * Para la ficha del admin.
   */
  async listarPorCajeroAdmin(cajeroId: string): Promise<AvisoResponse[]> {
    await this.sincronizar([cajeroId], true);

    const avisos = await this.prisma.aviso.findMany({
      where: { cajeroId, resueltoAt: null },
      orderBy: { enviadoAt: 'desc' },
    });

    return avisos.map((a) => this._toResponse(a));
  }

  private _toResponse(a: {
    id: string;
    cajeroId: string;
    tipo: TipoAviso;
    titulo: string;
    cuerpo: string;
    enviadoAt: Date;
    leidoAt: Date | null;
    resueltoAt: Date | null;
    enviadoPorId: string | null;
  }): AvisoResponse {
    return {
      id: a.id,
      cajeroId: a.cajeroId,
      tipo: a.tipo,
      titulo: a.titulo,
      cuerpo: a.cuerpo,
      enviadoAt: a.enviadoAt,
      leidoAt: a.leidoAt,
      resueltoAt: a.resueltoAt,
      enviadoPorId: a.enviadoPorId,
    };
  }
}
