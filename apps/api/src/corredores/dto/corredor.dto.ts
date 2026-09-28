import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CrearCorredorHttpDto {
  @IsString()
  @IsNotEmpty()
  pais!: string;

  @IsString()
  @IsNotEmpty()
  paisNombre!: string;

  @IsString()
  @IsNotEmpty()
  moneda!: string;

  @IsString()
  @IsNotEmpty()
  monedaNombre!: string;

  @IsString()
  @IsNotEmpty()
  formaEntrega!: string;

  @IsString()
  @IsNotEmpty()
  formaEntregaNombre!: string;

  @IsString()
  @IsNotEmpty()
  servicio!: string;

  @IsString()
  @IsNotEmpty()
  servicioNombre!: string;

  @IsString()
  @IsNotEmpty()
  cajaId!: string;
}

export class EditarCorredorHttpDto {
  @IsString()
  @IsOptional()
  cajaId?: string;

  @IsString()
  @IsOptional()
  formaEntrega?: string;

  @IsString()
  @IsOptional()
  formaEntregaNombre?: string;

  @IsString()
  @IsOptional()
  servicioNombre?: string;

  @IsString()
  @IsOptional()
  moneda?: string;

  @IsString()
  @IsOptional()
  monedaNombre?: string;
}
