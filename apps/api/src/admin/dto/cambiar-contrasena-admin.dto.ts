import { IsString, MinLength, IsNotEmpty } from 'class-validator';

export class CambiarContrasenaAdminDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(4, { message: 'La contraseña debe tener al menos 4 caracteres' })
  nuevaContrasena!: string;
}
