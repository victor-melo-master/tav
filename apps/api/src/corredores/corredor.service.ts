import { Injectable } from '@nestjs/common';
import { Corredor, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CrearCorredorDto, EditarCorredorDto } from '../cajas/cajas.dto';
import {
  CajaEsMadreException,
  CajaMonedaMismatchException,
  CajaNoEncontradaException,
  CorredorDuplicadoException,
  CorredorNoEncontradoException,
} from '../cajas/cajas.exceptions';

type Tx = Prisma.TransactionClient;

/**
 * Corredores (servicios): lo que se vende y se cotiza (país + producto).
 * Contrato: docs/08-contrato-cajas.md, sección CorredorService.
 *
 * La caja física se crea por separado (CajaService) y el servicio la
 * referencia por `cajaId`. Varios servicios pueden compartir la misma caja
 * (BCV y tasa especial → misma caja de bolívares en cuenta).
 */
@Injectable()
export class CorredorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Crea un servicio. NO crea la caja: el admin la crea por separado y pasa
   * `cajaId`. Valida que la caja exista, no sea madre, y que su moneda
   * coincida con la del servicio.
   *
   * Unicidad (índice único parcial en BD): no puede haber dos servicios
   * ACTIVOS con la misma combinación pais + servicio. BCV y tasa especial
   * son servicios distintos, así que coexisten; pero no dos "BCV".
   */
  async crear(dto: CrearCorredorDto): Promise<Corredor> {
    const caja = await this.prisma.caja.findUnique({ where: { id: dto.cajaId } });
    if (!caja) throw new CajaNoEncontradaException(dto.cajaId);
    if (caja.esMadre) throw new CajaEsMadreException(dto.cajaId);
    if (caja.moneda !== dto.moneda) {
      throw new CajaMonedaMismatchException(caja.id, caja.moneda, dto.moneda);
    }

    return this.prisma.$transaction(async (tx) => {
      await this.validarNoDuplicado(tx, dto.pais, dto.servicio);

      const corredor = await tx.corredor.create({
        data: {
          pais: dto.pais,
          paisNombre: dto.paisNombre,
          moneda: dto.moneda,
          monedaNombre: dto.monedaNombre,
          formaEntrega: dto.formaEntrega,
          formaEntregaNombre: dto.formaEntregaNombre,
          servicio: dto.servicio,
          servicioNombre: dto.servicioNombre,
          cajaId: dto.cajaId,
          creadoPorId: dto.creadoPorId,
        },
      });

      await this.audit.crear(tx, {
        actorId: dto.creadoPorId,
        accion: 'corredor.crear',
        entidad: 'Corredor',
        entidadId: corredor.id,
        despues: {
          pais: corredor.pais,
          servicio: corredor.servicio,
          moneda: corredor.moneda,
          cajaId: corredor.cajaId,
        },
      });

      return corredor;
    });
  }

  /**
   * Edita un servicio. El código `servicio` y el `pais` NO se editan: son la
   * identidad del servicio (la unicidad es pais + servicio). Cambiar la caja
   * valida moneda y no-madre igual que al crear.
   */
  async editar(corredorId: string, dto: EditarCorredorDto, actorId: string): Promise<Corredor> {
    const corredor = await this.obtener(corredorId);

    const data: Prisma.CorredorUpdateInput = {};
    if (dto.formaEntrega !== undefined) data.formaEntrega = dto.formaEntrega;
    if (dto.formaEntregaNombre !== undefined) data.formaEntregaNombre = dto.formaEntregaNombre;
    if (dto.servicioNombre !== undefined) data.servicioNombre = dto.servicioNombre;
    if (dto.moneda !== undefined) data.moneda = dto.moneda;
    if (dto.monedaNombre !== undefined) data.monedaNombre = dto.monedaNombre;

    if (dto.cajaId !== undefined && dto.cajaId !== corredor.cajaId) {
      const caja = await this.prisma.caja.findUnique({ where: { id: dto.cajaId } });
      if (!caja) throw new CajaNoEncontradaException(dto.cajaId);
      if (caja.esMadre) throw new CajaEsMadreException(dto.cajaId);
      const moneda = dto.moneda ?? corredor.moneda;
      if (caja.moneda !== moneda) {
        throw new CajaMonedaMismatchException(caja.id, caja.moneda, moneda);
      }
      data.caja = { connect: { id: dto.cajaId } };
    } else if (dto.moneda !== undefined && dto.moneda !== corredor.moneda) {
      // Cambió la moneda sin cambiar la caja: validar contra la caja actual.
      const caja = await this.prisma.caja.findUnique({ where: { id: corredor.cajaId } });
      if (caja && caja.moneda !== dto.moneda) {
        throw new CajaMonedaMismatchException(caja.id, caja.moneda, dto.moneda);
      }
    }

    const actualizado = await this.prisma.corredor.update({ where: { id: corredorId }, data });

    await this.audit.crear(this.prisma, {
      actorId,
      accion: 'corredor.editar',
      entidad: 'Corredor',
      entidadId: corredorId,
      antes: {
        formaEntrega: corredor.formaEntrega,
        formaEntregaNombre: corredor.formaEntregaNombre,
        servicioNombre: corredor.servicioNombre,
        moneda: corredor.moneda,
        monedaNombre: corredor.monedaNombre,
        cajaId: corredor.cajaId,
      },
      despues: {
        formaEntrega: actualizado.formaEntrega,
        formaEntregaNombre: actualizado.formaEntregaNombre,
        servicioNombre: actualizado.servicioNombre,
        moneda: actualizado.moneda,
        monedaNombre: actualizado.monedaNombre,
        cajaId: actualizado.cajaId,
      },
    });

    return actualizado;
  }

  /**
   * Marca activo=false, desactivadoAt=now() y desactivadoPorId=actorId. La caja
   * del servicio NO se toca: conserva su saldo y su historia. Desaparece de
   * listarActivos pero sigue existiendo para consultas y referencias.
   */
  async desactivar(corredorId: string, actorId: string): Promise<Corredor> {
    const corredor = await this.obtener(corredorId);
    const actualizado = await this.prisma.corredor.update({
      where: { id: corredorId },
      data: { activo: false, desactivadoAt: new Date(), desactivadoPorId: actorId },
    });

    await this.audit.crear(this.prisma, {
      actorId,
      accion: 'corredor.desactivar',
      entidad: 'Corredor',
      entidadId: corredorId,
      antes: { activo: corredor.activo },
      despues: { activo: false, desactivadoPorId: actorId },
    });

    return actualizado;
  }

  /**
   * Marca activo=true y limpia desactivadoAt y desactivadoPorId: al reactivar,
   * el último desactivador deja de ser relevante. Valida que reactivar no
   * deje dos servicios activos con la misma combinación pais + servicio.
   */
  async activar(corredorId: string, actorId: string): Promise<Corredor> {
    const corredor = await this.obtener(corredorId);
    const actualizado = await this.prisma.$transaction(async (tx) => {
      await this.validarNoDuplicado(tx, corredor.pais, corredor.servicio, corredorId);
      return tx.corredor.update({
        where: { id: corredorId },
        data: { activo: true, desactivadoAt: null, desactivadoPorId: null },
      });
    });

    await this.audit.crear(this.prisma, {
      actorId,
      accion: 'corredor.activar',
      entidad: 'Corredor',
      entidadId: corredorId,
      antes: { activo: corredor.activo },
      despues: { activo: true },
    });

    return actualizado;
  }

  /** Todos los servicios, activos e inactivos. Para el panel del admin. */
  async listar(): Promise<Corredor[]> {
    return this.prisma.corredor.findMany({
      orderBy: { creadoAt: 'asc' },
      include: { caja: true },
    });
  }

  /** Solo los activos. Para la app del cajero (escoger destino). */
  async listarActivos(): Promise<Corredor[]> {
    return this.prisma.corredor.findMany({
      where: { activo: true },
      orderBy: { creadoAt: 'asc' },
      include: { caja: true },
    });
  }

  async obtener(corredorId: string): Promise<Corredor> {
    const corredor = await this.prisma.corredor.findUnique({ where: { id: corredorId } });
    if (!corredor) throw new CorredorNoEncontradoException(corredorId);
    return corredor;
  }

  private async validarNoDuplicado(
    tx: Tx,
    pais: string,
    servicio: string,
    exceptoId?: string,
  ): Promise<void> {
    const existente = await tx.corredor.findFirst({
      where: {
        pais,
        servicio,
        activo: true,
        ...(exceptoId ? { id: { not: exceptoId } } : {}),
      },
      select: { id: true },
    });
    if (existente) throw new CorredorDuplicadoException(pais, servicio);
  }
}
