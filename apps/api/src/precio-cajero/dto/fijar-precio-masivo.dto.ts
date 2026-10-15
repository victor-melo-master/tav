import { ArrayMinSize, IsArray, IsNotEmpty, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para POST /admin/servicios/:servicioId/precios.
 *
 * Fija el mismo precio GYD/USD para varios cajeros a la vez ("aplicar a
 * todos" es solo una foto del momento: el frontend manda la lista explícita
 * de cajeroIds seleccionados). Sobreescribe: para cada cajero se inserta una
 * fila nueva que se vuelve la vigente — la tabla sigue siendo solo inserción.
 *
 * `fijadoPorId` NO va aquí: sale del JWT (req.user.sub).
 */
export class FijarPrecioMasivoDto {
  @ApiProperty({ description: 'Precio en GYD por dólar (string decimal)', example: '240' })
  @IsString()
  @Matches(/^\d+(\.\d+)?$/, { message: 'precioGyd debe ser un número decimal positivo' })
  precioGyd!: string;

  @ApiProperty({ description: 'Cajeros a los que se les fija el precio', type: [String] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Debes seleccionar al menos un cajero' })
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  cajeroIds!: string[];
}
