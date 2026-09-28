import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CrearCajaHttpDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @IsString()
  @IsNotEmpty()
  moneda!: string;

  @IsString()
  @IsOptional()
  pais?: string;

  @IsBoolean()
  @IsOptional()
  esMadre?: boolean;
}
