import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

/**
 * Guard global: si un endpoint tiene @Roles('admin'), verifica que el
 * usuario autenticado (puesto en request.user por JwtAuthGuard) tenga ese rol.
 * Si no tiene @Roles, lo deja pasar — la autenticación ya la hizo JwtAuthGuard.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user || !requiredRoles.includes(user.rol)) {
      throw new ForbiddenException(
        `Requiere rol: ${requiredRoles.join(', ')}`,
      );
    }
    return true;
  }
}
