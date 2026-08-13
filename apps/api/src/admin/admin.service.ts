import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { CrearUsuarioDto } from './dto/crear-usuario.dto';

/**
 * Operaciones del administrador. Solo accesibles con @Roles('admin').
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crea un cajero o cobrador con su perfil en la misma transacción.
   * El teléfono es único: si ya existe, Prisma lanza P2002 → 409 Conflict.
   *
   * Para un cajero, limiteCents es obligatorio y se guarda como BigInt.
   * El admin fija el límite; puede modificarlo cuando quiera (Fase 4).
   */
  async crearUsuario(dto: CrearUsuarioDto, creadoPorId: string) {
    if (dto.rol === 'cajero' && !dto.limiteCents) {
      throw new BadRequestException('Un cajero requiere limiteCents');
    }

    const passwordHash = await argon2.hash(dto.password);

    try {
      const usuario = await this.prisma.$transaction(async (tx) => {
        const data: any = {
          rol: dto.rol,
          nombre: dto.nombre,
          telefono: dto.telefono,
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
        } else {
          data.perfilCobrador = {
            create: {
              zona: dto.zona,
            },
          };
        }

        return tx.usuario.create({ data, include: { perfilCajero: true, perfilCobrador: true } });
      });

      const { passwordHash: _ph, ...sinPassword } = usuario;
      return sinPassword;
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException(`Ya existe un usuario con teléfono ${dto.telefono}`);
      }
      throw e;
    }
  }
}
