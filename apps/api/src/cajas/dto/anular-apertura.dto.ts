import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO HTTP para anular una apertura/recarga de caja.
 *
 * El motivo es obligatorio. actorId sale del JWT.
 */
export class AnularAperturaHttpDto {
  @ApiProperty({ description: 'El movimiento de apertura/recarga a anular' })
  @IsString()
  @IsNotEmpty()
  movimientoCajaId!: string;

  @ApiProperty({ description: 'Motivo de la anulación (obligatorio)', example: 'Apertura duplicada' })
  @IsString()
  @IsNotEmpty()
  motivo!: string;
}
