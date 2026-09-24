import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { SemaforoService } from '../ledger/semaforo.service';
import { PrecioCajeroService } from '../precio-cajero/precio-cajero.service';
import { CajaService } from '../cajas/caja.service';
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
    private readonly precioCajero: PrecioCajeroService,
    private readonly cajas: CajaService,
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
   * Servicios ofrecibles al cajero: activos para los que el cajero tiene un
   * precio fijado. Devuelve id, país, moneda, forma de entrega, servicio y
   * `precioGyd` (lo que el cajero necesita ver y lo que se congela en la
   * operación). NUNCA margen ni patas: ese concepto dejó de existir.
   *
   * Un servicio activo sin precio para este cajero no aparece: no puede
   * operarlo hasta que el admin le fije precio.
   */
  async corredores(cajeroId: string) {
    return this.precioCajero.serviciosOfrecibles(cajeroId);
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
        include: { corredor: true },
      }),
      this.prisma.operacion.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * Crea una operación llamando a LedgerService.registrarOperacion.
   * cajeroId y creadaPorId salen del JWT, no del body.
   *
   * El precio NO viene del cliente: el servidor lee el precio vigente del
   * cajero para ese servicio (PrecioCajeroService.precioVigente), lo congela
   * en la operación como `tasaAplicada`, y calcula la deuda en GYD con
   * `calcularDeudaGydCents` (Decimal + ROUND_HALF_UP). Igual que antes se
   * congelaba la tasa compuesta; ahora se congela el precio GYD/USD.
   *
   * PASO 1 (transitorio): la deuda (`totalCents`) todavía la manda el cliente
   * y el monto destino no se calcula aquí (el precio es GYD/USD, no GYD→moneda
   * destino). El monto destino lo registra el pagador al ejecutar (paso 4).
   * La operación en dólares: el cajero entra dólares y nada más. La deuda
   * la calcula el servidor con el precio vigente del cajero y la congela en
   * `tasaAplicada`. `comisionCents` dejó de existir: la comisión va dentro
   * del precio.
   *
   * Si el precio cambió entre que el cajero abrió la pantalla y confirmó,
   * se aplica el vigente al confirmar. La respuesta devuelve la operación
   * con el precio real para que la app lo muestre.
   */
  async crearOperacion(cajeroId: string, creadaPorId: string, dto: CrearOperacionDto) {
    // Leer el precio vigente del cajero para ese servicio. NUNCA del cliente.
    const precioGyd = await this.precioCajero.precioVigente(cajeroId, dto.corredorId);
    if (!precioGyd) {
      throw new NoEncontradoException('precio', `${cajeroId}/${dto.corredorId}`);
    }

    // El precio se congela como tasaAplicada (mismo mecanismo que antes).
    const tasaAplicada = precioGyd.toString();

    // La deuda la calcula el servidor, no el cliente:
    //   totalCents = round_half_up(montoOrigenCents × precioGyd)
    // 100 USD a 240 = 10000 cents × 240 = 2.400.000 cents = 24.000 GYD.
    const montoOrigenCents = BigInt(dto.montoOrigenCents);
    const totalCents = PrecioCajeroService.calcularDeudaGydCents(montoOrigenCents, precioGyd);

    // La moneda destino la deriva el servidor del servicio (Corredor.moneda).
    // El monto destino lo registra el pagador al ejecutar (paso 4): aquí va 0.
    const corredor = await this.prisma.corredor.findUnique({
      where: { id: dto.corredorId },
      select: { moneda: true },
    });
    if (!corredor) throw new NoEncontradoException('servicio', dto.corredorId);
    const monedaDestino = corredor.moneda;
    const montoDestinoCents = 0n;

    // Precio de compra del USDT vigente al registrar la operación: el del
    // ingreso a la caja madre más reciente hasta ahora. Nullable si no hay
    // ningún ingreso antes de esta operación — el reporte la muestra sin
    // margen. Determinista: si hay dos ingresos el mismo instante, el de
    // mayor seq manda (ver CajaService.precioCompraVigente).
    const precioCompraGyd = await this.cajas.precioCompraVigente(new Date());

    return this.ledger.registrarOperacion({
      clientUuid: dto.clientUuid,
      cajeroId,
      montoOrigenCents,
      monedaOrigen: 'USD',
      tasaAplicada,
      totalCents,
      montoDestinoCents,
      monedaDestino,
      beneficiario: dto.beneficiario,
      comprobanteUrl: dto.comprobanteUrl,
      precioCompraGyd: precioCompraGyd?.toString() ?? null,
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
