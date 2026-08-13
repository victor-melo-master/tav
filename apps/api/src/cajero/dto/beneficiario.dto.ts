import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Datos del beneficiario de una operación. Las cuentas destino cambian casi
 * siempre, así que no se guardan en una libreta: viajan embebidas en cada
 * operación (schema: campo `beneficiario` Json).
 */
export class BeneficiarioDto {
  @ApiProperty({ example: 'María González' })
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @ApiProperty({ example: 'V-12345678' })
  @IsString()
  @IsNotEmpty()
  documento!: string;

  @ApiProperty({ example: 'Banesco' })
  @IsString()
  @IsNotEmpty()
  banco!: string;

  @ApiProperty({ example: '0134...4471' })
  @IsString()
  @IsNotEmpty()
  cuenta!: string;

  @ApiProperty({ example: 'pago_movil' })
  @IsString()
  @IsNotEmpty()
  metodo!: string;
}
