import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import argon2 from 'argon2';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RefreshDto } from './dto/login.dto';
import { CambiarContrasenaDto } from './dto/cambiar-contrasena.dto';
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
 */
type UsuarioPublico = Omit<UsuarioConPerfiles, 'passwordHash'>;

/** Mínimo para firmar un JWT: quien es y qué versión de token tiene. */
type UsuarioParaToken = Pick<UsuarioConPerfiles, 'id' | 'rol' | 'nombre' | 'tokenVersion'>;



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
    const email = dto.email.trim().toLowerCase();
    const usuario = await this.prisma.usuario.findUnique({
      where: { email },
      include: { perfilCajero: true, perfilCobrador: true },
    });
    if (!usuario) throw new UnauthorizedException('Correo o contraseña incorrectos');
    if (!usuario.activo) throw new UnauthorizedException('Cuenta inactiva');

    const passwordOk = await argon2.verify(usuario.passwordHash, dto.password);
    if (!passwordOk) throw new UnauthorizedException('Correo o contraseña incorrectos');

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

  // ─────────────────────────── CAMBIAR CONTRASEÑA ───────────────────────────

  /**
   * Cambia la contraseña del usuario autenticado.
   *
   * Valida la contraseña actual, aplica la misma regla mínima que al crear
   * usuarios (no vacía) y, al guardar el nuevo hash, incrementa tokenVersion
   * para invalidar todos los tokens emitidos previamente.
   */
  async cambiarContrasena(
    userId: string,
    dto: CambiarContrasenaDto,
  ): Promise<{ ok: true }> {
    if (dto.nuevaContrasena.trim().length === 0) {
      throw new BadRequestException('La nueva contraseña no puede estar vacía');
    }
    if (dto.nuevaContrasena !== dto.confirmarContrasena) {
      throw new BadRequestException('La confirmación no coincide con la nueva contraseña');
    }

    const usuario = await this.prisma.usuario.findUnique({ where: { id: userId } });
    if (!usuario) throw new UnauthorizedException('Usuario no válido');

    const ok = await argon2.verify(usuario.passwordHash, dto.contrasenaActual);
    if (!ok) throw new UnauthorizedException('Contraseña actual incorrecta');

    const nuevoHash = await argon2.hash(dto.nuevaContrasena);
    await this.prisma.usuario.update({
      where: { id: userId },
      data: {
        passwordHash: nuevoHash,
        tokenVersion: { increment: 1 },
      },
    });
    return { ok: true };
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
   * Quita campos sensibles (passwordHash) antes de devolver el usuario.
   * BigInt se serializa como string (ver main.ts).
   */
  private perfilPublico(usuario: UsuarioConPerfiles): UsuarioPublico {
    const { passwordHash: _ph, ...resto } = usuario;
    return resto as UsuarioPublico;
  }
}
