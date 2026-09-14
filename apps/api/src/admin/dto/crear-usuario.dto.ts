import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsOptional,
  IsEmail,
} from 'class-validator';

/**
 * DTO para que el admin cree cajeros, cobradores o pagadores.
 * No hay registro público: las cuentas las crea el administrador.
 *
 * limiteCents viaja como string para evitar pérdida de precisión en JSON.
 * El controlador lo convierte a BigInt antes de pasárselo al servicio.
 *
 * El pagador requiere `pais` (código ISO-3): define qué cola ve.
 */
export class CrearUsuarioDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsIn(['cajero', 'cobrador', 'pagador'])
  rol!: 'cajero' | 'cobrador' | 'pagador';

  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsOptional()
  @IsString()
  documento?: string;

  // Obligatorio si rol === 'cajero'. Se valida en el servicio.
  @IsOptional()
  @IsString()
  limiteCents?: string;

  @IsOptional()
  @IsString()
  zona?: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  // Obligatorio si rol === 'pagador'. Código ISO-3 del país (VEN, BRA, ...).
  // Define qué cola ve el pagador.
  @IsOptional()
  @IsString()
  pais?: string;

  @IsOptional()
  @IsString()
  notas?: string;
}
