import { IsString, IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para POST /admin/cajeros/:id/precios.
 *
 * Fija el precio de un servicio para un cajero. El precio es GYD por dólar,
 * capturado como string decimal (igual que `tasaAplicada` y `Tasa.valor`):
 * es un ratio, no un monto. La validación de positividad vive en el servicio.
 *
 * `cajeroId` y `fijadoPorId` NO van aquí: salen del JWT (req.user.sub).
 */
export class FijarPrecioCajeroDto {
  @ApiProperty({ description: 'ID del servicio (corredor) al que se le fija precio', example: 'abc-123' })
  @IsString()
  @IsNotEmpty()
  servicioId!: string;

  @ApiProperty({ description: 'Precio en GYD por dólar (string decimal)', example: '240' })
  @IsString()
  @Matches(/^\d+(\.\d+)?$/, { message: 'precioGyd debe ser un número decimal positivo' })
  precioGyd!: string;
}
