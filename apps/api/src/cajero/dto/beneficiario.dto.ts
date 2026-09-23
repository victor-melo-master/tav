import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Datos del beneficiario de una operación. El cliente decidió mantenerlos
 * como texto libre: los países tienen formatos distintos y un formulario
 * fijo solo sirve para Venezuela. Se guardan embebidos en cada operación
 * (schema: campo `beneficiario` Json).
 */
export class BeneficiarioDto {
  @ApiProperty({ example: 'María González' })
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @ApiProperty({
    example: 'Pago móvil Banesco 0412-5551212\nCédula V-12345678',
    description: 'Texto libre con los datos que el pagador necesita',
  })
  @IsString()
  datos!: string;
}
