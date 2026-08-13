import { Injectable } from '@nestjs/common';
import {
  Cierre,
  Cobro,
  EstadoAmpliacion,
  EstadoOperacion,
  Operacion,
  Prisma,
  TipoMovimiento,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegistrarCobroDto, RegistrarOperacionDto } from './ledger.dto';
import {
  CajeroNoValidoException,
  CierreNoAbiertoException,
  CobradorNoValidoException,
  MotivoRequeridoException,
  NoEncontradoException,
  SinCupoException,
  TasaRequeridaException,
  YaAnuladoException,
} from './ledger.exceptions';
import { fechaCaracasHoy } from './fecha-caracas';

type Tx = Prisma.TransactionClient;

/** Fila de PerfilCajero leída con FOR UPDATE. Postgres devuelve BIGINT como bigint. */
interface PerfilLock {
  usuarioId: string;
  limiteCents: bigint;
  saldoCents: bigint;
  deudaDesde: Date | null;
}

const TX_OPTS = { timeout: 15_000 } as const;

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  // ────────────────────────── OPERACIÓN (cargo) ──────────────────────────

  /**
   * Registra una operación que consume cupo. Transacción A de docs/02.
   *
   * Concurrencia: el `SELECT ... FOR UPDATE` sobre la fila del cajero va ANTES
   * de leer saldo, límite y ampliación. Serializa todas las escrituras de dinero
   * de ese cajero: sin él, dos operaciones simultáneas leerían el mismo saldo,
   * ambas pasarían el chequeo de cupo y el cajero quedaría sobregirado.
   * Como la ampliación solo se lee/consume con este lock en mano, tampoco
   * pueden dos operaciones consumir la misma ampliación.
   */
  async registrarOperacion(
    dto: RegistrarOperacionDto,
  ): Promise<{ operacion: Operacion; yaExistia: boolean }> {
    // Validación de identidad ANTES de la transacción. cajeroId es un valor
    // que no cambia durante la petición: no hay carrera que proteger, y así
    // no se alarga la sección crítica bajo el FOR UPDATE. Si el cajero no
    // existe, no tiene sentido ni siquiera mirar la idempotencia.
    await this.validarCajero(dto.cajeroId);

    // Idempotencia: mismo clientUuid → devolver el existente, no crear nada.
    const previa = await this.prisma.operacion.findUnique({
      where: { clientUuid: dto.clientUuid },
    });
    if (previa) return { operacion: previa, yaExistia: true };

    try {
      const { operacion, yaExistia } = await this.prisma.$transaction(async (tx) => {
        const perfil = await this.lockPerfil(tx, dto.cajeroId);

        // Re-verificación de idempotencia DENTRO de la transacción y DESPUÉS
        // del FOR UPDATE. El chequeo de afuera no basta bajo concurrencia:
        // dos peticiones con el mismo clientUuid pueden pasar ambas el check
        // previo (ninguna ve todavía la operación de la otra). Sin esta
        // re-lectura, la segunda llegaría al chequeo de cupo con el saldo ya
        // subido por la primera y recibiría SIN_CUPO, cuando el contrato dice
        // que un duplicado nunca debe recibir ese error — es el mismo intento
        // lógico y debe devolver el registro existente.
        const yaEnTx = await tx.operacion.findUnique({
          where: { clientUuid: dto.clientUuid },
        });
        if (yaEnTx) return { operacion: yaEnTx, yaExistia: true as const };

        // Ampliación aprobada y no consumida (si existe). Leerla DESPUÉS del
        // FOR UPDATE garantiza que solo una operación concurrente puede verla
        // como "aprobada" y consumirla.
        const ampliacion = await tx.ampliacionCredito.findFirst({
          where: { cajeroId: dto.cajeroId, estado: EstadoAmpliacion.aprobada },
          orderBy: { resueltaAt: 'asc' },
        });

        const disponibleBase = perfil.limiteCents - perfil.saldoCents;
        const extra = ampliacion?.montoCents ?? 0n;
        const disponible = disponibleBase + extra;

        if (dto.totalCents > disponible) {
          // Lanzar dentro de la transacción la aborta: no queda rastro.
          throw new SinCupoException({
            disponible,
            requerido: dto.totalCents,
            faltante: dto.totalCents - disponible,
          });
        }

        // La ampliación se consume solo si la operación NO cabía en el límite base.
        const usaAmpliacion = ampliacion !== null && dto.totalCents > disponibleBase;

        const folio = await this.nextFolio(tx, 'folio_operacion_seq', 'TAV');
        const saldoDespues = perfil.saldoCents + dto.totalCents;

        const operacion = await tx.operacion.create({
          data: {
            folio,
            clientUuid: dto.clientUuid,
            cajeroId: dto.cajeroId,
            tipo: dto.tipo,
            montoOrigenCents: dto.montoOrigenCents,
            monedaOrigen: dto.monedaOrigen,
            tasaAplicada: new Prisma.Decimal(dto.tasaAplicada), // tasa congelada
            comisionCents: dto.comisionCents,
            totalCents: dto.totalCents,
            montoDestinoCents: dto.montoDestinoCents,
            monedaDestino: dto.monedaDestino,
            beneficiario: dto.beneficiario as unknown as Prisma.InputJsonValue,
            comprobanteUrl: dto.comprobanteUrl,
            ampliacionId: usaAmpliacion ? ampliacion!.id : null,
            creadaPorId: dto.creadaPorId,
          },
        });

        await tx.movimiento.create({
          data: {
            cajeroId: dto.cajeroId,
            tipo: TipoMovimiento.cargo,
            montoUsdCents: dto.totalCents,
            saldoDespues,
            origenTipo: 'operacion',
            origenId: operacion.id,
            registradoPorId: dto.creadaPorId,
          },
        });

        // El cache de saldo SOLO se escribe aquí, en la misma transacción del movimiento.
        await tx.perfilCajero.update({
          where: { usuarioId: dto.cajeroId },
          data: {
            saldoCents: saldoDespues,
            deudaDesde: perfil.deudaDesde ?? new Date(),
          },
        });

        if (usaAmpliacion) {
          await tx.ampliacionCredito.update({
            where: { id: ampliacion!.id },
            data: { estado: EstadoAmpliacion.consumida },
          });
        }

        return { operacion, yaExistia: false as const };
      }, TX_OPTS);

      return { operacion, yaExistia };
    } catch (e) {
      // Carrera de idempotencia: dos peticiones con el mismo clientUuid entraron
      // a la vez y una perdió por el índice único. Devolver la que ganó.
      const existente = await this.recuperarPorUnique(e, () =>
        this.prisma.operacion.findUnique({ where: { clientUuid: dto.clientUuid } }),
      );
      if (existente) return { operacion: existente, yaExistia: true };
      throw e;
    }
  }

  // ─────────────────────────── COBRO (abono) ───────────────────────────

  /**
   * Registra un cobro que baja la deuda. Transacción B de docs/02.
   *
   * Orden de locks: primero la fila del cajero, después la del cierre.
   * Todas las transacciones de dinero adquieren en ese mismo orden, así que
   * no hay ciclo posible de deadlock. El lock del cierre previene esta carrera:
   * dos cobros del mismo cobrador (a cajeros distintos) recalculan los totales
   * del cierre a la vez; sin el lock, bajo READ COMMITTED cada uno sumaría sin
   * ver el cobro del otro y el último en escribir dejaría el total incompleto.
   */
  async registrarCobro(dto: RegistrarCobroDto): Promise<{ cobro: Cobro; yaExistia: boolean }> {
    // Validación de identidad ANTES de la transacción. cajeroId y cobradorId
    // son valores que no cambian durante la petición: no hay carrera que
    // proteger, y así no se alarga la sección crítica bajo el FOR UPDATE.
    // Se hace antes de la idempotencia para que un identificador inválido
    // nunca devuelva un registro existente como si nada estuviera mal.
    await this.validarCajero(dto.cajeroId);
    if (dto.cobradorId) await this.validarCobrador(dto.cobradorId);

    // Idempotencia ANTES que nada: el cobrador sin señal reintenta, y el mismo
    // clientUuid jamás puede descontar la deuda dos veces.
    const previo = await this.prisma.cobro.findUnique({
      where: { clientUuid: dto.clientUuid },
    });
    if (previo) return { cobro: previo, yaExistia: true };

    const montoUsdCents = this.convertirAUsd(dto);
    const esEfectivo = dto.metodo === 'efectivo_usd';

    try {
      const { cobro, yaExistia } = await this.prisma.$transaction(async (tx) => {
        const perfil = await this.lockPerfil(tx, dto.cajeroId);

        // Re-verificación de idempotencia DENTRO de la transacción y DESPUÉS
        // del FOR UPDATE. Misma razón que en registrarOperacion: el chequeo
        // de afuera no basta bajo concurrencia — dos peticiones con el mismo
        // clientUuid pueden pasar ambas el check previo. Sin esta re-lectura,
        // la segunda intentaría insertar y chocaría con el índice único,
        // abortando la transacción (en Postgres no se puede atrapar y
        // continuar). Re-verificar bajo el lock devuelve el existente limpio.
        const yaEnTx = await tx.cobro.findUnique({
          where: { clientUuid: dto.clientUuid },
        });
        if (yaEnTx) return { cobro: yaEnTx, yaExistia: true as const };

        // Cierre abierto del cobrador para HOY en America/Caracas (no UTC:
        // un cobro a las 9pm de Caracas ya es "mañana" en UTC y caería en
        // el cierre equivocado). Si lo registró el admin, no hay cierre.
        let cierre: Cierre | null = null;
        if (dto.cobradorId) {
          cierre = await this.obtenerCierreAbierto(tx, dto.cobradorId);
        }

        const folio = await this.nextFolio(tx, 'folio_cobro_seq', 'COB');
        const saldoDespues = perfil.saldoCents - montoUsdCents;

        const cobro = await tx.cobro.create({
          data: {
            folio,
            clientUuid: dto.clientUuid,
            cajeroId: dto.cajeroId,
            cobradorId: dto.cobradorId ?? null,
            metodo: dto.metodo,
            montoCents: dto.montoCents,
            moneda: dto.moneda,
            tasaAplicada: dto.moneda === 'BS' ? new Prisma.Decimal(dto.tasaAplicada!) : null,
            montoUsdCents,
            esEfectivo,
            cierreId: cierre?.id ?? null,
            comprobanteUrl: dto.comprobanteUrl,
            nota: dto.nota,
            sincronizadoAt: new Date(),
          },
        });

        await tx.movimiento.create({
          data: {
            cajeroId: dto.cajeroId,
            tipo: TipoMovimiento.abono,
            montoUsdCents: -montoUsdCents,
            saldoDespues,
            origenTipo: 'cobro',
            origenId: cobro.id,
            registradoPorId: dto.registradoPorId,
          },
        });

        await tx.perfilCajero.update({
          where: { usuarioId: dto.cajeroId },
          data: {
            saldoCents: saldoDespues,
            // Si la deuda quedó saldada (o a favor), el reloj de días se apaga.
            deudaDesde: saldoDespues <= 0n ? null : perfil.deudaDesde,
          },
        });

        if (cierre) await this.recalcularCierre(tx, cierre.id);

        return { cobro, yaExistia: false as const };
      }, TX_OPTS);

      return { cobro, yaExistia };
    } catch (e) {
      const existente = await this.recuperarPorUnique(e, () =>
        this.prisma.cobro.findUnique({ where: { clientUuid: dto.clientUuid } }),
      );
      if (existente) return { cobro: existente, yaExistia: true };
      throw e;
    }
  }

  // ─────────────────────────── ANULACIÓN ───────────────────────────

  /**
   * Anular NUNCA borra. Inserta el movimiento de reverso, marca el original
   * como anulado (visible para siempre) y recalcula el cierre si aplica.
   *
   * Mismo lock y mismo orden que las otras dos transacciones: la fila del
   * cajero primero. La carrera que previene: anular mientras entra una
   * operación nueva — sin el lock, ambas leerían el mismo saldo y una de las
   * dos escribiría un `saldoDespues` que no corresponde a la suma del libro.
   */
  async anular(
    tipo: 'operacion' | 'cobro',
    id: string,
    motivo: string,
    actorId: string,
  ): Promise<Operacion | Cobro> {
    if (!motivo?.trim()) throw new MotivoRequeridoException();
    return tipo === 'operacion'
      ? this.anularOperacion(id, motivo.trim(), actorId)
      : this.anularCobro(id, motivo.trim(), actorId);
  }

  private async anularOperacion(id: string, motivo: string, actorId: string): Promise<Operacion> {
    return this.prisma.$transaction(async (tx) => {
      const op = await tx.operacion.findUnique({ where: { id } });
      if (!op) throw new NoEncontradoException('operacion', id);
      if (op.anuladaAt) throw new YaAnuladoException('operacion', id);

      // El lock va después de localizar el registro (solo lecturas hasta aquí)
      // pero antes de tocar saldo. Releemos el estado de anulación DESPUÉS del
      // lock: dos anulaciones concurrentes del mismo registro se serializan
      // sobre la fila del cajero, y la segunda ve `anuladaAt` ya escrito.
      const perfil = await this.lockPerfil(tx, op.cajeroId);
      const opLocked = await tx.operacion.findUniqueOrThrow({ where: { id } });
      if (opLocked.anuladaAt) throw new YaAnuladoException('operacion', id);

      const saldoDespues = perfil.saldoCents - op.totalCents;

      await tx.movimiento.create({
        data: {
          cajeroId: op.cajeroId,
          tipo: TipoMovimiento.reverso_cargo,
          montoUsdCents: -op.totalCents,
          saldoDespues,
          origenTipo: 'operacion',
          origenId: op.id,
          motivo,
          registradoPorId: actorId,
        },
      });

      const anulada = await tx.operacion.update({
        where: { id },
        data: {
          estado: EstadoOperacion.anulada,
          anuladaAt: new Date(),
          anuladaPorId: actorId,
          motivoAnulacion: motivo,
        },
      });

      await tx.perfilCajero.update({
        where: { usuarioId: op.cajeroId },
        data: {
          saldoCents: saldoDespues,
          // Si el reverso saldó la deuda, se apaga el reloj. Si queda deuda,
          // deudaDesde se conserva aunque el cargo anulado fuera el más viejo.
          // PENDIENTE DE DEFINIR: si debería recalcularse al cargo vivo más
          // antiguo; hoy se mantiene el valor existente (criterio conservador).
          deudaDesde: saldoDespues <= 0n ? null : perfil.deudaDesde,
        },
      });

      // PENDIENTE DE DEFINIR: si la operación consumió una ampliación, ¿vuelve
      // a "aprobada" al anular? Hoy la ampliación queda consumida.

      return anulada;
    }, TX_OPTS);
  }

  private async anularCobro(id: string, motivo: string, actorId: string): Promise<Cobro> {
    return this.prisma.$transaction(async (tx) => {
      const cobro = await tx.cobro.findUnique({ where: { id } });
      if (!cobro) throw new NoEncontradoException('cobro', id);
      if (cobro.anuladoAt) throw new YaAnuladoException('cobro', id);

      const perfil = await this.lockPerfil(tx, cobro.cajeroId);
      const cobroLocked = await tx.cobro.findUniqueOrThrow({ where: { id } });
      if (cobroLocked.anuladoAt) throw new YaAnuladoException('cobro', id);

      const saldoDespues = perfil.saldoCents + cobro.montoUsdCents;

      await tx.movimiento.create({
        data: {
          cajeroId: cobro.cajeroId,
          tipo: TipoMovimiento.reverso_abono,
          montoUsdCents: cobro.montoUsdCents,
          saldoDespues,
          origenTipo: 'cobro',
          origenId: cobro.id,
          motivo,
          registradoPorId: actorId,
        },
      });

      const anulado = await tx.cobro.update({
        where: { id },
        data: { anuladoAt: new Date(), anuladoPorId: actorId, motivoAnulacion: motivo },
      });

      await tx.perfilCajero.update({
        where: { usuarioId: cobro.cajeroId },
        data: {
          saldoCents: saldoDespues,
          // Si el reverso revive la deuda y el reloj estaba apagado, se
          // enciende ahora. No se conoce la fecha del cargo original sin
          // recorrer el libro; se usa el momento del reverso.
          // PENDIENTE DE DEFINIR: si debería retrotraerse al cargo más viejo.
          deudaDesde:
            saldoDespues > 0n ? (perfil.deudaDesde ?? new Date()) : perfil.deudaDesde,
        },
      });

      if (cobro.cierreId) await this.recalcularCierre(tx, cobro.cierreId);

      return anulado;
    }, TX_OPTS);
  }

  // ─────────────────────────── HELPERS ───────────────────────────

  /**
   * Comprueba que cajeroId corresponde a un PerfilCajero existente. Se llama
   * ANTES de abrir la transacción: es un valor que no cambia durante la
   * petición, no hay carrera que proteger, y así no se alarga la sección
   * crítica bajo el FOR UPDATE. Sin esto, un cajeroId inexistente revienta
   * con un error crudo de Prisma (P2003/P2010) que la capa HTTP no sabe
   * mapear limpiamente.
   */
  private async validarCajero(cajeroId: string): Promise<void> {
    const existe = await this.prisma.perfilCajero.findUnique({
      where: { usuarioId: cajeroId },
      select: { usuarioId: true },
    });
    if (!existe) throw new CajeroNoValidoException(cajeroId);
  }

  /**
   * Comprueba que cobradorId corresponde a un PerfilCobrador existente.
   * Misma rationale que validarCajero: validación previa a la tx.
   */
  private async validarCobrador(cobradorId: string): Promise<void> {
    const existe = await this.prisma.perfilCobrador.findUnique({
      where: { usuarioId: cobradorId },
      select: { usuarioId: true },
    });
    if (!existe) throw new CobradorNoValidoException(cobradorId);
  }

  /**
   * Bloquea la fila del cajero. Es el punto de serialización de TODA escritura
   * de dinero de ese cajero: quien la tenga es el único que puede leer un saldo
   * y escribir el siguiente. Prisma no expone FOR UPDATE, de ahí el raw SQL.
   */
  private async lockPerfil(tx: Tx, cajeroId: string): Promise<PerfilLock> {
    const rows = await tx.$queryRaw<PerfilLock[]>`
      SELECT "usuarioId", "limiteCents", "saldoCents", "deudaDesde"
      FROM "PerfilCajero"
      WHERE "usuarioId" = ${cajeroId}
      FOR UPDATE
    `;
    if (rows.length === 0) throw new NoEncontradoException('cajero', cajeroId);
    return rows[0];
  }

  /**
   * Devuelve el cierre de HOY (fecha Caracas) del cobrador, bloqueado con
   * FOR UPDATE, creándolo si no existe. Debe llamarse con el lock del cajero
   * ya adquirido (ver orden de locks en registrarCobro).
   */
  private async obtenerCierreAbierto(tx: Tx, cobradorId: string): Promise<Cierre> {
    const fecha = fechaCaracasHoy();
    // La fecha viaja como texto "YYYY-MM-DD": si se pasara como timestamptz,
    // el cast a date usaría la zona horaria del servidor Postgres y podría
    // caer en el día equivocado.
    const ymd = fecha.toISOString().slice(0, 10);

    // INSERT ... ON CONFLICT nunca lanza error y siempre devuelve la fila
    // (la que creamos o la que ya existía). En Postgres, atrapar una
    // violación de índice único y continuar en la misma transacción es
    // imposible: el error aborta la transacción y todo comando posterior
    // falla con "current transaction is aborted". El
    // SET "cobradorId" = EXCLUDED."cobradorId" es un no-op que solo existe
    // para que RETURNING devuelva la fila también en el camino del DO UPDATE
    // (con DO NOTHING, RETURNING no devuelve nada sobre la fila existente).
    const creada = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "Cierre" ("id", "cobradorId", "fecha", "totalRegistradoCents", "efectivoDeclaradoCents", "digitalCents", "estado")
      VALUES (gen_random_uuid(), ${cobradorId}, ${ymd}::date, 0, 0, 0, 'abierto')
      ON CONFLICT ("cobradorId", "fecha") DO UPDATE
        SET "cobradorId" = EXCLUDED."cobradorId"
      RETURNING "id"
    `;

    // Ahora tomamos el FOR UPDATE sobre la fila resuelta (creada o existente).
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Cierre"
      WHERE "id" = ${creada[0].id}
      FOR UPDATE
    `;

    const cierre = await tx.cierre.findUniqueOrThrow({ where: { id: locked[0].id } });
    if (cierre.estado !== 'abierto') {
      // PENDIENTE DE DEFINIR: qué pasa con un cobro tardío cuando el cierre de
      // hoy ya fue enviado. Hoy se rechaza; meterlo en silencio alteraría un
      // total que el cobrador ya declaró.
      throw new CierreNoAbiertoException(cierre.id, cierre.estado);
    }
    return cierre;
  }

  /** Totales del cierre derivados de sus cobros vivos. Requiere el lock del cierre. */
  private async recalcularCierre(tx: Tx, cierreId: string): Promise<void> {
    const [total, digital] = await Promise.all([
      tx.cobro.aggregate({
        where: { cierreId, anuladoAt: null },
        _sum: { montoUsdCents: true },
      }),
      tx.cobro.aggregate({
        where: { cierreId, anuladoAt: null, esEfectivo: false },
        _sum: { montoUsdCents: true },
      }),
    ]);
    await tx.cierre.update({
      where: { id: cierreId },
      data: {
        totalRegistradoCents: total._sum.montoUsdCents ?? 0n,
        digitalCents: digital._sum.montoUsdCents ?? 0n,
      },
    });
  }

  /**
   * Conversión a USD con la tasa congelada del cobro. La división usa Decimal
   * (la tasa no es dinero) y el resultado vuelve a centavos enteros con
   * redondeo half-up. El único punto del módulo donde hay aritmética no entera.
   */
  private convertirAUsd(dto: RegistrarCobroDto): bigint {
    if (dto.moneda !== 'BS') return dto.montoCents;
    if (!dto.tasaAplicada) throw new TasaRequeridaException();
    const tasa = new Prisma.Decimal(dto.tasaAplicada);
    if (tasa.lte(0)) throw new TasaRequeridaException();
    return BigInt(
      new Prisma.Decimal(dto.montoCents.toString())
        .div(tasa)
        .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
        .toFixed(0),
    );
  }

  /** Folios desde secuencias de Postgres, nunca contando filas. */
  private async nextFolio(tx: Tx, seq: string, prefijo: string): Promise<string> {
    const [{ nextval }] = await tx.$queryRawUnsafe<{ nextval: bigint }[]>(
      `SELECT nextval('${seq}')`,
    );
    return `${prefijo}-${nextval}`;
  }

  private esUniqueViolation(e: unknown): boolean {
    return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
  }

  /** Si el error fue un choque de índice único, recupera el registro ganador. */
  private async recuperarPorUnique<T>(
    e: unknown,
    buscar: () => Promise<T | null>,
  ): Promise<T | null> {
    if (!this.esUniqueViolation(e)) return null;
    return buscar();
  }
}
