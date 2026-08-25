import { IsOptional, IsString, IsIn, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

const ESTADOS_AMPLIACION = ['pendiente', 'aprobada', 'rechazada', 'consumida', 'expirada'] as const;
const ESTADOS_CIERRE = ['abierto', 'enviado', 'verificado', 'con_diferencia'] as const;

/**
 * Filtros para GET /admin/ampliaciones.
 * Las pendientes salen primeras sin importar el filtro.
 */
export class ListarAmpliacionesDto {
  @ApiPropertyOptional({ enum: ESTADOS_AMPLIACION, description: 'Filtra por estado de la ampliación' })
  @IsOptional()
  @IsIn(ESTADOS_AMPLIACION)
  estado?: 'pendiente' | 'aprobada' | 'rechazada' | 'consumida' | 'expirada';
}

/**
 * Filtros para GET /admin/cierres.
 * Los enviados salen primeros sin importar el filtro.
 *
 * Combina el filtro por estado con la paginación en un solo DTO: NestJS no
 * puede bindar dos @Query() distintos a la misma query string cuando hay
 * `forbidNonWhitelisted: true` (cada DTO rechaza los campos del otro).
 */
export class ListarCierresDto {
  @ApiPropertyOptional({ enum: ESTADOS_CIERRE, description: 'Filtra por estado del cierre' })
  @IsOptional()
  @IsIn(ESTADOS_CIERRE)
  estado?: 'abierto' | 'enviado' | 'verificado' | 'con_diferencia';

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

/**
 * Paginación genérica para los listados del admin.
 */
export class PaginacionAdminDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
