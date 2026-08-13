import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca una ruta como pública: el JwtAuthGuard global la deja pasar sin token.
 * Úsalo en los endpoints que no requieren autenticación (login, refresh, login-pin).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
