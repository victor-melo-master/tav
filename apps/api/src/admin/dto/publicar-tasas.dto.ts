import {
  IsArray,
  IsString,
  IsNotEmpty,
  Matches,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para POST /admin/tasas-corredor/publicar.
 *
 * La publicación es atómica: la pata base y todos los items se insertan en
 * una sola transacción. El admin publica todo de golpe.
 *
 * La pata base se captura como "1 USDT = X GYD" (ej 208), que es como cotiza
 * la gente. La fórmula la usa como divisor para convertir GYD→USDT.
 *
 * El margen es legible: 2.5 = 2.5%. La validación 0 ≤ margen < 100 vive en
 * el servicio (y en el CHECK de la BD), no aquí: class-validator no expone
 * "menor que 100" de forma limpia sobre un string decimal.
 */
export class PublicarTasaItemDto {
  @ApiProperty({ description: 'ID del corredor', example: 'abc-123' })
  @IsString()
  @IsNotEmpty()
  corredorId!: string;

  @ApiProperty({ description: 'Pata destino: 1 USDT = Y moneda destino (string decimal)', example: '285.4' })
  @IsString()
  @Matches(/^\d+(\.\d+)?$/, { message: 'pataDestino debe ser un número decimal positivo' })
  pataDestino!: string;

  @ApiProperty({ description: 'Margen legible: 2.5 = 2.5% (string decimal)', example: '2.5' })
  @IsString()
  @Matches(/^\d+(\.\d+)?$/, { message: 'margen debe ser un número decimal no negativo' })
  margen!: string;
}

export class PublicarTasasDto {
  @ApiProperty({ description: 'Pata base: 1 USDT = X GYD (string decimal)', example: '208' })
  @IsString()
  @Matches(/^\d+(\.\d+)?$/, { message: 'pataBase debe ser un número decimal positivo' })
  pataBase!: string;

  @ApiProperty({ type: [PublicarTasaItemDto], description: 'Un item por corredor activo' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Debe incluir al menos un corredor' })
  @ValidateNested({ each: true })
  @Type(() => PublicarTasaItemDto)
  items!: PublicarTasaItemDto[];
}
