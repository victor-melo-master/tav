import { Request } from 'express';

/**
 * Payload del JWT tal como lo firma AuthService y lo verifica JwtAuthGuard.
 * Viaja en `request.user` después de que el guard lo extrae del Bearer token.
 *
 * `tokenVersion` se incluye en el payload para que refresh/loginPin puedan
 * invalidar sesiones, pero los controladores no lo necesitan: les basta
 * `sub` (quién es) y `rol` (qué puede hacer).
 */
export interface JwtPayload {
  sub: string;
  rol: 'cajero' | 'cobrador' | 'admin';
  nombre: string;
  tokenVersion: number;
}

/**
 * Request de Express con el payload del JWT ya adjuntado por JwtAuthGuard.
 * Usar este tipo en los controladores en lugar de `any` para que el compilador
 * verifique `req.user.sub` y `req.user.rol`.
 */
export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}
