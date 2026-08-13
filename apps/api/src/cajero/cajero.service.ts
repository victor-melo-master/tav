import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { SemaforoService } from '../ledger/semaforo.service';
import { NoEncontradoException } from '../ledger/ledger.exceptions';
import { CrearOperacionDto } from './dto/crear-operacion.dto';
import { SolicitarAmpliacionDto } from './dto/solicitar-ampliacion.dto';
import { PaginacionOperacionesDto, PaginacionDto } from './dto/paginacion.dto';

/**
 * Capa fina del rol cajero. Delega la lógica de dinero al LedgerService y el
 * cálculo del semáforo al SemaforoService — no duplica nada de negocio aquí.
 *
 * cajeroId y creadaPorId SIEMPRE los recibe del controlador, que los saca del
 * JWT. Un cajero solo puede operar sobre sí mismo: no hay forma de pasar un
 * cajeroId ajeno porque no viaja en el body ni en la query.
 */
@Injectable()
export class CajeroService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly semaforo: SemaforoService,
  ) {}

  // ─────────────────────────── RESUMEN ───────────────────────────

  /** Saldo, límite, disponible y semáforo ya calculado por SemaforoService. */
  async resumen(cajeroId: string) {
    const perfil = await this.prisma.perfilCajero.findUnique({
      where: { usuarioId: cajeroId },
    });
    if (!perfil) throw new NoEncontradoException('cajero', cajeroId);

    const semaforo = await this.semaforo.calcular(cajeroId);

    return {
      saldoCents: perfil.saldoCents,
      limiteCents: perfil.limiteCents,
      disponibleCents: semaforo.disponibleCents,
      deudaDesde: perfil.deudaDesde,
      semaforo,
    };
  }

  // ─────────────────────────── OPERACIONES ───────────────────────────

  /** Lista paginada de operaciones del cajero, con filtro opcional por estado. */
  async operaciones(cajeroId: string, query: PaginacionOperacionesDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = {
      cajeroId,
      ...(query.estado ? { estado: query.estado } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.operacion.findMany({
        where,
        orderBy: { creadaAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.operacion.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * Crea una operación llamando a LedgerService.registrarOperacion.
   * cajeroId y creadaPorId salen del JWT, no del body.
   * La validación aritmética (totalCents == montoOrigen + comisión) ya se hizo
   * en el DTO; aquí solo se convierten los strings a BigInt para el ledger.
   */
  async crearOperacion(cajeroId: string, creadaPorId: string, dto: CrearOperacionDto) {
    return this.ledger.registrarOperacion({
      clientUuid: dto.clientUuid,
      cajeroId,
      tipo: dto.tipo,
      montoOrigenCents: BigInt(dto.montoOrigenCents),
      monedaOrigen: dto.monedaOrigen,
      tasaAplicada: dto.tasaAplicada,
      comisionCents: BigInt(dto.comisionCents),
      totalCents: BigInt(dto.totalCents),
      montoDestinoCents: BigInt(dto.montoDestinoCents),
      monedaDestino: dto.monedaDestino,
      beneficiario: dto.beneficiario,
      comprobanteUrl: dto.comprobanteUrl,
      creadaPorId,
    });
  }

  // ─────────────────────────── MOVIMIENTOS ───────────────────────────

  /** Estado de cuenta paginado, ordenado por seq descendente (más reciente primero). */
  async movimientos(cajeroId: string, query: PaginacionDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = { cajeroId };

    const [items, total] = await Promise.all([
      this.prisma.movimiento.findMany({
        where,
        orderBy: { seq: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.movimiento.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  // ─────────────────────────── AMPLIACIONES ───────────────────────────

  /** Solicita una ampliación de cupo con monto y motivo. El admin la resuelve. */
  async solicitarAmpliacion(cajeroId: string, dto: SolicitarAmpliacionDto) {
    return this.prisma.ampliacionCredito.create({
      data: {
        cajeroId,
        montoCents: BigInt(dto.montoCents),
        motivo: dto.motivo,
      },
    });
  }

  /** Lista las solicitudes de ampliación del cajero, ordenadas por fecha. */
  async ampliaciones(cajeroId: string) {
    return this.prisma.ampliacionCredito.findMany({
      where: { cajeroId },
      orderBy: { solicitadaAt: 'desc' },
    });
  }
}
