import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import argon2 from 'argon2';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RefreshDto, SetPinDto, LoginPinDto } from './dto/login.dto';
import { PinBloqueadoException } from './auth.exceptions';
import { JwtPayload } from './auth.types';
import type { StringValue } from 'ms';

/**
 * Usuario con sus perfiles incluidos (para login y me).
 * Prisma genera este tipo a partir del `include` del findUnique.
 */
type UsuarioConPerfiles = Prisma.UsuarioGetPayload<{
  include: { perfilCajero: true; perfilCobrador: true };
}>;

/**
 * Usuario sin campos sensibles: lo que se devuelve al cliente.
 * `pinEstablecido` es un booleano derivado de `pinHash`, porque el hash
 * en sí nunca se envía al cliente.
 */
type UsuarioPublico = Omit<UsuarioConPerfiles, 'passwordHash' | 'pinHash'> & {
  pinEstablecido: boolean;
};

/** Mínimo para firmar un JWT: quien es y qué versión de token tiene. */
type UsuarioParaToken = Pick<UsuarioConPerfiles, 'id' | 'rol' | 'nombre' | 'tokenVersion'>;

const MAX_INTENTOS_PIN = 5;

@Injectable()
export class AuthService {
  private readonly refreshExpiresIn: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {
    this.refreshExpiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '30d';
  }

  // ─────────────────────────── LOGIN ───────────────────────────

  async login(dto: LoginDto): Promise<{ accessToken: string; refreshToken: string; usuario: UsuarioPublico }> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { telefono: dto.telefono },
      include: { perfilCajero: true, perfilCobrador: true },
    });
    if (!usuario) throw new UnauthorizedException('Teléfono o contraseña incorrectos');
    if (!usuario.activo) throw new UnauthorizedException('Cuenta inactiva');

    const passwordOk = await argon2.verify(usuario.passwordHash, dto.password);
    if (!passwordOk) throw new UnauthorizedException('Teléfono o contraseña incorrectos');

    // Login con contraseña exitoso → resetea el bloqueo del PIN.
    if (usuario.pinIntentos !== 0 || usuario.pinBloqueadoAt !== null) {
      await this.prisma.usuario.update({
        where: { id: usuario.id },
        data: { pinIntentos: 0, pinBloqueadoAt: null },
      });
    }

    return this.emitirTokensYUsuario(usuario);
  }

  // ─────────────────────────── REFRESH ───────────────────────────

  async refresh(dto: RefreshDto): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = await this.verificarRefreshToken(dto.refreshToken);
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: payload.sub },
    });
    if (!usuario || !usuario.activo) throw new UnauthorizedException('Usuario no válido');
    this.validarTokenVersion(payload, usuario.tokenVersion);

    return this.emitirTokens(usuario);
  }

  // ─────────────────────────── LOGOUT ───────────────────────────

  /**
   * Logout real: incrementa tokenVersion, lo que invalida todos los tokens
   * (access y refresh) emitidos antes del incremento. El cliente debe
   * descartarlos; si intenta usarlos, refresh/loginPin rechazan.
   */
  async logout(userId: string): Promise<{ ok: true }> {
    await this.prisma.usuario.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    return { ok: true };
  }

  /**
   * Cierra todas las sesiones del usuario. Mismo efecto que logout: incrementa
   * tokenVersion. Es la acción "Cerrar" de la pantalla de sesiones del prototipo.
   */
  async logoutAll(userId: string): Promise<{ ok: true }> {
    await this.prisma.usuario.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    return { ok: true };
  }

  // ─────────────────────────── ME ───────────────────────────

  async me(userId: string): Promise<UsuarioPublico> {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: userId },
      include: { perfilCajero: true, perfilCobrador: true },
    });
    return this.perfilPublico(usuario);
  }

  // ─────────────────────────── PIN ───────────────────────────

  /**
   * Establece el PIN de 4 dígitos con el que se reabre la app.
   * Requiere autenticación (access token): el usuario ya está dentro y
   * decide fijar o cambiar su PIN.
   */
  async setPin(userId: string, dto: SetPinDto): Promise<{ ok: true }> {
    if (!/^\d{4}$/.test(dto.pin)) {
      throw new UnauthorizedException('El PIN debe ser 4 dígitos numéricos');
    }
    const pinHash = await argon2.hash(dto.pin);
    await this.prisma.usuario.update({
      where: { id: userId },
      data: { pinHash },
    });
    return { ok: true };
  }

  // ─────────────────────────── LOGIN-PIN ───────────────────────────

  /**
   * Reingreso rápido: el usuario ya tiene un refresh token válido (no expirado)
   * que prueba que se autenticó antes. En lugar de pedir la contraseña de nuevo,
   * pide el PIN de 4 dígitos. Si el PIN cuadra, emite tokens nuevos.
   *
   * Bloqueo: tras MAX_INTENTOS_PIN (5) fallos consecutivos, pinBloqueadoAt se
   * fija y el usuario debe entrar con contraseña para desbloquear. Un PIN
   * correcto resetea el contador.
   */
  async loginPin(dto: LoginPinDto): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = await this.verificarRefreshToken(dto.refreshToken);
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: payload.sub },
    });
    if (!usuario || !usuario.activo) throw new UnauthorizedException('Usuario no válido');
    this.validarTokenVersion(payload, usuario.tokenVersion);
    if (!usuario.pinHash) throw new UnauthorizedException('PIN no establecido');

    // Si ya está bloqueado, no se permiten más intentos con PIN.
    if (usuario.pinBloqueadoAt !== null) {
      throw new PinBloqueadoException();
    }

    const pinOk = await argon2.verify(usuario.pinHash, dto.pin);
    if (!pinOk) {
      const nuevosIntentos = usuario.pinIntentos + 1;
      if (nuevosIntentos >= MAX_INTENTOS_PIN) {
        await this.prisma.usuario.update({
          where: { id: usuario.id },
          data: { pinIntentos: nuevosIntentos, pinBloqueadoAt: new Date() },
        });
        throw new PinBloqueadoException();
      }
      await this.prisma.usuario.update({
        where: { id: usuario.id },
        data: { pinIntentos: nuevosIntentos },
      });
      throw new UnauthorizedException(
        `PIN incorrecto. Intentos restantes: ${MAX_INTENTOS_PIN - nuevosIntentos}`,
      );
    }

    // PIN correcto → resetea el contador de fallos.
    if (usuario.pinIntentos !== 0) {
      await this.prisma.usuario.update({
        where: { id: usuario.id },
        data: { pinIntentos: 0 },
      });
    }

    return this.emitirTokens(usuario);
  }

  // ─────────────────────────── HELPERS ───────────────────────────

  private validarTokenVersion(payload: JwtPayload, versionBd: number): void {
    if (payload.tokenVersion !== versionBd) {
      throw new UnauthorizedException('Sesión invalidada');
    }
  }

  private async emitirTokensYUsuario(usuario: UsuarioConPerfiles): Promise<{ accessToken: string; refreshToken: string; usuario: UsuarioPublico }> {
    const tokens = await this.emitirTokens(usuario);
    return { ...tokens, usuario: this.perfilPublico(usuario) };
  }

  private async emitirTokens(usuario: UsuarioParaToken): Promise<{ accessToken: string; refreshToken: string }> {
    const payload: JwtPayload = {
      sub: usuario.id,
      rol: usuario.rol,
      nombre: usuario.nombre,
      tokenVersion: usuario.tokenVersion,
    };
    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = await this.jwtService.signAsync(payload, {
      // JwtSignOptions.expiresIn es `number | StringValue` (template literal
      // type de `ms`). Un string genérico no es asignable, aunque en runtime
      // sea lo mismo. El cast es seguro: refreshExpiresIn viene de
      // JWT_REFRESH_EXPIRES_IN con formato de duración de ms ("30d", "7d").
      expiresIn: this.refreshExpiresIn as StringValue,
    });
    return { accessToken, refreshToken };
  }

  private async verificarRefreshToken(token: string): Promise<JwtPayload> {
    try {
      return await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }
  }

  /**
   * Quita campos sensibles (passwordHash, pinHash) antes de devolver el usuario.
   * Añade `pinEstablecido` como booleano derivado, porque el hash no se envía.
   * BigInt se serializa como string (ver main.ts).
   */
  private perfilPublico(usuario: UsuarioConPerfiles): UsuarioPublico {
    const { passwordHash: _ph, pinHash: _pin, ...resto } = usuario;
    return { ...resto, pinEstablecido: usuario.pinHash !== null };
  }
}
