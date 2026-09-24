import { Injectable } from '@nestjs/common';
import {
  Caja,
  EstadoOperacion,
  MovimientoCaja,
  Prisma,
  TipoMovimientoCaja,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  AbrirCajaDto,
  AlertaCaja,
  AnularAperturaDto,
  AnularPagoDto,
  AperturaResultado,
  CajaResultado,
  EjecutarPagoDto,
  IngresarCajaMadreDto,
  PagoResultado,
} from './cajas.dto';
import {
  CajaCorredorMismatchException,
  CajaMadreInvalidaException,
  CajaNoEncontradaException,
  CampoRequeridoException,
  MontoInvalidoException,
  MotivoRequeridoException,
  MovimientoNoAnulableException,
  MovimientoYaAnuladoException,
  OperacionNoEncontradaException,
  OperacionNoPendienteException,
  ReversoPagoNoDefinidoException,
  TasaInvalidaException,
} from './cajas.exceptions';

type Tx = Prisma.TransactionClient;

/** Fila de Caja leída con FOR UPDATE. Postgres devuelve BIGINT como bigint. */
interface CajaLock {
  id: string;
  esMadre: boolean;
  moneda: string;
  saldoCents: bigint;
}

/** Fila de Operacion leída con FOR UPDATE. */
interface OperacionLock {
  id: string;
  estado: string;
  corredorId: string | null;
}

const TX_OPTS = { timeout: 15_000 } as const;

/**
 * Tesorería: el segundo libro, aparte del de deuda. Dice cuánta plata tiene
 * TAV y dónde. Contrato: docs/08-contrato-cajas.md.
 *
 * Reglas heredadas de AGENTS.md que este servicio no rompe jamás:
 * - MovimientoCaja es de solo-inserción: cero UPDATE, cero DELETE.
 * - Toda escritura de dinero es idempotente por clientUuid.
 * - FOR UPDATE serializa, no rechaza: una caja sin fondos queda en negativo
 *   y emite alerta. Decisión del cliente.
 * - Montos en bigint de centavos. Ningún resultado en dinero sale de
 *   aritmética con Decimal.
 */
@Injectable()
export class CajaService {
  constructor(private readonly prisma: PrismaService) {}

  // ──────────────────────── INGRESO A CAJA MADRE ────────────────────────

  /** Registra una entrada de USDT (o efectivo) a la caja madre. */
  async ingresarCajaMadre(dto: IngresarCajaMadreDto): Promise<CajaResultado> {
    // Idempotencia primero: mismo clientUuid en ESTA caja → devolver el existente.
    const previo = await this.buscarPorClientUuid(dto.cajaMadreId, dto.clientUuid);
    if (previo) return this.resultadoExistente(previo);

    if (dto.montoCents <= 0n) throw new MontoInvalidoException('montoCents', dto.montoCents);
    // El precio de compra del USDT es obligatorio y debe ser > 0. Es el
    // marcador del día: cada operación congela el precio de compra vigente
    // (el del ingreso más reciente hasta la fecha de la operación).
    this.validarTasa(dto.precioCompraGyd);
    if (!dto.motivo?.trim()) throw new MotivoRequeridoException();

    const caja = await this.prisma.caja.findUnique({ where: { id: dto.cajaMadreId } });
    if (!caja) throw new CajaNoEncontradaException(dto.cajaMadreId);
    if (!caja.esMadre) throw new CajaMadreInvalidaException(dto.cajaMadreId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const madre = await this.lockCaja(tx, dto.cajaMadreId);

        // Re-verificación de idempotencia DENTRO de la transacción y DESPUÉS
        // del FOR UPDATE: dos peticiones simultáneas con el mismo uuid pueden
        // pasar ambas el check previo (misma razón que el ledger).
        const yaEnTx = await tx.movimientoCaja.findFirst({
          where: { cajaId: dto.cajaMadreId, clientUuid: dto.clientUuid },
        });
        if (yaEnTx) return this.resultadoExistenteTx(tx, yaEnTx);

        const movimientoId = randomUUID();
        const saldoDespues = madre.saldoCents + dto.montoCents;

        const movimiento = await tx.movimientoCaja.create({
          data: {
            id: movimientoId,
            cajaId: madre.id,
            tipo: TipoMovimientoCaja.ingreso,
            montoCents: dto.montoCents,
            saldoDespues,
            origenTipo: 'ingreso',
            origenId: movimientoId,
            clientUuid: dto.clientUuid,
            motivo: dto.motivo.trim(),
            precioCompraGyd: new Prisma.Decimal(dto.precioCompraGyd),
            registradoPorId: dto.registradoPorId,
          },
        });

        // El cache de saldo SOLO se escribe aquí, en la misma transacción.
        const cajaActualizada = await tx.caja.update({
          where: { id: madre.id },
          data: { saldoCents: saldoDespues },
        });

        return { caja: cajaActualizada, movimiento, yaExistia: false };
      }, TX_OPTS);
    } catch (e) {
      const existente = await this.recuperarPorUnique(e, dto.cajaMadreId, dto.clientUuid);
      if (existente) return this.resultadoExistente(existente);
      throw e;
    }
  }

  /**
   * Precio de compra del USDT vigente en una fecha dada: el del ingreso a
   * la caja madre más reciente hasta esa fecha (inclusive). Determinista:
   * si hay dos ingresos el mismo instante, el de mayor `seq` manda (el
   * último insertado). Devuelve null si no hay ningún ingreso antes de la
   * fecha — la operación se registra sin precio de compra y el reporte la
   * muestra sin margen.
   *
   * Solo busca en cajas madre (`esMadre = true`), porque el precio de compra
   * solo se registra al ingresar USDT a la caja madre.
   */
  async precioCompraVigente(fecha: Date): Promise<Prisma.Decimal | null> {
    const fila = await this.prisma.movimientoCaja.findFirst({
      where: {
        tipo: TipoMovimientoCaja.ingreso,
        creadoAt: { lte: fecha },
        caja: { esMadre: true },
        precioCompraGyd: { not: null },
      },
      orderBy: [{ creadoAt: 'desc' }, { seq: 'desc' }],
      select: { precioCompraGyd: true },
    });
    return fila?.precioCompraGyd ?? null;
  }

  // ──────────────────────── APERTURA / RECARGA ────────────────────────

  /**
   * Abre una caja de corredor convirtiendo USDT desde la caja madre.
   * Doble entrada: dos movimientos en la misma transacción.
   */
  async abrirCaja(dto: AbrirCajaDto): Promise<AperturaResultado> {
    return this.aperturaORecarga(dto, TipoMovimientoCaja.apertura);
  }

  /**
   * Idéntico a abrirCaja salvo el tipo del movimiento destino: 'recarga' es
   * un llenado posterior de una caja que ya se abrió. Misma doble entrada.
   */
  async recargarCaja(dto: AbrirCajaDto): Promise<AperturaResultado> {
    return this.aperturaORecarga(dto, TipoMovimientoCaja.recarga);
  }

  private async aperturaORecarga(
    dto: AbrirCajaDto,
    tipo: typeof TipoMovimientoCaja.apertura | typeof TipoMovimientoCaja.recarga,
  ): Promise<AperturaResultado> {
    // Idempotencia primero: mismo clientUuid en la caja DESTINO → devuelve los
    // dos movimientos existentes. (La madre lleva el mismo uuid; buscar en
    // cualquiera de las dos sirve, pero la destino es la "principal".)
    const previo = await this.buscarPorClientUuid(dto.cajaId, dto.clientUuid);
    if (previo) return this.aperturaExistente(previo);

    if (dto.montoMadreCents <= 0n)
      throw new MontoInvalidoException('montoMadreCents', dto.montoMadreCents);
    if (dto.montoDestinoCents <= 0n)
      throw new MontoInvalidoException('montoDestinoCents', dto.montoDestinoCents);
    this.validarTasa(dto.tasaConversion);

    const destino = await this.prisma.caja.findUnique({
      where: { id: dto.cajaId },
    });
    if (!destino) throw new CajaNoEncontradaException(dto.cajaId);
    if (destino.esMadre) throw new CajaMadreInvalidaException(dto.cajaId);

    const madre = await this.prisma.caja.findUnique({ where: { id: dto.cajaMadreId } });
    if (!madre || !madre.esMadre) throw new CajaMadreInvalidaException(dto.cajaMadreId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // FOR UPDATE sobre AMBAS cajas, siempre en el mismo orden para evitar
        // deadlocks: primero la madre, luego la destino.
        const madreLock = await this.lockCaja(tx, dto.cajaMadreId);
        const destinoLock = await this.lockCaja(tx, dto.cajaId);

        const yaEnTx = await tx.movimientoCaja.findFirst({
          where: { cajaId: dto.cajaId, clientUuid: dto.clientUuid },
        });
        if (yaEnTx) return this.aperturaExistenteTx(tx, yaEnTx);

        const movimientoDestinoId = randomUUID();
        const saldoDestinoDespues = destinoLock.saldoCents + dto.montoDestinoCents;
        const saldoMadreDespues = madreLock.saldoCents - dto.montoMadreCents;

        const movimientoDestino = await tx.movimientoCaja.create({
          data: {
            id: movimientoDestinoId,
            cajaId: destinoLock.id,
            tipo,
            montoCents: dto.montoDestinoCents,
            saldoDespues: saldoDestinoDespues,
            cajaMadreId: dto.cajaMadreId,
            montoMadreCents: dto.montoMadreCents,
            tasaConversion: new Prisma.Decimal(dto.tasaConversion), // congelada
            origenTipo: tipo,
            origenId: movimientoDestinoId,
            clientUuid: dto.clientUuid,
            registradoPorId: dto.registradoPorId,
          },
        });

        // Contrapartida en la madre: sin campos de conversión (desde su
        // perspectiva solo sale USDT). Mismo clientUuid que la pata destino:
        // el índice único es compuesto [cajaId, clientUuid], una por caja.
        // El vínculo entre las dos patas es origenId.
        const movimientoMadre = await tx.movimientoCaja.create({
          data: {
            cajaId: madreLock.id,
            tipo: TipoMovimientoCaja.transferencia,
            montoCents: -dto.montoMadreCents,
            saldoDespues: saldoMadreDespues,
            origenTipo: tipo,
            origenId: movimientoDestinoId,
            clientUuid: dto.clientUuid,
            registradoPorId: dto.registradoPorId,
          },
        });

        // Puede quedar en negativo: alerta, no bloqueo. No se rechaza.
        const cajaMadre = await tx.caja.update({
          where: { id: madreLock.id },
          data: { saldoCents: saldoMadreDespues },
        });
        const cajaDestino = await tx.caja.update({
          where: { id: destinoLock.id },
          data: { saldoCents: saldoDestinoDespues },
        });

        return { cajaDestino, cajaMadre, movimientoDestino, movimientoMadre, yaExistia: false };
      }, TX_OPTS);
    } catch (e) {
      const existente = await this.recuperarPorUnique(e, dto.cajaId, dto.clientUuid);
      if (existente) return this.aperturaExistente(existente);
      throw e;
    }
  }

  // ──────────────────────────── PAGO ────────────────────────────

  /**
   * El pagador marca una operación como pagada y descuenta la caja.
   *
   * El estado de la operación manda; el clientUuid no decide nada: si la
   * operación ya está pagada se devuelve el pago existente con
   * yaExistia: true, venga el uuid que venga. Darle un error al pagador tras
   * un pago que sí se ejecutó lo haría buscar pagar por otro lado.
   *
   * Doble descuento — cómo se previene:
   * - Capa 1 (la que previene): FOR UPDATE sobre la fila de la Operacion.
   *   El segundo toque espera al primero; cuando le toca ve estado='pagada'
   *   y retorna el pago existente sin tocar la caja.
   * - Capa 2 (reintentos de red): clientUuid único en MovimientoCaja.
   */
  async ejecutarPago(dto: EjecutarPagoDto): Promise<PagoResultado> {
    // Idempotencia primero (por clientUuid en la caja del pago).
    const previo = await this.buscarPorClientUuid(dto.cajaId, dto.clientUuid);
    if (previo) return this.pagoExistente(previo);

    const operacion = await this.prisma.operacion.findUnique({
      where: { id: dto.operacionId },
    });
    if (!operacion) throw new OperacionNoEncontradaException(dto.operacionId);

    if (operacion.estado === EstadoOperacion.pagada) {
      return this.pagoExistentePorOperacion(operacion.id);
    }
    if (operacion.estado !== EstadoOperacion.pendiente) {
      throw new OperacionNoPendienteException(operacion.id, operacion.estado);
    }

    const caja = await this.prisma.caja.findUnique({ where: { id: dto.cajaId } });
    if (!caja) throw new CajaNoEncontradaException(dto.cajaId);
    if (caja.esMadre) throw new CajaMadreInvalidaException(dto.cajaId);

    // La caja la determina el servicio (Corredor.cajaId), no el pagador.
    // Validamos que la caja pasada sea la que el servicio de la operación
    // referencia: caja.id === corredor.cajaId.
    if (operacion.corredorId === null) {
      throw new CajaCorredorMismatchException(dto.cajaId, dto.operacionId);
    }
    const corredor = await this.prisma.corredor.findUnique({
      where: { id: operacion.corredorId },
      select: { cajaId: true },
    });
    if (!corredor || corredor.cajaId !== caja.id) {
      throw new CajaCorredorMismatchException(dto.cajaId, dto.operacionId);
    }

    if (dto.montoCents <= 0n) throw new MontoInvalidoException('montoCents', dto.montoCents);
    if (dto.montoDestinoCents < 0n) throw new MontoInvalidoException('montoDestinoCents', dto.montoDestinoCents);
    this.validarTasa(dto.tasaEjecucion);
    if (!dto.nombreCliente?.trim()) throw new CampoRequeridoException('nombreCliente');
    if (!dto.comprobantePagoUrl?.trim()) throw new CampoRequeridoException('comprobantePagoUrl');

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Orden de locks: la Operacion primero (serializa los dos toques al
        // botón), la Caja después (serializa escrituras al saldo).
        const opLock = await this.lockOperacion(tx, dto.operacionId);
        const cajaLock = await this.lockCaja(tx, dto.cajaId);

        // Re-verifica estado bajo el lock: si otro toque ganó la carrera y ya
        // la pagó, devolver su pago. Nunca OperacionNoPendiente por 'pagada'.
        if (opLock.estado === EstadoOperacion.pagada) {
          return this.pagoExistentePorOperacionTx(tx, dto.operacionId);
        }
        if (opLock.estado !== EstadoOperacion.pendiente) {
          throw new OperacionNoPendienteException(dto.operacionId, opLock.estado);
        }

        const yaEnTx = await tx.movimientoCaja.findFirst({
          where: { cajaId: dto.cajaId, clientUuid: dto.clientUuid },
        });
        if (yaEnTx) return this.pagoExistenteTx(tx, yaEnTx);

        const saldoDespues = cajaLock.saldoCents - dto.montoCents;

        const movimiento = await tx.movimientoCaja.create({
          data: {
            cajaId: cajaLock.id,
            tipo: TipoMovimientoCaja.pago,
            montoCents: -dto.montoCents,
            saldoDespues,
            origenTipo: 'pago',
            origenId: dto.operacionId,
            clientUuid: dto.clientUuid,
            registradoPorId: dto.registradoPorId,
          },
        });

        // Puede quedar en negativo: no se rechaza, se alerta (saldo_negativo).
        const cajaActualizada = await tx.caja.update({
          where: { id: cajaLock.id },
          data: { saldoCents: saldoDespues },
        });

        // La Operacion sí se actualiza (no es el libro de movimientos):
        // estado + datos de ejecución, con la tasa congelada.
        const operacionPagada = await tx.operacion.update({
          where: { id: dto.operacionId },
          data: {
            estado: EstadoOperacion.pagada,
            pagadaAt: new Date(),
            tasaEjecucion: new Prisma.Decimal(dto.tasaEjecucion),
            formaPago: dto.formaPago?.trim() ?? null,
            nombreCliente: dto.nombreCliente.trim(),
            montoDestinoCents: dto.montoDestinoCents,
            comprobantePagoUrl: dto.comprobantePagoUrl.trim(),
            pagadaPorId: dto.registradoPorId,
          },
        });

        return {
          operacion: operacionPagada,
          caja: cajaActualizada,
          movimiento,
          yaExistia: false,
        };
      }, TX_OPTS);
    } catch (e) {
      const existente = await this.recuperarPorUnique(e, dto.cajaId, dto.clientUuid);
      if (existente) return this.pagoExistente(existente);
      throw e;
    }
  }

  // ──────────────────────────── ANULACIONES ────────────────────────────

  /**
   * Anula una apertura/recarga insertando los reversos (doble entrada al
   * revés). El movimiento original NO se toca: MovimientoCaja nunca recibe
   * UPDATE. "Ya anulado" es una consulta: existe un reverso_apertura que
   * apunta al original por origenId.
   */
  async anularApertura(
    dto: AnularAperturaDto,
  ): Promise<{ movimientoDestino: MovimientoCaja; movimientoMadre: MovimientoCaja }> {
    if (!dto.motivo?.trim()) throw new MotivoRequeridoException();

    const original = await this.prisma.movimientoCaja.findUnique({
      where: { id: dto.movimientoCajaId },
    });
    // Reutiliza la excepción con cajaId = movimientoCajaId (contrato).
    if (!original) throw new CajaNoEncontradaException(dto.movimientoCajaId);

    if (
      original.tipo !== TipoMovimientoCaja.apertura &&
      original.tipo !== TipoMovimientoCaja.recarga
    ) {
      throw new MovimientoNoAnulableException(dto.movimientoCajaId, original.tipo);
    }

    if (await this.estaAnulado(this.prisma, original.id)) {
      throw new MovimientoYaAnuladoException(original.id);
    }

    const motivo = dto.motivo.trim();

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Mismo orden de locks que abrirCaja: madre primero, destino después.
        const madreLock = await this.lockCaja(tx, original.cajaMadreId!);
        const destinoLock = await this.lockCaja(tx, original.cajaId);

        // Re-verifica bajo el lock: dos anulaciones simultáneas se serializan
        // y la segunda ve el reverso de la primera.
        if (await this.estaAnulado(tx, original.id)) {
          throw new MovimientoYaAnuladoException(original.id);
        }

        const movimientoDestino = await tx.movimientoCaja.create({
          data: {
            cajaId: destinoLock.id,
            tipo: TipoMovimientoCaja.reverso_apertura,
            montoCents: -original.montoCents,
            saldoDespues: destinoLock.saldoCents - original.montoCents,
            origenTipo: 'reverso_apertura',
            origenId: original.id,
            motivo,
            // Clave de deduplicación INTERNA (no viene del cliente), derivada
            // del origenId: convierte el índice único [cajaId, clientUuid] en
            // segunda barrera contra la doble anulación concurrente. La misma
            // clave sirve para ambas patas porque van en cajas distintas.
            clientUuid: `${original.id}:reverso`,
            registradoPorId: dto.actorId,
          },
        });

        const movimientoMadre = await tx.movimientoCaja.create({
          data: {
            cajaId: madreLock.id,
            tipo: TipoMovimientoCaja.reverso_apertura,
            montoCents: original.montoMadreCents!,
            saldoDespues: madreLock.saldoCents + original.montoMadreCents!,
            origenTipo: 'reverso_apertura',
            origenId: original.id,
            motivo,
            clientUuid: `${original.id}:reverso`,
            registradoPorId: dto.actorId,
          },
        });

        // Ambos saldos pueden quedar en negativo: no se rechaza.
        await tx.caja.update({
          where: { id: destinoLock.id },
          data: { saldoCents: destinoLock.saldoCents - original.montoCents },
        });
        await tx.caja.update({
          where: { id: madreLock.id },
          data: { saldoCents: madreLock.saldoCents + original.montoMadreCents! },
        });

        return { movimientoDestino, movimientoMadre };
      }, TX_OPTS);
    } catch (e) {
      // Carrera de doble anulación: el clientUuid derivado chocó con el
      // reverso que otra transacción ya insertó.
      if (this.esUniqueViolation(e)) throw new MovimientoYaAnuladoException(original.id);
      throw e;
    }
  }

  /**
   * // PENDIENTE DE DEFINIR: anular un pago ya ejecutado.
   * // El reverso de la deuda del cajero es claro (ya existe anular operación),
   * // pero el de la caja no: ¿vuelve la plata a la caja? Iván no ha respondido.
   */
  async anularPago(dto: AnularPagoDto): Promise<never> {
    throw new ReversoPagoNoDefinidoException(dto.movimientoCajaId);
  }

  // ──────────────────────────── LECTURAS ────────────────────────────

  async obtenerCaja(cajaId: string): Promise<Caja> {
    const caja = await this.prisma.caja.findUnique({ where: { id: cajaId } });
    if (!caja) throw new CajaNoEncontradaException(cajaId);
    return caja;
  }

  /** Todas las cajas (madre y de corredor), incluidas las de corredores desactivados. */
  async listarCajas(): Promise<Caja[]> {
    return this.prisma.caja.findMany({ orderBy: { creadaAt: 'asc' } });
  }

  async saldoCaja(cajaId: string): Promise<{ saldoCents: bigint; moneda: string }> {
    const caja = await this.obtenerCaja(cajaId);
    return { saldoCents: caja.saldoCents, moneda: caja.moneda };
  }

  /**
   * Movimientos de una caja, ordenados por seq descendente (más reciente
   * primero). Paginado. Para el historial del tablero de cajas.
   */
  async movimientosCaja(
    cajaId: string,
    page = 1,
    limit = 20,
  ): Promise<{ items: MovimientoCaja[]; total: number; page: number; limit: number }> {
    await this.obtenerCaja(cajaId); // valida que exista
    const where = { cajaId };
    const [items, total] = await Promise.all([
      this.prisma.movimientoCaja.findMany({
        where,
        orderBy: { seq: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.movimientoCaja.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  /**
   * Alertas activas. Una caja en negativo genera saldo_negativo pero NO
   * saldo_bajo: el negativo es más urgente y tiene su propio cartel.
   * Sin umbralAlertaCents no hay alerta de saldo bajo (sí de negativo).
   */
  async alertasCaja(): Promise<AlertaCaja[]> {
    const cajas = await this.prisma.caja.findMany({
      orderBy: { creadaAt: 'asc' },
    });

    const alertas: AlertaCaja[] = [];
    for (const caja of cajas) {
      if (caja.saldoCents < 0n) {
        alertas.push({
          cajaId: caja.id,
          tipo: 'saldo_negativo',
          saldoCents: caja.saldoCents,
          umbralAlertaCents: caja.umbralAlertaCents,
          moneda: caja.moneda,
          cajaNombre: caja.nombre,
        });
      } else if (
        caja.umbralAlertaCents !== null &&
        caja.saldoCents > 0n &&
        caja.saldoCents <= caja.umbralAlertaCents
      ) {
        alertas.push({
          cajaId: caja.id,
          tipo: 'saldo_bajo',
          saldoCents: caja.saldoCents,
          umbralAlertaCents: caja.umbralAlertaCents,
          moneda: caja.moneda,
          cajaNombre: caja.nombre,
        });
      }
    }
    return alertas;
  }

  // ──────────────────────────── HELPERS ────────────────────────────

  /**
   * Bloquea la fila de la caja. Punto de serialización de toda escritura
   * contra esa caja. Prisma no expone FOR UPDATE, de ahí el raw SQL.
   */
  private async lockCaja(tx: Tx, cajaId: string): Promise<CajaLock> {
    const rows = await tx.$queryRaw<CajaLock[]>`
      SELECT "id", "esMadre", "moneda", "saldoCents"
      FROM "Caja"
      WHERE "id" = ${cajaId}
      FOR UPDATE
    `;
    if (rows.length === 0) throw new CajaNoEncontradaException(cajaId);
    return rows[0];
  }

  /** Bloquea la fila de la operación: serializa los dos toques al botón de pagar. */
  private async lockOperacion(tx: Tx, operacionId: string): Promise<OperacionLock> {
    const rows = await tx.$queryRaw<OperacionLock[]>`
      SELECT "id", "estado"::text AS "estado", "corredorId"
      FROM "Operacion"
      WHERE "id" = ${operacionId}
      FOR UPDATE
    `;
    if (rows.length === 0) throw new OperacionNoEncontradaException(operacionId);
    return rows[0];
  }

  /** La tasa debe ser numérica y > 0. Nunca participa en aritmética de dinero aquí. */
  private validarTasa(valor: string): void {
    let tasa: Prisma.Decimal;
    try {
      tasa = new Prisma.Decimal(valor);
    } catch {
      throw new TasaInvalidaException(valor);
    }
    if (!tasa.isFinite() || tasa.lte(0)) throw new TasaInvalidaException(valor);
  }

  /** Un movimiento está anulado si existe un reverso que lo apunta por origenId. */
  private async estaAnulado(
    db: Tx | PrismaService,
    movimientoId: string,
  ): Promise<boolean> {
    const reverso = await db.movimientoCaja.findFirst({
      where: { origenTipo: 'reverso_apertura', origenId: movimientoId },
      select: { id: true },
    });
    return reverso !== null;
  }

  /**
   * Busca un movimiento por (cajaId, clientUuid). La unicidad es por caja
   * (`@@unique([cajaId, clientUuid])`): una apertura tiene dos filas con el
   * mismo uuid (destino y madre, cada una en su caja); para el camino
   * idempotente se busca en la caja relevante y los reconstructores resuelven
   * la otra pata por origenId.
   */
  private async buscarPorClientUuid(
    cajaId: string,
    clientUuid: string,
  ): Promise<MovimientoCaja | null> {
    return this.prisma.movimientoCaja.findFirst({ where: { cajaId, clientUuid } });
  }

  // ── Reconstrucción de resultados a partir de un movimiento existente ──
  // (camino idempotente: cero escrituras, se devuelve lo que ya está)

  private async resultadoExistente(movimiento: MovimientoCaja): Promise<CajaResultado> {
    return this.resultadoExistenteTx(this.prisma, movimiento);
  }

  private async resultadoExistenteTx(
    db: Tx | PrismaService,
    movimiento: MovimientoCaja,
  ): Promise<CajaResultado> {
    const caja = await db.caja.findUniqueOrThrow({ where: { id: movimiento.cajaId } });
    return { caja, movimiento, yaExistia: true };
  }

  private async aperturaExistente(movimiento: MovimientoCaja): Promise<AperturaResultado> {
    return this.aperturaExistenteTx(this.prisma, movimiento);
  }

  /**
   * El clientUuid puede corresponder al movimiento destino (uuid original) —
   * el caso normal. Los dos movimientos están vinculados por origenId.
   */
  private async aperturaExistenteTx(
    db: Tx | PrismaService,
    movimiento: MovimientoCaja,
  ): Promise<AperturaResultado> {
    const movimientoDestino =
      movimiento.tipo === TipoMovimientoCaja.transferencia
        ? await db.movimientoCaja.findFirstOrThrow({
            where: { id: movimiento.origenId },
          })
        : movimiento;
    const movimientoMadre = await db.movimientoCaja.findFirstOrThrow({
      where: {
        origenId: movimientoDestino.id,
        tipo: TipoMovimientoCaja.transferencia,
      },
    });
    const [cajaDestino, cajaMadre] = await Promise.all([
      db.caja.findUniqueOrThrow({ where: { id: movimientoDestino.cajaId } }),
      db.caja.findUniqueOrThrow({ where: { id: movimientoMadre.cajaId } }),
    ]);
    return { cajaDestino, cajaMadre, movimientoDestino, movimientoMadre, yaExistia: true };
  }

  private async pagoExistente(movimiento: MovimientoCaja): Promise<PagoResultado> {
    return this.pagoExistenteTx(this.prisma, movimiento);
  }

  private async pagoExistenteTx(
    db: Tx | PrismaService,
    movimiento: MovimientoCaja,
  ): Promise<PagoResultado> {
    // En un movimiento de pago, origenId es la operación pagada.
    const [operacion, caja] = await Promise.all([
      db.operacion.findUniqueOrThrow({ where: { id: movimiento.origenId } }),
      db.caja.findUniqueOrThrow({ where: { id: movimiento.cajaId } }),
    ]);
    return { operacion, caja, movimiento, yaExistia: true };
  }

  /**
   * La operación ya está pagada (por este u otro clientUuid): se devuelve el
   * pago existente completo. El pagador tocó dos veces porque no vio
   * respuesta; devolver un error tras un pago que sí se ejecutó lo haría
   * buscar pagar por otro lado.
   */
  private async pagoExistentePorOperacion(operacionId: string): Promise<PagoResultado> {
    return this.pagoExistentePorOperacionTx(this.prisma, operacionId);
  }

  private async pagoExistentePorOperacionTx(
    db: Tx | PrismaService,
    operacionId: string,
  ): Promise<PagoResultado> {
    const movimiento = await db.movimientoCaja.findFirstOrThrow({
      where: { origenTipo: 'pago', origenId: operacionId, tipo: TipoMovimientoCaja.pago },
    });
    return this.pagoExistenteTx(db, movimiento);
  }

  private esUniqueViolation(e: unknown): boolean {
    return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
  }

  /** Si el error fue un choque del índice único de (cajaId, clientUuid), recupera el ganador. */
  private async recuperarPorUnique(
    e: unknown,
    cajaId: string,
    clientUuid: string,
  ): Promise<MovimientoCaja | null> {
    if (!this.esUniqueViolation(e)) return null;
    return this.buscarPorClientUuid(cajaId, clientUuid);
  }
}
