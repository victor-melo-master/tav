import { UnauthorizedException } from '@nestjs/common';

/**
 * El PIN del usuario está bloqueado tras 5 fallos consecutivos.
 * Debe entrar con contraseña para desbloquear.
 *
 * Extiende UnauthorizedException (401) para que Nest la mapee sin filtro.
 * El `code` viaja en el body para que el cliente lo distinga de un 401 genérico.
 */
export class PinBloqueadoException extends UnauthorizedException {
  readonly code = 'PIN_BLOQUEADO';
  constructor() {
    super('PIN bloqueado tras 5 intentos fallidos. Entre con contraseña para desbloquear.');
  }
}
