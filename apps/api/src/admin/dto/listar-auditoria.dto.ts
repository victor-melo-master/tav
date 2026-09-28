import { IsOptional, IsString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class ListarAuditoriaDto {
  @IsOptional()
  @IsString()
  actorId?: string;

  @IsOptional()
  @IsString()
  entidad?: string;

  @IsOptional()
  @IsString()
  entidadId?: string;

  /** Filtra acciones relacionadas con un cajero (entidadId o despues.cajeroId). */
  @IsOptional()
  @IsString()
  cajeroId?: string;

  @IsOptional()
  @IsString()
  accion?: string;

  @IsOptional()
  @IsString()
  fechaDesde?: string;

  @IsOptional()
  @IsString()
  fechaHasta?: string;

  @IsOptional()
  @IsIn(['creadoAt_desc', 'creadoAt_asc'])
  orden?: 'creadoAt_desc' | 'creadoAt_asc' = 'creadoAt_desc';

  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  limit?: number = 50;
}
