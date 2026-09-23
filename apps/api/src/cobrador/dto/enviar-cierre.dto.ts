import { IsOptional, IsString, IsInt, Min, Max, IsNotEmpty, Matches } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * DTO para POST /cobrador/cierres/:id/enviar.
 *
 * El cobrador declara el efectivo que lleva en mano. El cajero siempre paga
 * en guyaneses: hay una sola pila de billetes que el admin cuenta.
 * El resto (digital, total) ya está calculado por el ledger.
 */
export class EnviarCierreDto {
  @ApiProperty({ description: 'Efectivo en billetes guyaneses que declara llevar (centavos de GYD, string)', example: '30000' })
  @IsString()
  @Matches(/^\d+$/, { message: 'efectivoDeclaradoCents debe ser un entero de centavos no negativo' })
  efectivoDeclaradoCents!: string;

  @ApiPropertyOptional({ description: 'Nota del cobrador para el admin' })
  @IsOptional()
  @IsString()
  notaCobrador?: string;
}

/**
 * DTO para POST /cobrador/atenciones.
 */
export class CrearAtencionDto {
  @ApiProperty({ description: 'ID del cajero que se va a atender', example: 'abc-123' })
  @IsString()
  @IsNotEmpty()
  cajeroId!: string;
}

/**
 * DTO para POST /cobrador/avisos.
 */
export class CrearAvisoDto {
  @ApiProperty({ description: 'ID del cajero destinatario del aviso', example: 'abc-123' })
  @IsString()
  @IsNotEmpty()
  cajeroId!: string;

  @ApiProperty({ description: 'Título del aviso', example: 'Recordatorio de pago' })
  @IsString()
  @IsNotEmpty()
  titulo!: string;

  @ApiProperty({ description: 'Cuerpo del aviso', example: 'Recuerda abonar para mantener tu semáforo en verde.' })
  @IsString()
  @IsNotEmpty()
  cuerpo!: string;
}

/**
 * Paginación para GET /cobrador/cierres.
 */
export class PaginacionCierresDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
