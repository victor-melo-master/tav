import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type Tx = Prisma.TransactionClient;

export interface AuditEntry {
  actorId: string;
  accion: string;
  entidad: string;
  entidadId: string;
  antes?: Record<string, unknown> | null;
  despues?: Record<string, unknown> | null;
}

@Injectable()
export class AuditService {
  /**
   * Registra una entrada en AuditLog dentro de una transacción existente.
   * AuditLog es de solo inserción: nunca se actualiza ni borra.
   */
  async crear(
    tx: Tx,
    { actorId, accion, entidad, entidadId, antes, despues }: AuditEntry,
  ) {
    return tx.auditLog.create({
      data: {
        actorId,
        accion,
        entidad,
        entidadId,
        antes: (antes ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        despues: (despues ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });
  }
}
