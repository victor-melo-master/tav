import { IsOptional, IsInt, Min, Max, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { EstadoOperacion } from '@prisma/client';

/**
 * Query params de paginación compartidos. Los enteros vienen como string en
 * la query y class-transformer los convierte con @Type(() => Number).
 */
export class PaginacionDto {
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
 * Paginación + filtro por estado para GET /cajero/operaciones.
 */
export class PaginacionOperacionesDto extends PaginacionDto {
  @ApiPropertyOptional({
    enum: EstadoOperacion,
    description: 'Filtrar por estado de operación',
  })
  @IsOptional()
  @IsIn(Object.values(EstadoOperacion))
  estado?: EstadoOperacion;
}
