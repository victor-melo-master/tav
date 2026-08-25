import { IsOptional, IsString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const ESTADOS_SEMAFORO = ['verde', 'ambar', 'rojo'] as const;

/**
 * Filtros para GET /admin/cajeros.
 *
 * - semaforo: filtra por estado del semáforo calculado (verde / ambar / rojo).
 *   El cálculo vive en SemaforoService; aquí solo se filtra el resultado.
 * - q: búsqueda libre por nombre o teléfono (coincidencia parcial, case-insensitive).
 */
export class ListarCajerosDto {
  @ApiPropertyOptional({ enum: ESTADOS_SEMAFORO, description: 'Filtra por estado del semáforo' })
  @IsOptional()
  @IsIn(ESTADOS_SEMAFORO)
  semaforo?: 'verde' | 'ambar' | 'rojo';

  @ApiPropertyOptional({ description: 'Búsqueda por nombre o teléfono (coincidencia parcial)' })
  @IsOptional()
  @IsString()
  q?: string;
}
