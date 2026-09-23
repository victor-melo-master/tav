import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { SemaforoService } from '../ledger/semaforo.service';
import { fechaCaracasHoy } from '../ledger/fecha-caracas';
import { NoEncontradoException } from '../ledger/ledger.exceptions';
import argon2 from 'argon2';
import { CrearUsuarioDto } from './dto/crear-usuario.dto';
import { ListarCajerosDto } from './dto/listar-cajeros.dto';
import { CambiarLimiteDto } from './dto/cambiar-limite.dto';
import { ResolverAmpliacionDto } from './dto/resolver-ampliacion.dto';
import { VerificarCierreDto } from './dto/verificar-cierre.dto';
import { RegistrarCobroAdminDto } from './dto/registrar-cobro-admin.dto';
import {
  ListarAmpliacionesDto,
  ListarCierresDto,
  PaginacionAdminDto,
} from './dto/listar.dto';

const MS_POR_DIA = 86_400_000;

/**
 * Operaciones del administrador. Solo accesibles con @Roles('admin').
 *
 * Capa fina: la lógica de dinero vive en LedgerService y el cálculo del
 * semáforo en SemaforoService. Aquí no se recalcula nada de dinero: se
 * delega, se filtra y se formatea.
 *
 * actorId (adminId) SIEMPRE sale del JWT (req.user.sub), nunca del body.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly semaforo: SemaforoService,
  ) {}

  // ─────────────────────────── USUARIOS ───────────────────────────

  /**
   * Crea un cajero o cobrador con su perfil en la misma transacción.
   * El teléfono es único: si ya existe, Prisma lanza P2002 → 409 Conflict.
   *
   * Para un cajero, limiteCents es obligatorio y se guarda como BigInt.
   * El admin fija el límite; puede modificarlo cuando quiera (cambiarLimite).
   */
  async crearUsuario(dto: CrearUsuarioDto, creadoPorId: string) {
    if (dto.rol === 'cajero' && !dto.limiteCents) {
      throw new BadRequestException('Un cajero requiere limiteCents');
    }
    if (dto.rol === 'pagador' && !dto.pais?.trim()) {
      throw new BadRequestException('Un pagador requiere pais (código ISO-3)');
    }

    const passwordHash = await argon2.hash(dto.password);
    const email = dto.email.trim().toLowerCase();
    const telefono = dto.telefono?.trim() || null;

    try {
      const usuario = await this.prisma.$transaction(async (tx) => {
        const data: Prisma.UsuarioCreateInput = {
          rol: dto.rol,
          nombre: dto.nombre,
          email,
          telefono,
          passwordHash,
          documento: dto.documento,
          creadoPorId,
        };

        if (dto.rol === 'cajero') {
          data.perfilCajero = {
            create: {
              limiteCents: BigInt(dto.limiteCents!),
              zona: dto.zona,
              direccion: dto.direccion,
              notas: dto.notas,
            },
          };
        } else if (dto.rol === 'cobrador') {
          data.perfilCobrador = {
            create: {
              zona: dto.zona,
            },
          };
        } else if (dto.rol === 'pagador') {
          data.perfilPagador = {
            create: {
              pais: dto.pais!.trim().toUpperCase(),
              notas: dto.notas,
            },
          };
        }

        return tx.usuario.create({
          data,
          include: { perfilCajero: true, perfilCobrador: true, perfilPagador: true },
        });
      });

      const { passwordHash: _ph, ...sinPassword } = usuario;
      return sinPassword;
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const target = (e.meta as { target?: string[] })?.target ?? [];
        if (target.includes('email')) {
          throw new ConflictException(`Ya existe un usuario con el correo ${dto.email}`);
        }
        throw new ConflictException('Ya existe un usuario con ese dato');
      }
      throw e;
    }
  }

  // ─────────────────────────── CAJEROS ───────────────────────────

  /**
   * Lista todos los cajeros con deuda, límite, porcentaje, semáforo y días
   * sin conectarse. Filtros opcionales por estado del semáforo y búsqueda
   * por nombre o teléfono.
   *
   * El cálculo del semáforo vive en SemaforoService; aquí solo se filtra
   * el resultado. El orden es por urgencia (mismo criterio que el cobrador):
   * bloqueados primero, luego por estado, luego por días y deuda.
   */
  async cajeros(filtros: ListarCajerosDto) {
    const perfiles = await this.prisma.perfilCajero.findMany({
      include: { usuario: true },
    });

    // Filtro por búsqueda libre (nombre o teléfono) antes de calcular el
    // semáforo: no tiene sentido calcularlo para filas que se van a descartar.
    let base = perfiles;
    if (filtros.q) {
      const q = filtros.q.toLowerCase();
      base = perfiles.filter(
        (p) =>
          p.usuario.nombre.toLowerCase().includes(q) ||
          p.usuario.telefono?.toLowerCase().includes(q) ||
          p.usuario.email.toLowerCase().includes(q),
      );
    }

    const conSemaforo = await Promise.all(
      base.map(async (p) => {
        const sem = await this.semaforo.calcular(p.usuarioId);
        const diasSinConectarse = p.usuario.ultimaVezAt
          ? Math.floor((Date.now() - p.usuario.ultimaVezAt.getTime()) / MS_POR_DIA)
          : null;

        return {
          id: p.usuarioId,
          nombre: p.usuario.nombre,
          email: p.usuario.email,
          telefono: p.usuario.telefono,
          zona: p.zona,
          saldoCents: p.saldoCents,
          limiteCents: p.limiteCents,
          pct: sem.pct,
          dias: sem.dias,
          bloqueado: sem.bloqueado,
          semaforo: sem.estado,
          motivo: sem.motivo,
          disponibleCents: sem.disponibleCents,
          diasSinConectarse,
          ultimaVezAt: p.usuario.ultimaVezAt,
          activo: p.usuario.activo,
        };
      }),
    );

    // Filtro por estado del semáforo (se calcula después, porque depende
    // del SemaforoService que lee la ampliación activa).
    let resultado = conSemaforo;
    if (filtros.semaforo) {
      resultado = conSemaforo.filter((c) => c.semaforo === filtros.semaforo);
    }

    // Orden por urgencia: bloqueados primero, luego estado, luego días, luego deuda.
    const orden = { rojo: 2, ambar: 1, verde: 0 };
    resultado.sort((a, b) => {
      if (a.bloqueado !== b.bloqueado) return a.bloqueado ? -1 : 1;
      const sa = orden[a.semaforo];
      const sb = orden[b.semaforo];
      if (sa !== sb) return sb - sa;
      if (b.dias !== a.dias) return b.dias - a.dias;
      const ba = BigInt(a.saldoCents);
      const bb = BigInt(b.saldoCents);
      if (bb > ba) return 1;
      if (bb < ba) return -1;
      return 0;
    });

    return resultado;
  }

  /**
   * Ficha completa de un cajero: perfil, usuario, movimientos y operaciones.
   * Los movimientos se ordenan por seq descendente (más reciente primero);
   * las operaciones por creadaAt descendente.
   */
  async fichaCajero(cajeroId: string) {
    const perfil = await this.prisma.perfilCajero.findUnique({
      where: { usuarioId: cajeroId },
      include: { usuario: true },
    });
    if (!perfil) throw new NoEncontradoException('cajero', cajeroId);

    const [sem, movimientos, operaciones, ampliaciones] = await Promise.all([
      this.semaforo.calcular(cajeroId),
      this.prisma.movimiento.findMany({
        where: { cajeroId },
        orderBy: { seq: 'desc' },
        take: 100,
      }),
      this.prisma.operacion.findMany({
        where: { cajeroId },
        orderBy: { creadaAt: 'desc' },
        take: 100,
      }),
      this.prisma.ampliacionCredito.findMany({
        where: { cajeroId },
        orderBy: { solicitadaAt: 'desc' },
      }),
    ]);

    const { passwordHash: _ph, ...usuarioSinPassword } = perfil.usuario;

    return {
      id: perfil.usuarioId,
      nombre: perfil.usuario.nombre,
      email: perfil.usuario.email,
      telefono: perfil.usuario.telefono,
      documento: perfil.usuario.documento,
      zona: perfil.zona,
      direccion: perfil.direccion,
      notas: perfil.notas,
      activo: perfil.usuario.activo,
      ultimaVezAt: perfil.usuario.ultimaVezAt,
      saldoCents: perfil.saldoCents,
      limiteCents: perfil.limiteCents,
      deudaDesde: perfil.deudaDesde,
      semaforo: sem,
      movimientos,
      operaciones,
      ampliaciones,
      usuario: usuarioSinPassword,
    };
  }

  /**
   * Cambia el límite de crédito de un cajero y registra el cambio en AuditLog
   * con el valor anterior y el nuevo. El límite no es un movimiento: es un
   * campo del perfil que el admin puede modificar cuando quiera (regla 4 de
   * docs/01: el cache de saldo se escribe solo en la tx del movimiento, pero
   * el límite sí es editable).
   *
   * El cambio se hace en una transacción para que el AuditLog quede
   * consistente con el perfil: si algo falla, no hay cambio sin auditoría.
   */
  async cambiarLimite(adminId: string, cajeroId: string, dto: CambiarLimiteDto) {
    const nuevoLimite = BigInt(dto.limiteCents);

    return this.prisma.$transaction(async (tx) => {
      const perfil = await tx.perfilCajero.findUnique({
        where: { usuarioId: cajeroId },
      });
      if (!perfil) throw new NoEncontradoException('cajero', cajeroId);

      const limiteAnterior = perfil.limiteCents;

      const actualizado = await tx.perfilCajero.update({
        where: { usuarioId: cajeroId },
        data: { limiteCents: nuevoLimite },
      });

      await tx.auditLog.create({
        data: {
          actorId: adminId,
          accion: 'cajero.cambiar_limite',
          entidad: 'PerfilCajero',
          entidadId: cajeroId,
          antes: { limiteCents: limiteAnterior.toString() },
          despues: { limiteCents: nuevoLimite.toString() },
        },
      });

      return actualizado;
    });
  }

  // ─────────────────────────── AMPLIACIONES ───────────────────────────

  /**
   * Lista las ampliaciones filtradas por estado. Las pendientes salen
   * primeras sin importar el filtro: son las que el admin tiene que
   * despachar. Dentro de cada grupo, ordenadas por solicitadaAt asc
   * (las más viejas primero).
   */
  async ampliaciones(filtros: ListarAmpliacionesDto) {
    const where = filtros.estado ? { estado: filtros.estado } : {};

    const items = await this.prisma.ampliacionCredito.findMany({
      where,
      include: {
        cajero: { include: { usuario: true } },
        operacion: true,
      },
      orderBy: [{ estado: 'asc' }, { solicitadaAt: 'asc' }],
    });

    // Reordenar para que las pendientes queden primero, sin importar el
    // orderBy de Prisma (que no soporta "pendiente primero" directamente).
    const prioridad = { pendiente: 0, aprobada: 1, rechazada: 2, consumida: 3, expirada: 4 };
    items.sort((a, b) => prioridad[a.estado] - prioridad[b.estado]);

    return items;
  }

  /**
   * Aprueba una ampliación pendiente. Marca estado='aprobada', guarda
   * resueltaAt, resueltaPorId y notaAdmin opcional.
   *
   * La ampliación es para una sola operación: se consume al usarse. Ese
   * consumo lo maneja LedgerService.registrarOperacion, no este endpoint.
   * Mientras esté aprobada y no consumida, el semáforo la incluye en el
   * límite efectivo (SemaforoService ya lo considera).
   */
  async aprobarAmpliacion(adminId: string, ampliacionId: string, dto: ResolverAmpliacionDto) {
    return this.resolverAmpliacion(adminId, ampliacionId, 'aprobada', dto.nota);
  }

  /** Rechaza una ampliación pendiente con nota opcional. */
  async rechazarAmpliacion(adminId: string, ampliacionId: string, dto: ResolverAmpliacionDto) {
    return this.resolverAmpliacion(adminId, ampliacionId, 'rechazada', dto.nota);
  }

  private async resolverAmpliacion(
    adminId: string,
    ampliacionId: string,
    nuevoEstado: 'aprobada' | 'rechazada',
    nota?: string,
  ) {
    const ampliacion = await this.prisma.ampliacionCredito.findUnique({
      where: { id: ampliacionId },
    });
    if (!ampliacion) throw new NoEncontradoException('ampliacion', ampliacionId);
    if (ampliacion.estado !== 'pendiente') {
      throw new BadRequestException(
        `La ampliación ${ampliacionId} está en estado "${ampliacion.estado}", no se puede resolver`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const resuelta = await tx.ampliacionCredito.update({
        where: { id: ampliacionId },
        data: {
          estado: nuevoEstado,
          resueltaAt: new Date(),
          resueltaPorId: adminId,
          notaAdmin: nota,
        },
        include: { cajero: { include: { usuario: true } } },
      });

      await tx.auditLog.create({
        data: {
          actorId: adminId,
          accion: `ampliacion.${nuevoEstado}`,
          entidad: 'AmpliacionCredito',
          entidadId: ampliacionId,
          antes: { estado: ampliacion.estado },
          despues: { estado: nuevoEstado, notaAdmin: nota ?? null },
        },
      });

      return resuelta;
    });
  }

  // ─────────────────────────── CIERRES ───────────────────────────

  /**
   * Lista los cierres filtrados por estado. Los enviados salen primeros:
   * son los que están esperando verificación del admin. Dentro de cada
   * grupo, ordenados por enviadoAt desc (los más recientes primero).
   */
  async cierres(filtros: ListarCierresDto, pag: PaginacionAdminDto) {
    const page = pag.page ?? 1;
    const limit = pag.limit ?? 20;
    const where = filtros.estado ? { estado: filtros.estado } : {};

    const items = await this.prisma.cierre.findMany({
      where,
      include: {
        cobrador: { include: { usuario: true } },
        cobros: { where: { anuladoAt: null }, select: { id: true } },
      },
      orderBy: [{ estado: 'asc' }, { enviadoAt: 'desc' }, { fecha: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    });

    // Reordenar: enviados primero, luego el resto. Prisma no soporta
    // "enviado primero" en orderBy de forma directa.
    const prioridad = { enviado: 0, con_diferencia: 1, verificado: 2, abierto: 3 };
    items.sort((a, b) => prioridad[a.estado] - prioridad[b.estado]);

    const total = await this.prisma.cierre.count({ where });

    return {
      items: items.map((c) => ({
        ...c,
        cobrosCount: c.cobros.length,
      })),
      total,
      page,
      limit,
    };
  }

  /**
   * Detalle de un cierre con todos los cobros del día del cobrador.
   * Incluye el cobrador y los cobros no anulados ordenados por creadoAt desc.
   */
  async cierreDetalle(cierreId: string) {
    const cierre = await this.prisma.cierre.findUnique({
      where: { id: cierreId },
      include: {
        cobrador: { include: { usuario: true } },
        cobros: {
          where: { anuladoAt: null },
          include: { cajero: { include: { usuario: true } } },
          orderBy: { creadoAt: 'desc' },
        },
      },
    });
    if (!cierre) throw new NoEncontradoException('cierre', cierreId);

    return cierre;
  }

  /**
   * Verifica un cierre: el admin captura el efectivo que realmente recibió.
   * El sistema calcula la diferencia contra lo declarado, por moneda, y marca
   * el cierre como `verificado` (sin diferencia) o `con_diferencia`.
   *
   * Si hay diferencia (recibido != declarado), la nota es OBLIGATORIA:
   * un descuadre sin explicación es ilegible en la auditoría.
   *
   * Solo se pueden verificar cierres en estado `enviado`.
   */
  async verificarCierre(adminId: string, cierreId: string, dto: VerificarCierreDto) {
    const cierre = await this.prisma.cierre.findUnique({
      where: { id: cierreId },
    });
    if (!cierre) throw new NoEncontradoException('cierre', cierreId);
    if (cierre.estado !== 'enviado') {
      throw new BadRequestException(
        `El cierre ${cierreId} está en estado "${cierre.estado}", solo se verifican los enviados`,
      );
    }

    const recibido = BigInt(dto.efectivoRecibidoCents);
    const diferencia = recibido - cierre.efectivoDeclaradoCents;
    const hayDiferencia = diferencia !== 0n;

    if (hayDiferencia && (!dto.nota || !dto.nota.trim())) {
      throw new BadRequestException(
        'La nota es obligatoria cuando hay diferencia entre lo declarado y lo recibido',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const verificado = await tx.cierre.update({
        where: { id: cierreId },
        data: {
          estado: hayDiferencia ? 'con_diferencia' : 'verificado',
          verificadoAt: new Date(),
          verificadoPorId: adminId,
          efectivoRecibidoCents: recibido,
          diferenciaCents: diferencia,
          notaAdmin: dto.nota,
        },
        include: {
          cobrador: { include: { usuario: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: adminId,
          accion: 'cierre.verificar',
          entidad: 'Cierre',
          entidadId: cierreId,
          antes: {
            estado: cierre.estado,
            efectivoDeclaradoCents: cierre.efectivoDeclaradoCents.toString(),
          },
          despues: {
            estado: hayDiferencia ? 'con_diferencia' : 'verificado',
            efectivoRecibidoCents: recibido.toString(),
            diferenciaCents: diferencia.toString(),
            notaAdmin: dto.nota ?? null,
          },
        },
      });

      return verificado;
    });
  }

  // ─────────────────────────── COBROS DEL ADMIN ───────────────────────────

  /**
   * El admin registra un pago en nombre de un cajero, SIN cobrador.
   * Reusa el mismo `LedgerService.registrarCobro` del ledger: con
   * `cobradorId` nulo no se crea ni toca ningún cierre.
   *
   * registradoPorId = adminId (del JWT). La idempotencia por clientUuid
   * la garantiza el ledger.
   */
  async registrarCobro(adminId: string, dto: RegistrarCobroAdminDto) {
    return this.ledger.registrarCobro({
      clientUuid: dto.clientUuid,
      cajeroId: dto.cajeroId,
      cobradorId: null,
      metodo: dto.metodo,
      montoCents: BigInt(dto.montoCents),
      comprobanteUrl: dto.comprobanteUrl,
      nota: dto.nota,
      registradoPorId: adminId,
    });
  }

  // ─────────────────────── MOVIMIENTOS DIARIOS ───────────────────────

  /**
   * Reporte diario de movimientos: todas las operaciones registradas ese día
   * calendario de Caracas, con el precio de venta, el precio de compra y el
   * margen de cada una.
   *
   * El margen es `(precioVenta - precioCompra) × montoUsd` en GYD. El
   * porcentaje es `precioVenta ÷ precioCompra - 1` — como lo piensa el
   * cliente: comprar a 237 y vender a 250 es un 5,5%.
   *
   * Una operación con `precioCompraGyd` nulo se muestra con el margen vacío
   * y no entra en los totales. Es el caso de una operación registrada antes
   * de la primera compra de USDT.
   *
   * Los totales ponderan por monto, no promedian simples: el porcentaje del
   * día es `gananciaTotal / costoTotal`, donde `costoTotal = Σ(montoUsd ×
   * precioCompra)`.
   */
  async movimientosDiarios(fechaYmd: string) {
    const { inicio, fin } = rangoDiaCaracas(fechaYmd);

    const operaciones = await this.prisma.operacion.findMany({
      where: {
        anuladaAt: null,
        creadaAt: { gte: inicio, lt: fin },
      },
      include: {
        cajero: { include: { usuario: true } },
      },
      orderBy: { creadaAt: 'asc' },
    });

    // corredorId es un String? sin relación de Prisma — cargo los corredores
    // por separado y los indexo por id.
    const corredorIds = [...new Set(operaciones.map((o) => o.corredorId).filter(Boolean))] as string[];
    const corredores = await this.prisma.corredor.findMany({
      where: { id: { in: corredorIds } },
    });
    const corredorMap = new Map(corredores.map((c) => [c.id, c]));

    let totalUsdCents = 0n;
    let totalGananciaCents = 0n;
    let totalCostoGydCents = 0n;

    const items = operaciones.map((op) => {
      const montoUsdCents = op.montoOrigenCents;
      const precioVenta = op.tasaAplicada;
      const precioCompra = op.precioCompraGyd;

      totalUsdCents += montoUsdCents;

      let margenGydCents: bigint | null = null;
      let pctMargen: Prisma.Decimal | null = null;

      if (precioCompra !== null) {
        // Margen = (precioVenta - precioCompra) × montoUsd
        // montoUsdCents son centavos de USD; (precio × cents) da centavos de GYD.
        const margenDecimal = precioVenta.sub(precioCompra).mul(montoUsdCents.toString());
        margenGydCents = BigInt(margenDecimal.toFixed(0));

        // Porcentaje = precioVenta ÷ precioCompra - 1
        pctMargen = precioVenta.div(precioCompra).sub(1);

        totalGananciaCents += margenGydCents;
        totalCostoGydCents += BigInt(
          precioCompra.mul(montoUsdCents.toString()).toFixed(0),
        );
      }

      const corredor = op.corredorId ? corredorMap.get(op.corredorId) : undefined;

      return {
        id: op.id,
        folio: op.folio,
        cajero: op.cajero.usuario.nombre,
        servicio: corredor?.servicioNombre ?? '—',
        montoUsdCents: montoUsdCents.toString(),
        precioVenta: precioVenta.toString(),
        precioCompra: precioCompra?.toString() ?? null,
        margenGydCents: margenGydCents?.toString() ?? null,
        pctMargen: pctMargen?.toString() ?? null,
      };
    });

    // Porcentaje promedio ponderado por monto: gananciaTotal / costoTotal.
    // Si no hay operaciones con margen, queda null.
    const pctPromedioPonderado =
      totalCostoGydCents > 0n
        ? new Prisma.Decimal(totalGananciaCents.toString()).div(totalCostoGydCents.toString()).toString()
        : null;

    return {
      fecha: fechaYmd,
      operaciones: items,
      totales: {
        operaciones: items.length,
        usdCents: totalUsdCents.toString(),
        gananciaGydCents: totalGananciaCents.toString(),
        pctPromedioPonderado,
      },
    };
  }

  // ─────────────────────────── TABLERO ───────────────────────────

  /**
   * Totales del día y del mes para el tablero del admin:
   *   - cobrado (día / mes): suma de montoCents de cobros no anulados
   *   - operaciones (día / mes): conteo de operaciones no anuladas
   *   - cartera total pendiente: suma de saldoCents de todos los cajeros
   *   - reparto de cajeros por color de semáforo
   *   - cierres esperando verificación (estado='enviado')
   *   - ampliaciones pendientes
   *   - cajeros sin conectarse hace más de 3 días
   *
   * Los rangos de fecha van por día calendario de Caracas (America/Caracas),
   * no por UTC: un cobro a las 9pm de Caracas ya es "mañana" en UTC.
   */
  async resumen() {
    const { inicioHoy, finHoy, inicioMes, finMes } = rangosCaracas();

    const [
      cobradoDia,
      cobradoMes,
      operacionesDia,
      operacionesMes,
      cartera,
      cajeros,
      cierresEsperando,
      ampliacionesPendientes,
    ] = await Promise.all([
      this.prisma.cobro.aggregate({
        where: { anuladoAt: null, creadoAt: { gte: inicioHoy, lt: finHoy } },
        _sum: { montoCents: true },
      }),
      this.prisma.cobro.aggregate({
        where: { anuladoAt: null, creadoAt: { gte: inicioMes, lt: finMes } },
        _sum: { montoCents: true },
      }),
      this.prisma.operacion.count({
        where: { anuladaAt: null, creadaAt: { gte: inicioHoy, lt: finHoy } },
      }),
      this.prisma.operacion.count({
        where: { anuladaAt: null, creadaAt: { gte: inicioMes, lt: finMes } },
      }),
      this.prisma.perfilCajero.aggregate({ _sum: { saldoCents: true } }),
      this.prisma.perfilCajero.findMany({ include: { usuario: true } }),
      this.prisma.cierre.count({ where: { estado: 'enviado' } }),
      this.prisma.ampliacionCredito.count({ where: { estado: 'pendiente' } }),
    ]);

    // Reparto por semáforo y cajeros sin conectarse >3 días.
    const reparto = { verde: 0, ambar: 0, rojo: 0 };
    let sinConectarse = 0;
    const hace3dias = Date.now() - 3 * MS_POR_DIA;

    for (const c of cajeros) {
      const sem = await this.semaforo.calcular(c.usuarioId);
      reparto[sem.estado] += 1;
      if (c.usuario.ultimaVezAt === null || c.usuario.ultimaVezAt.getTime() < hace3dias) {
        sinConectarse += 1;
      }
    }

    return {
      hoy: {
        cobradoCents: cobradoDia._sum.montoCents ?? 0n,
        operaciones: operacionesDia,
      },
      mes: {
        cobradoCents: cobradoMes._sum.montoCents ?? 0n,
        operaciones: operacionesMes,
      },
      carteraPendienteCents: cartera._sum.saldoCents ?? 0n,
      repartoSemaforo: reparto,
      cierresEsperandoVerificacion: cierresEsperando,
      ampliacionesPendientes: ampliacionesPendientes,
      cajerosSinConectarse: sinConectarse,
    };
  }
}

/**
 * Rangos de fecha en zona Caracas para el tablero.
 * - inicioHoy / finHoy: medianoche de hoy y de mañana (Caracas).
 * - inicioMes / finMes: primer día de este mes y del siguiente (Caracas).
 *
 * OJO: `creadoAt` es un timestamptz (momento exacto en UTC). Para filtrar
 * "todos los cobros de hoy en Caracas" hay que convertir el inicio y fin del
 * día calendario de Caracas a UTC. Caracas es UTC−4 fijo (sin DST desde 2007),
 * así que medianoche Caracas = 04:00 UTC. Usar `Date.UTC(...)` sin el offset
 * daría un rango desplazado 4 horas: un cobro a las 22:00 Caracas (02:00 UTC
 * del día siguiente) quedaría fuera de "hoy" cuando debería estar dentro.
 *
 * El YMD se obtiene con Intl.DateTimeFormat en zona Caracas (mismo truco que
 * `fechaCaracasHoy`), y el offset se aplica con el sufijo `-04:00` al construir
 * el Date, que el motor de JS interpreta correctamente como offset fijo.
 */
function rangosCaracas(ahora: Date = new Date()): {
  inicioHoy: Date;
  finHoy: Date;
  inicioMes: Date;
  finMes: Date;
} {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora); // "2026-08-24"
  const [anio, mes] = ymd.split('-').map(Number);

  // Medianoche Caracas = 00:00-04:00 = 04:00Z. El sufijo -04:00 le dice al
  // motor de JS que interprete la hora local como Caracas y la convierta a UTC.
  const inicioHoy = new Date(`${ymd}T00:00:00-04:00`);
  const finHoy = new Date(inicioHoy.getTime() + MS_POR_DIA);

  const inicioMes = new Date(
    `${anio}-${String(mes).padStart(2, '0')}-01T00:00:00-04:00`,
  );
  const mesFin = mes === 12 ? 1 : mes + 1;
  const anioFin = mes === 12 ? anio + 1 : anio;
  const finMes = new Date(
    `${anioFin}-${String(mesFin).padStart(2, '0')}-01T00:00:00-04:00`,
  );

  return { inicioHoy, finHoy, inicioMes, finMes };
}

/**
 * Rango de un día calendario de Caracas en UTC, para filtrar operaciones
 * por fecha. `fechaYmd` es "YYYY-MM-DD". Medianoche Caracas = 04:00 UTC
 * (offset fijo −04:00, sin DST desde 2007).
 *
 * Devuelve `inicio` (medianoche de ese día, Caracas) y `fin` (medianoche
 * del día siguiente, Caracas).
 */
function rangoDiaCaracas(fechaYmd: string): { inicio: Date; fin: Date } {
  const inicio = new Date(`${fechaYmd}T00:00:00-04:00`);
  const fin = new Date(inicio.getTime() + MS_POR_DIA);
  return { inicio, fin };
}
