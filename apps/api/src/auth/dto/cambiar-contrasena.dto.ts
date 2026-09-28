import { IsString, IsNotEmpty } from 'class-validator';

export class CambiarContrasenaDto {
  @IsString()
  @IsNotEmpty()
  contrasenaActual!: string;

  @IsString()
  @IsNotEmpty()
  nuevaContrasena!: string;

  @IsString()
  @IsNotEmpty()
  confirmarContrasena!: string;
}
