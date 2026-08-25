import { IsString, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para POST /cobrador/cobros/:id/anular.
 *
 * El motivo es obligatorio y mínimo 10 caracteres. Un reverso sin motivo
 * es ilegible en la auditoría.
 */
export class AnularCobroDto {
  @ApiProperty({ description: 'Motivo de la anulación (mínimo 10 caracteres)', example: 'El cajero pagó dos veces el mismo monto' })
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'El motivo debe tener al menos 10 caracteres' })
  motivo!: string;
}
