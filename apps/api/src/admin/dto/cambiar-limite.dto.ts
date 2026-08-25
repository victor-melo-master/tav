import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para PATCH /admin/cajeros/:id/limite.
 *
 * El nuevo límite viaja como string de centavos (BigInt no existe en JSON).
 * El valor anterior y el nuevo quedan registrados en AuditLog por el servicio.
 */
export class CambiarLimiteDto {
  @ApiProperty({ description: 'Nuevo límite de crédito en centavos (string)', example: '200000' })
  @IsString()
  @Matches(/^\d+$/, { message: 'limiteCents debe ser un entero de centavos no negativo' })
  limiteCents!: string;
}
