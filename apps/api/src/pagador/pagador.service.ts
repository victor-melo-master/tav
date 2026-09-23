import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CajaService } from '../cajas/caja.service';

/**
 * Servicio del rol pagador. Un pagador atiende un país; ve las
 * operaciones pendientes cuyo corredor es de su país.
 *
 * Reglas (docs/07 §4):
 * - No ve la deuda del cajero, el margen de TAV ni el saldo de las cajas.
 *   Las cajas son del admin. Verifica sobre la respuesta cruda del endpoint.
 * - La caja de la que sale la plata la determina el corredor, no la forma
 *   de pago. El corredor ya es destino + forma de entrega y hay una caja
 *   por corredor.
 * - La tasa de ejecución la escribe el pagador; no se precarga con la
 *   cotizada.
 *
 * El pago se ejecuta con CajaService.ejecutarPago, que ya está implementado
 * y probado. Aquí no se reescribe.
 */
@Injectable()
export class PagadorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cajas: CajaService,
  ) {}

  /**
   * Cola de pagos pendientes para el pagador: operaciones en estado
   * `pendiente` cuyo corredor es del país del pagador, ordenadas por
   * antigüedad (más vieja primero).
   *
   * NO devuelve deuda del cajero, margen ni saldo de caja. Solo lo que
   * el pagador necesita para ejecutar: identidad de la operación, monto
   * destino, moneda destino, beneficiario, corredor y cuál caja se
   * va a descontar.
   */
  async cola(pagadorId: string) {
    const pagador = await this.prisma.perfilPagador.findUnique({
      where: { usuarioId: pagadorId },
    });
    if (!pagador) return [];

    // Operacion no tiene relación directa con Corredor; buscar primero
    // los corredores del país del pagador y luego las operaciones.
    const corredores = await this.prisma.corredor.findMany({
      where: { pais: pagador.pais, activo: true },
    });
    const corredorIds = corredores.map((c) => c.id);
    if (corredorIds.length === 0) return [];

    const corredorPorId = new Map(corredores.map((c) => [c.id, c]));

    const operaciones = await this.prisma.operacion.findMany({
      where: {
        estado: 'pendiente',
        corredorId: { in: corredorIds },
      },
      orderBy: { creadaAt: 'asc' },
    });

    // Buscar la caja de cada corredor para decirle al pagador cuál se
    // va a descontar. El pagador no elige: la caja la determina el servicio
    // (Corredor.cajaId), no al revés.
    const cajas = await this.prisma.caja.findMany({
      where: { id: { in: corredores.map((c) => c.cajaId) } },
    });
    const cajaPorId = new Map(cajas.map((c) => [c.id, c]));

    return operaciones.map((o) => {
      const corredor = corredorPorId.get(o.corredorId!)!;
      return {
        id: o.id,
        folio: o.folio,
        montoOrigenCents: o.montoOrigenCents.toString(),
        monedaOrigen: o.monedaOrigen,
        montoDestinoCents: o.montoDestinoCents.toString(),
        monedaDestino: o.monedaDestino,
        beneficiario: o.beneficiario,
        creadaAt: o.creadaAt,
        corredor: {
          id: corredor.id,
          pais: corredor.pais,
          paisNombre: corredor.paisNombre,
          moneda: corredor.moneda,
          monedaNombre: corredor.monedaNombre,
          formaEntrega: corredor.formaEntrega,
          formaEntregaNombre: corredor.formaEntregaNombre,
          servicio: corredor.servicio,
          servicioNombre: corredor.servicioNombre,
        },
        cajaId: corredor.cajaId,
        cajaNombre: cajaPorId.get(corredor.cajaId)?.nombre ?? null,
      };
    });
  }

  /**
   * Ejecuta un pago delegando a CajaService.ejecutarPago. El pagador no
   * elige la caja: el servicio la deriva del corredor de la operación.
   */
  async ejecutarPago(
    pagadorId: string,
    dto: {
      clientUuid: string;
      operacionId: string;
      montoCents: bigint;
      montoDestinoCents: bigint;
      tasaEjecucion: string;
      formaPago: string;
      nombreCliente: string;
      comprobantePagoUrl: string;
    },
  ) {
    // Buscar la operación y su servicio para derivar la caja (Corredor.cajaId).
    const operacion = await this.prisma.operacion.findUnique({
      where: { id: dto.operacionId },
    });
    if (!operacion) throw new Error(`Operación ${dto.operacionId} no existe`);
    if (!operacion.corredorId) {
      throw new Error(`Operación ${dto.operacionId} no tiene corredor`);
    }

    const corredor = await this.prisma.corredor.findUnique({
      where: { id: operacion.corredorId },
      select: { cajaId: true },
    });
    if (!corredor) throw new Error(`No hay servicio ${operacion.corredorId}`);

    return this.cajas.ejecutarPago({
      clientUuid: dto.clientUuid,
      operacionId: dto.operacionId,
      cajaId: corredor.cajaId,
      montoCents: dto.montoCents,
      montoDestinoCents: dto.montoDestinoCents,
      tasaEjecucion: dto.tasaEjecucion,
      formaPago: dto.formaPago,
      nombreCliente: dto.nombreCliente,
      comprobantePagoUrl: dto.comprobantePagoUrl,
      registradoPorId: pagadorId,
    });
  }

  /**
   * Pagos del día del pagador: operaciones que él marcó como pagadas hoy.
   * Tampoco devuelve deuda, margen ni saldo de caja.
   */
  async pagosDelDia(pagadorId: string) {
    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);

    const operaciones = await this.prisma.operacion.findMany({
      where: {
        pagadaPorId: pagadorId,
        pagadaAt: { gte: inicioDia },
      },
      orderBy: { pagadaAt: 'desc' },
    });

    // Buscar corredores por separado (Operacion no tiene relación directa).
    const corredorIds = [...new Set(operaciones.map((o) => o.corredorId).filter(Boolean))] as string[];
    const corredores = await this.prisma.corredor.findMany({
      where: { id: { in: corredorIds } },
    });
    const corredorPorId = new Map(corredores.map((c) => [c.id, c]));

    return operaciones.map((o) => {
      const corredor = corredorPorId.get(o.corredorId!)!;
      return {
        id: o.id,
        folio: o.folio,
        montoOrigenCents: o.montoOrigenCents.toString(),
        monedaOrigen: o.monedaOrigen,
        montoDestinoCents: o.montoDestinoCents.toString(),
        monedaDestino: o.monedaDestino,
        beneficiario: o.beneficiario,
        tasaEjecucion: o.tasaEjecucion?.toString() ?? null,
        formaPago: o.formaPago,
        nombreCliente: o.nombreCliente,
        comprobantePagoUrl: o.comprobantePagoUrl,
        pagadaAt: o.pagadaAt,
        corredor: {
          id: corredor.id,
          paisNombre: corredor.paisNombre,
          moneda: corredor.moneda,
          monedaNombre: corredor.monedaNombre,
          formaEntregaNombre: corredor.formaEntregaNombre,
        },
      };
    });
  }
}
