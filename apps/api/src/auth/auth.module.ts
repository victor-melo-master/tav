import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ??
          (process.env.NODE_ENV === 'production'
            ? (() => { throw new Error('JWT_SECRET no definido en producción'); })()
            : 'dev-secret-no-prod'),
        signOptions: {
          // JwtSignOptions.expiresIn es `number | StringValue` donde StringValue
          // es un template literal type de `ms` (ej. "15m", "30d"). Un string
          // genérico no es asignable a ese tipo, aunque en runtime sea lo mismo.
          // El cast es seguro: los valores vienen de env vars con formato de ms.
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') ?? '15m') as StringValue,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
