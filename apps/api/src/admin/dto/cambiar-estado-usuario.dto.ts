import { IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class CambiarEstadoUsuarioDto {
  @IsBoolean()
  @Type(() => Boolean)
  activo!: boolean;
}
