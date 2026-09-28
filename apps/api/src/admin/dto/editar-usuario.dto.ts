import {
  IsString,
  IsOptional,
  IsEmail,
  IsNotEmpty,
} from 'class-validator';

export class EditarUsuarioDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nombre?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsString()
  documento?: string;

  @IsOptional()
  @IsString()
  notas?: string;

  @IsOptional()
  @IsString()
  pais?: string;

  @IsOptional()
  @IsString()
  zona?: string;

  @IsOptional()
  @IsString()
  direccion?: string;
}
