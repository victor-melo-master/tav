import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsOptional,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MetodoCobro } from '@prisma/client';

const METODOS = Object.values(MetodoCobro);
const MONEDAS = ['GYD', 'USD', 'BS', 'USDT'] as const;

/**
 * DTO para POST /cobrador/cobros.
 *
 * cobradorId y registradoPorId NO van aquí: salen del JWT (req.user.sub).
 * forbidNonWhitelisted los rechaza si un cliente intenta enviarlos.
 *
 * Los montos son strings de centavos (BigInt no existe en JSON).
 * La tasa viaja como string decimal y es obligatoria si moneda === 'BS'.
 */
export class RegistrarCobroDto {
  @ApiProperty({ description: 'UUID generado en el dispositivo para idempotencia', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsString()
  @IsNotEmpty()
  clientUuid!: string;

  @ApiProperty({ description: 'ID del cajero al que se le cobra', example: 'abc-123' })
  @IsString()
  @IsNotEmpty()
  cajeroId!: string;

  @ApiProperty({ enum: METODOS, example: 'efectivo_usd' })
  @IsIn(METODOS)
  metodo!: MetodoCobro;

  @ApiProperty({ description: 'Monto en centavos de la moneda recibida (string)', example: '50000' })
  @IsString()
  @Matches(/^\d+$/, { message: 'montoCents debe ser un entero de centavos no negativo' })
  montoCents!: string;

  @ApiProperty({ enum: MONEDAS, example: 'USD' })
  @IsIn(MONEDAS)
  moneda!: string;

  @ApiPropertyOptional({
    description: 'Tasa aplicada. Deprecado: el servicio lee la tasa vigente de la base de datos.',
    example: '209.000000',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d+)?$/, { message: 'tasaAplicada debe ser un número decimal positivo' })
  tasaAplicada?: string;

  @ApiPropertyOptional({ description: 'Ruta del comprobante subido previamente' })
  @IsOptional()
  @IsString()
  comprobanteUrl?: string;

  @ApiPropertyOptional({ description: 'Nota del cobrador' })
  @IsOptional()
  @IsString()
  nota?: string;
}
