import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Marca un endpoint (o controller) con los roles permitidos.
 * El RolesGuard global lo lee y rechaza con 403 si el usuario no tiene el rol.
 *
 *   @Roles('admin')
 *   @Controller('admin')
 *   export class AdminController { ... }
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
