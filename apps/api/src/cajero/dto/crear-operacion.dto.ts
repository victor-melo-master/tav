import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsOptional,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BeneficiarioDto } from './beneficiario.dto';

const MONEDA_ORIGEN = ['USDT', 'USD'] as const;
const TIPO_OPERACION = ['usdt_bs', 'usd_efectivo_bs'] as const;

/**
 * DTO para POST /cajero/operaciones.
 *
 * El cajero manda servicio + monto en dólares, y nada más. La deuda la
 * calcula el servidor con el precio vigente del cajero y la congela en
 * `tasaAplicada`. Igual que hicimos con la tasa: si el cliente puede mandar
 * la cifra en GYD, puede mandarla mal.
 *
 * `comisionCents` dejó de existir: la comisión va dentro del precio. Un
 * campo que siempre vale cero termina confundiendo a quien lo lea.
 *
 * `monedaDestino` la deriva el servidor del servicio (`Corredor.moneda`):
 * si el cliente la manda, puede mandarla mal. `montoDestinoCents` lo
 * registra el pagador al ejecutar (paso 4); aquí va 0.
 *
 * `totalCents` (la deuda en GYD) lo calcula el servidor:
 *   totalCents = round_half_up(montoOrigenCents × precioGyd)
 *
 * cajeroId y creadaPorId NO van aquí: salen del JWT (req.user.sub).
 * forbidNonWhitelisted los rechaza si un cliente intenta enviarlos.
 */
export class CrearOperacionDto {
  @ApiProperty({ description: 'UUID generado en el dispositivo para idempotencia', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsString()
  @IsNotEmpty()
  clientUuid!: string;

  @ApiProperty({ enum: TIPO_OPERACION, example: 'usdt_bs' })
  @IsIn(TIPO_OPERACION)
  tipo!: string;

  @ApiProperty({ description: 'Monto en dólares que el cajero envía, en centavos (string)', example: '100000' })
  @IsString()
  @Matches(/^\d+$/, { message: 'montoOrigenCents debe ser un entero de centavos no negativo' })
  montoOrigenCents!: string;

  @ApiProperty({ enum: MONEDA_ORIGEN, example: 'USDT' })
  @IsIn(MONEDA_ORIGEN)
  monedaOrigen!: string;

  @ApiProperty({ type: BeneficiarioDto })
  @ValidateNested()
  @Type(() => BeneficiarioDto)
  beneficiario!: BeneficiarioDto;

  @ApiPropertyOptional({ description: 'Ruta del comprobante subido previamente' })
  @IsOptional()
  @IsString()
  comprobanteUrl?: string;

  @ApiProperty({ description: 'ID del servicio elegido (de /cajero/corredores)', example: 'abc-123' })
  @IsString()
  @IsNotEmpty()
  corredorId!: string;
}
