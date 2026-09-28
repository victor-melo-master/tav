import { IsOptional, IsString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class ListarUsuariosDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(['admin', 'cajero', 'cobrador', 'pagador'])
  rol?: 'admin' | 'cajero' | 'cobrador' | 'pagador';

  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;
}
