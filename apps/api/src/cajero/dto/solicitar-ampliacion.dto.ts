import { IsString, IsNotEmpty, Matches, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para POST /cajero/ampliaciones.
 * El cajero solicita una ampliación de cupo indicando monto y motivo.
 * El admin la aprueba o rechaza después.
 */
export class SolicitarAmpliacionDto {
  @ApiProperty({ description: 'Monto extra de cupo solicitado en centavos (string)', example: '50000' })
  @IsString()
  @Matches(/^\d+$/, { message: 'montoCents debe ser un entero de centavos no negativo' })
  montoCents!: string;

  @ApiProperty({ description: 'Motivo de la solicitud', example: 'Cliente grande esperando cambio' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'El motivo debe tener al menos 3 caracteres' })
  motivo!: string;
}
