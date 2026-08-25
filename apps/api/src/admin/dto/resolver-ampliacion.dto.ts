import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO para POST /admin/ampliaciones/:id/aprobar y /rechazar.
 *
 * La nota del admin es opcional en ambos casos. Se guarda en `notaAdmin`
 * para que quede registrado el motivo de la decisión.
 */
export class ResolverAmpliacionDto {
  @ApiPropertyOptional({ description: 'Nota del admin explicando la decisión' })
  @IsOptional()
  @IsString()
  nota?: string;
}
