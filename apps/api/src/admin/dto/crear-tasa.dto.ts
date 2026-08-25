import { IsString, IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const PARES = ['USDT_BS', 'USD_BS', 'ZELLE_BS'] as const;

/**
 * DTO para POST /admin/tasas.
 *
 * La tasa NO es dinero: viaja como string decimal ("285.400000") y se guarda
 * como Decimal(18,6). Es el único punto del sistema donde Decimal es correcto.
 * El par identifica qué conversión rige la tasa.
 */
export class CrearTasaDto {
  @ApiProperty({ enum: PARES, example: 'USDT_BS', description: 'Par de la tasa' })
  @IsString()
  @IsNotEmpty()
  par!: string;

  @ApiProperty({ description: 'Valor de la tasa (string decimal)', example: '285.400000' })
  @IsString()
  @Matches(/^\d+(\.\d+)?$/, { message: 'valor debe ser un número decimal positivo' })
  valor!: string;
}
