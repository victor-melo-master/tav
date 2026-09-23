import { IsString, IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO HTTP para registrar un ingreso a la caja madre.
 *
 * El motivo es obligatorio: "recarga de capital", "venta del día", ...
 * registradoPorId NO va aquí: sale del JWT.
 */
export class IngresarCajaMadreHttpDto {
  @ApiProperty({ description: 'UUID generado en el dispositivo para idempotencia' })
  @IsString()
  @IsNotEmpty()
  clientUuid!: string;

  @ApiProperty({ description: 'La caja madre a la que entra el USDT' })
  @IsString()
  @IsNotEmpty()
  cajaMadreId!: string;

  @ApiProperty({ description: 'Cuánto entra, en centavos (string)', example: '300000' })
  @IsString()
  @Matches(/^\d+$/, { message: 'montoCents debe ser un entero de centavos no negativo' })
  montoCents!: string;

  @ApiProperty({ description: 'Precio al que se compró el USDT (GYD por 1 USD). Obligatorio, > 0.', example: '237' })
  @IsString()
  @Matches(/^\d+(\.\d+)?$/, { message: 'precioCompraGyd debe ser un número decimal positivo' })
  precioCompraGyd!: string;

  @ApiProperty({ description: 'Motivo del ingreso (obligatorio)', example: 'Recarga de capital' })
  @IsString()
  @IsNotEmpty()
  motivo!: string;
}
