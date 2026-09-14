import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { SemaforoService } from '../ledger/semaforo.service';
import { TasaCorredorService } from '../tasa/tasa-corredor.service';
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
    private readonly tasaCorredor: TasaCorredorService,
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

  // ─────────────────────────── CORREDORES ───────────────────────────

  /**
   * Corredores ofrecibles al cajero: activos con tasa publicada.
   * Devuelve solo lo que el cajero necesita ver — id, país, moneda, forma
   * de entrega y tasaCotizada. NUNCA margen, pataDestino ni pataBase.
   */
  async corredores() {
    return this.tasaCorredor.corredoresOfrecibles();
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
   *
   * La tasa y el monto destino NO vienen del cliente: el servidor lee la
   * tasa cotizada vigente del corredor (TasaCorredorService.tasaVigente),
   * la congela en la operación, y calcula montoDestinoCents con
   * calcularMontoDestinoCents (Decimal + ROUND_HALF_UP). Igual que
   * convertirAMonedaBase hace con los cobros. El cliente manda corredorId
   * y montoOrigenCents; todo lo demás lo pone el servidor.
   *
   * Si la tasa cambió entre que el cajero abrió la pantalla y confirmó,
   * se aplica la vigente al confirmar. La respuesta devuelve la operación
   * con la tasa y el monto destino reales para que la app los muestre.
   */
  async crearOperacion(cajeroId: string, creadaPorId: string, dto: CrearOperacionDto) {
    // Leer la tasa cotizada vigente del corredor. NUNCA del cliente.
    const tasaCotizada = await this.tasaCorredor.tasaVigente(dto.corredorId);
    if (!tasaCotizada) {
      throw new NoEncontradoException('corredor', dto.corredorId);
    }

    // Calcular monto destino en el servidor, en Decimal + ROUND_HALF_UP.
    const montoOrigenCents = BigInt(dto.montoOrigenCents);
    const montoDestinoCents = TasaCorredorService.calcularMontoDestinoCents(
      montoOrigenCents,
      tasaCotizada,
    );
    const tasaAplicada = tasaCotizada.toString();

    return this.ledger.registrarOperacion({
      clientUuid: dto.clientUuid,
      cajeroId,
      tipo: dto.tipo,
      montoOrigenCents,
      monedaOrigen: dto.monedaOrigen,
      tasaAplicada,
      comisionCents: BigInt(dto.comisionCents),
      totalCents: BigInt(dto.totalCents),
      montoDestinoCents,
      monedaDestino: dto.monedaDestino,
      beneficiario: dto.beneficiario,
      comprobanteUrl: dto.comprobanteUrl,
      creadaPorId,
      corredorId: dto.corredorId,
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
