import { Injectable } from '@nestjs/common';
import { Corredor, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CrearCorredorDto } from '../cajas/cajas.dto';
import {
  CorredorDuplicadoException,
  CorredorNoEncontradoException,
} from '../cajas/cajas.exceptions';

type Tx = Prisma.TransactionClient;

/**
 * Corredores: destino + forma de entrega (NO un par de monedas).
 * Contrato: docs/08-contrato-cajas.md, sección CorredorService.
 */
@Injectable()
export class CorredorService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crea un corredor y su caja asociada (una caja por corredor, esMadre=false)
   * en la misma transacción: si una falla, ninguna queda.
   *
   * Unicidad de negocio (no de BD): no puede haber dos corredores ACTIVOS con
   * la misma combinación pais + moneda + formaEntrega. Se valida dentro de la
   * transacción para acortar la ventana de carrera; sin índice único en BD la
   * garantía es de negocio, no absoluta (caso 16 del contrato).
   */
  async crear(dto: CrearCorredorDto): Promise<Corredor> {
    return this.prisma.$transaction(async (tx) => {
      await this.validarNoDuplicado(tx, dto.pais, dto.moneda, dto.formaEntrega);

      const corredor = await tx.corredor.create({
        data: {
          pais: dto.pais,
          paisNombre: dto.paisNombre,
          moneda: dto.moneda,
          monedaNombre: dto.monedaNombre,
          formaEntrega: dto.formaEntrega,
          formaEntregaNombre: dto.formaEntregaNombre,
          creadoPorId: dto.creadoPorId,
        },
      });

      await tx.caja.create({
        data: {
          corredorId: corredor.id,
          esMadre: false,
          moneda: dto.moneda,
          saldoCents: 0n,
        },
      });

      return corredor;
    });
  }

  /**
   * Marca activo=false, desactivadoAt=now() y desactivadoPorId=actorId. La caja
   * del corredor NO se toca: conserva su saldo y su historia. Desaparece de
   * listarActivos pero sigue existiendo para consultas y referencias.
   */
  async desactivar(corredorId: string, actorId: string): Promise<Corredor> {
    await this.obtener(corredorId);
    return this.prisma.corredor.update({
      where: { id: corredorId },
      data: { activo: false, desactivadoAt: new Date(), desactivadoPorId: actorId },
    });
  }

  /**
   * Marca activo=true y limpia desactivadoAt y desactivadoPorId: al reactivar,
   * el último desactivador deja de ser relevante. Valida que reactivar no
   * deje dos corredores activos con la misma combinación pais + moneda +
   * formaEntrega.
   */
  async activar(corredorId: string, _actorId: string): Promise<Corredor> {
    const corredor = await this.obtener(corredorId);
    return this.prisma.$transaction(async (tx) => {
      await this.validarNoDuplicado(
        tx,
        corredor.pais,
        corredor.moneda,
        corredor.formaEntrega,
        corredorId,
      );
      return tx.corredor.update({
        where: { id: corredorId },
        data: { activo: true, desactivadoAt: null, desactivadoPorId: null },
      });
    });
  }

  /** Todos los corredores, activos e inactivos. Para el panel del admin. */
  async listar(): Promise<Corredor[]> {
    return this.prisma.corredor.findMany({ orderBy: { creadoAt: 'asc' } });
  }

  /** Solo los activos. Para la app del cajero (escoger destino). */
  async listarActivos(): Promise<Corredor[]> {
    return this.prisma.corredor.findMany({
      where: { activo: true },
      orderBy: { creadoAt: 'asc' },
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
    moneda: string,
    formaEntrega: string,
    exceptoId?: string,
  ): Promise<void> {
    const existente = await tx.corredor.findFirst({
      where: {
        pais,
        moneda,
        formaEntrega,
        activo: true,
        ...(exceptoId ? { id: { not: exceptoId } } : {}),
      },
      select: { id: true },
    });
    if (existente) throw new CorredorDuplicadoException(pais, moneda, formaEntrega);
  }
}
