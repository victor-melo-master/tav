import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Guard global: protege toda ruta que no tenga @Public().
 *
 * Extrae el Bearer token del header Authorization, lo verifica con JwtService,
 * y adjunta el payload (sub, rol, nombre) a request.user para que los
 * controladores y el RolesGuard lo usen.
 *
 * También actualiza ultimaVezAt del usuario en cada petición autenticada:
 * de ese campo sale la alerta de "cajero sin conectarse hace más de 3 días".
 * Es un UPDATE ligero sobre una fila por usuario; se hace fire-and-forget
 * para no añadir latencia a la petición.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('Token no proporcionado');

    let payload: { sub: string; rol: string; nombre: string };
    try {
      payload = await this.jwtService.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    request.user = payload;

    // Fire-and-forget: no bloquea la petición ni la falla si la BD se cae.
    this.prisma.usuario
      .update({
        where: { id: payload.sub },
        data: { ultimaVezAt: new Date() },
      })
      .catch(() => {});

    return true;
  }

  private extractToken(request: any): string | null {
    const [type, token] = request.headers?.authorization?.split(' ') ?? [];
    return type === 'Bearer' && token ? token : null;
  }
}
