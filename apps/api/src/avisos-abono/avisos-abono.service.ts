import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoAvisoAbono, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CrearAvisoAbonoDto } from './dto/avisos-abono.dto';

type AvisoAbonoRaw = {
  id: string;
  cajeroId: string;
  montoCents: bigint;
  nota: string | null;
  estado: EstadoAvisoAbono;
  creadoAt: Date;
  actualizadoAt: Date;
};

export interface AvisoAbonoResponse {
  id: string;
  cajeroId: string;
  montoCents: string;
  nota: string | null;
  estado: EstadoAvisoAbono;
  creadoAt: Date;
  actualizadoAt: Date;
}

function toResponse(a: AvisoAbonoRaw): AvisoAbonoResponse {
  return {
    ...a,
    montoCents: a.montoCents.toString(),
  };
}

@Injectable()
export class AvisosAbonoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Marca los avisos enviados de más de 24h como caducados y devuelve los
   * que aún están activos (enviados) para los cajeros indicados.
   * Si no se pasan cajeros, caduca todos y devuelve vacío.
   */
  async caducarYListarActivos(cajeroIds?: string[]): Promise<AvisoAbonoResponse[]> {
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    await this.prisma.avisoAbono.updateMany({
      where: {
        estado: 'enviado',
        creadoAt: { lt: hace24h },
        ...(cajeroIds ? { cajeroId: { in: cajeroIds } } : {}),
      },
      data: { estado: 'caducado' },
    });

    const rows = await this.prisma.avisoAbono.findMany({
      where: {
        estado: 'enviado',
        ...(cajeroIds ? { cajeroId: { in: cajeroIds } } : {}),
      },
      orderBy: { creadoAt: 'desc' },
    });
    return rows.map(toResponse);
  }

  /**
   * Devuelve el aviso enviado activo de un cajero, o null si no tiene.
   * Caduca avisos viejos antes de consultar.
   */
  async obtenerActivo(cajeroId: string): Promise<AvisoAbonoResponse | null> {
    await this.caducarYListarActivos([cajeroId]);
    const row = await this.prisma.avisoAbono.findFirst({
      where: { cajeroId, estado: 'enviado' },
      orderBy: { creadoAt: 'desc' },
    });
    return row ? toResponse(row) : null;
  }

  /**
   * El cajero crea un aviso de abono.
   *
   * No toca el ledger, no modifica saldo ni cupo. Es solo un aviso para el
   * cobrador de que tiene plata lista.
   */
  async crear(cajeroId: string, dto: CrearAvisoAbonoDto): Promise<AvisoAbonoResponse> {
    const montoCents = BigInt(dto.montoCents);
    if (montoCents <= 0n) {
      throw new BadRequestException('El monto debe ser mayor a cero');
    }

    // Caducar avisos anteriores antes de permitir uno nuevo, para no duplicar.
    await this.caducarYListarActivos([cajeroId]);

    const existeEnvido = await this.prisma.avisoAbono.findFirst({
      where: { cajeroId, estado: 'enviado' },
    });
    if (existeEnvido) {
      throw new BadRequestException('Ya tienes un aviso enviado. Cancela el anterior para crear uno nuevo.');
    }

    const row = await this.prisma.avisoAbono.create({
      data: {
        cajeroId,
        montoCents,
        nota: dto.nota?.trim() || null,
        estado: 'enviado',
      },
    });
    return toResponse(row);
  }

  /**
   * Lista todos los avisos de un cajero, caducando primero los viejos.
   */
  async listarPorCajero(cajeroId: string): Promise<AvisoAbonoResponse[]> {
    await this.caducarYListarActivos([cajeroId]);
    const rows = await this.prisma.avisoAbono.findMany({
      where: { cajeroId },
      orderBy: { creadoAt: 'desc' },
    });
    return rows.map(toResponse);
  }

  /**
   * El cajero cancela un aviso suyo que aún esté enviado.
   */
  async cancelar(cajeroId: string, avisoId: string): Promise<AvisoAbonoResponse> {
    const aviso = await this.prisma.avisoAbono.findUnique({ where: { id: avisoId } });
    if (!aviso || aviso.cajeroId !== cajeroId) {
      throw new NotFoundException('Aviso no encontrado');
    }
    if (aviso.estado !== 'enviado') {
      throw new BadRequestException('Solo se pueden cancelar avisos enviados');
    }

    const row = await this.prisma.avisoAbono.update({
      where: { id: avisoId },
      data: { estado: 'cancelado' },
    });
    return toResponse(row);
  }

  /**
   * Cierra todos los avisos enviados de un cajero al registrarle un cobro real.
   * No toca dinero: solo cambia el estado del aviso a atendido.
   */
  async cerrarPorCobro(cajeroId: string): Promise<Prisma.BatchPayload> {
    await this.caducarYListarActivos([cajeroId]);
    return this.prisma.avisoAbono.updateMany({
      where: { cajeroId, estado: 'enviado' },
      data: { estado: 'atendido' },
    });
  }
}
