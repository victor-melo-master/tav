import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { SemaforoService } from '../ledger/semaforo.service';
import { fechaCaracasHoy } from '../ledger/fecha-caracas';
import {
  NoEncontradoException,
  CierreNoAbiertoException,
  AtencionEnUsoException,
} from '../ledger/ledger.exceptions';
import { MetodoCobro } from '@prisma/client';
import { RegistrarCobroDto } from './dto/registrar-cobro.dto';
import { EnviarCierreDto, PaginacionCierresDto, CrearAtencionDto, CrearAvisoDto } from './dto/enviar-cierre.dto';

/**
 * Capa fina del rol cobrador. Delega la lógica de dinero al LedgerService
 * y el cálculo del semáforo al SemaforoService — no duplica nada de negocio.
 *
 * cobradorId SIEMPRE sale del JWT (req.user.sub), nunca del cuerpo.
 * Todos los cobradores ven las deudas de todos los cajeros: no hay cartera.
 */
@Injectable()
export class CobradorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly semaforo: SemaforoService,
  ) {}

  // ─────────────────────────── CAJEROS ───────────────────────────

  /**
   * Lista todos los cajeros con su deuda, límite, semáforo, días sin conectarse
   * y quién lo está atendiendo. Ordenados por urgencia:
   *   1. Bloqueados por límite (pct >= 1)
   *   2. Estado del semáforo (rojo > ámbar > verde)
   *   3. Días de deuda (más días primero)
   *   4. Monto de deuda (más deuda primero)
   */
  async cajeros() {
    const perfiles = await this.prisma.perfilCajero.findMany({
      include: {
        usuario: true,
        atenciones: {
          where: { liberadaAt: null },
          include: { cobrador: { include: { usuario: true } } },
          take: 1,
        },
      },
    });

    // Calcular semáforo para cada cajero en paralelo.
    const conSemaforo = await Promise.all(
      perfiles.map(async (p) => {
        const sem = await this.semaforo.calcular(p.usuarioId);
        const diasSinConectarse = p.usuario.ultimaVezAt
          ? Math.floor((Date.now() - p.usuario.ultimaVezAt.getTime()) / 86_400_000)
          : null;
        const atencionActiva = p.atenciones.length > 0 ? p.atenciones[0] : null;

        return {
          id: p.usuarioId,
          nombre: p.usuario.nombre,
          telefono: p.usuario.telefono,
          zona: p.zona,
          saldoCents: p.saldoCents,
          limiteCents: p.limiteCents,
          dias: sem.dias,
          pct: sem.pct,
          bloqueado: sem.bloqueado,
          semaforo: sem.estado,
          motivo: sem.motivo,
          disponibleCents: sem.disponibleCents,
          diasSinConectarse,
          atendidoPor: atencionActiva
            ? {
                cobradorId: atencionActiva.cobradorId,
                nombre: atencionActiva.cobrador.usuario.nombre,
                iniciadaAt: atencionActiva.iniciadaAt,
              }
            : null,
        };
      }),
    );

    // Ordenar por urgencia.
    const orden = { rojo: 2, ambar: 1, verde: 0 };
    conSemaforo.sort((a, b) => {
      // 1. Bloqueados primero.
      if (a.bloqueado !== b.bloqueado) return a.bloqueado ? -1 : 1;
      // 2. Estado del semáforo.
      const sa = orden[a.semaforo as keyof typeof orden];
      const sb = orden[b.semaforo as keyof typeof orden];
      if (sa !== sb) return sb - sa;
      // 3. Días de deuda (más días primero).
      if (b.dias !== a.dias) return b.dias - a.dias;
      // 4. Monto de deuda (más deuda primero).
      const ba = BigInt(a.saldoCents);
      const bb = BigInt(b.saldoCents);
      if (bb > ba) return 1;
      if (bb < ba) return -1;
      return 0;
    });

    return conSemaforo;
  }

  // ─────────────────────────── COBROS ───────────────────────────

  /**
   * Registra un cobro llamando a LedgerService.registrarCobro.
   * cobradorId y registradoPorId salen del JWT, no del body.
   */
  async registrarCobro(cobradorId: string, dto: RegistrarCobroDto) {
    return this.ledger.registrarCobro({
      clientUuid: dto.clientUuid,
      cajeroId: dto.cajeroId,
      cobradorId,
      metodo: dto.metodo,
      montoCents: BigInt(dto.montoCents),
      comprobanteUrl: dto.comprobanteUrl,
      nota: dto.nota,
      registradoPorId: cobradorId,
    });
  }

  /**
   * Anula un cobro. Solo el cobrador que lo registró puede anularlo
   * (o el admin, pero eso vive en otro módulo). Nunca borra.
   */
  async anularCobro(cobradorId: string, cobroId: string, motivo: string) {
    const cobro = await this.prisma.cobro.findUnique({
      where: { id: cobroId },
    });
    if (!cobro) throw new NoEncontradoException('cobro', cobroId);

    // Solo el cobrador que lo registró puede anularlo.
    if (cobro.cobradorId && cobro.cobradorId !== cobradorId) {
      // No revelar que el cobro existe para otro cobrador — 404 genérico.
      throw new NoEncontradoException('cobro', cobroId);
    }

    return this.ledger.anular('cobro', cobroId, motivo, cobradorId);
  }

  // ─────────────────────────── CIERRES ───────────────────────────

  /** El cierre abierto de hoy con sus totales y lista de cobros. */
  async cierreActual(cobradorId: string) {
    const hoy = fechaCaracasHoy();
    const cierre = await this.prisma.cierre.findUnique({
      where: {
        cobradorId_fecha: { cobradorId, fecha: hoy },
      },
      include: {
        cobros: {
          where: { anuladoAt: null },
          orderBy: { creadoAt: 'desc' },
        },
      },
    });

    if (!cierre) {
      // Si no hay cierre hoy, devolver estructura vacía.
      // El cierre se crea automáticamente al registrar el primer cobro.
      return {
        id: null,
        cobradorId,
        fecha: hoy,
        totalRegistradoCents: 0n,
        efectivoDeclaradoCents: 0n,
        digitalCents: 0n,
        estado: 'abierto',
        cobros: [],
      };
    }

    return cierre;
  }

  /**
   * Cierra el día y manda a verificación. Rechaza si hay cobros
   * sin sincronizar (sincronizadoAt === null).
   */
  async enviarCierre(cobradorId: string, cierreId: string, dto: EnviarCierreDto) {
    const cierre = await this.prisma.cierre.findUnique({
      where: { id: cierreId },
      include: { cobros: { where: { anuladoAt: null } } },
    });

    if (!cierre) throw new NoEncontradoException('cierre', cierreId);
    if (cierre.cobradorId !== cobradorId) throw new NoEncontradoException('cierre', cierreId);
    if (cierre.estado !== 'abierto') throw new CierreNoAbiertoException(cierre.id, cierre.estado);

    // Rechazar si hay cobros sin sincronizar.
    const pendientes = cierre.cobros.filter((c) => c.sincronizadoAt === null);
    if (pendientes.length > 0) {
      throw new CierreNoAbiertoException(cierre.id, `tiene ${pendientes.length} cobro(s) sin sincronizar`);
    }

    // Calcular efectivo y digital de los cobros no anulados.
    // El cajero siempre paga en guyaneses: montoCents ya es la moneda base.
    const efectivo = cierre.cobros
      .filter((c) => c.esEfectivo)
      .reduce((sum, c) => sum + c.montoCents, 0n);
    const digital = cierre.cobros
      .filter((c) => !c.esEfectivo)
      .reduce((sum, c) => sum + c.montoCents, 0n);

    return this.prisma.cierre.update({
      where: { id: cierreId },
      data: {
        estado: 'enviado',
        enviadoAt: new Date(),
        efectivoDeclaradoCents: BigInt(dto.efectivoDeclaradoCents),
        digitalCents: digital,
        totalRegistradoCents: efectivo + digital,
        notaCobrador: dto.notaCobrador,
      },
      include: { cobros: { where: { anuladoAt: null }, orderBy: { creadoAt: 'desc' } } },
    });
  }

  /** Historial paginado de cierres del cobrador. */
  async cierres(cobradorId: string, query: PaginacionCierresDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = { cobradorId };

    const [items, total] = await Promise.all([
      this.prisma.cierre.findMany({
        where,
        orderBy: { fecha: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.cierre.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  // ─────────────────────────── ATENCIONES ───────────────────────────

  /**
   * Marca "lo estoy atendiendo" sobre un cajero. Si ya hay una atención
   * activa de OTRO cobrador, se rechaza. Si ya la tiene el mismo cobrador,
   * no hace nada (idempotente).
   */
  async marcarAtencion(cobradorId: string, dto: CrearAtencionDto) {
    // Verificar que el cajero existe.
    const cajero = await this.prisma.perfilCajero.findUnique({
      where: { usuarioId: dto.cajeroId },
    });
    if (!cajero) throw new NoEncontradoException('cajero', dto.cajeroId);

    // Verificar si ya hay una atención activa.
    const existente = await this.prisma.atencion.findFirst({
      where: { cajeroId: dto.cajeroId, liberadaAt: null },
    });

    if (existente) {
      if (existente.cobradorId === cobradorId) {
        // Ya la tiene el mismo cobrador: devolver sin crear.
        return existente;
      }
      // Otro cobrador la tiene: no se puede marcar.
      // PENDIENTE DE DEFINIR: ¿se permite reasignar o se rechaza?
      // Por ahora se rechaza con error 409.
      throw new AtencionEnUsoException(dto.cajeroId, existente.cobradorId);
    }

    return this.prisma.atencion.create({
      data: { cajeroId: dto.cajeroId, cobradorId },
    });
  }

  /**
   * Libera la atención "lo estoy atendiendo" sobre un cajero.
   * Solo el cobrador que la marcó puede liberarla.
   */
  async liberarAtencion(cobradorId: string, cajeroId: string) {
    const atencion = await this.prisma.atencion.findFirst({
      where: { cajeroId, liberadaAt: null },
    });

    if (!atencion) throw new NoEncontradoException('atencion', cajeroId);
    if (atencion.cobradorId !== cobradorId) throw new NoEncontradoException('atencion', cajeroId);

    return this.prisma.atencion.update({
      where: { id: atencion.id },
      data: { liberadaAt: new Date() },
    });
  }

  // ─────────────────────────── AVISOS ───────────────────────────

  /**
   * Envía un aviso manual de cobro a un cajero.
   * El sistema genera avisos automáticos; este es el manual del cobrador.
   */
  async enviarAviso(cobradorId: string, dto: CrearAvisoDto) {
    const cajero = await this.prisma.perfilCajero.findUnique({
      where: { usuarioId: dto.cajeroId },
    });
    if (!cajero) throw new NoEncontradoException('cajero', dto.cajeroId);

    return this.prisma.aviso.create({
      data: {
        cajeroId: dto.cajeroId,
        tipo: 'cobro_manual',
        titulo: dto.titulo,
        cuerpo: dto.cuerpo,
        enviadoPorId: cobradorId,
      },
    });
  }
}
