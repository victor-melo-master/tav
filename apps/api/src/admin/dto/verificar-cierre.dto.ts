import { IsString, IsOptional, Matches, ValidateIf, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO para POST /admin/cierres/:id/verificar.
 *
 * El admin captura el efectivo que realmente recibió. El sistema calcula
 * la diferencia contra `efectivoDeclaradoCents` y marca el cierre como
 * `verificado` (sin diferencia) o `con_diferencia`.
 *
 * Si hay diferencia (recibido != declarado), la nota es OBLIGATORIA:
 * un descuadre sin explicación es ilegible en la auditoría.
 */
export class VerificarCierreDto {
  @ApiProperty({ description: 'Efectivo que el admin contó de verdad, en centavos (string)', example: '29500' })
  @IsString()
  @Matches(/^\d+$/, { message: 'efectivoRecibidoCents debe ser un entero de centavos no negativo' })
  efectivoRecibidoCents!: string;

  @ApiPropertyOptional({
    description: 'Nota del admin. OBLIGATORIA si hay diferencia entre lo declarado y lo recibido.',
  })
  // La nota es opcional en el DTO; la obligatoriedad condicional se valida en el
  // servicio, donde ya se sabe si hay diferencia. class-validator no tiene forma
  // limpia de expresar "obligatorio si otro campo calculado no coincide", y meter
  // aquí la lectura del cierre rompería la separación de capas.
  @IsOptional()
  @IsString()
  @ValidateIf((o) => typeof o.nota === 'string' && o.nota.length === 0)
  @IsNotEmpty({ message: 'Si incluye nota, no puede estar vacía' })
  nota?: string;
}
