import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsOptional,
  Matches,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MetodoCobro } from '@prisma/client';

const METODOS = Object.values(MetodoCobro);
const MONEDAS = ['USD', 'BS', 'USDT'] as const;

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
    description: 'Tasa aplicada. Obligatoria si moneda === "BS"',
    example: '285.400000',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d+)?$/, { message: 'tasaAplicada debe ser un número decimal positivo' })
  @ValidateIf((o) => o.moneda === 'BS')
  @IsNotEmpty({ message: 'tasaAplicada es obligatoria cuando moneda === "BS"' })
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
