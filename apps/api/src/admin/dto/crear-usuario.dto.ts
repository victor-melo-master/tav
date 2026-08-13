import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsOptional,
  Matches,
} from 'class-validator';

/**
 * DTO para que el admin cree cajeros o cobradores.
 * No hay registro público: las cuentas las crea el administrador.
 *
 * limiteCents viaja como string para evitar pérdida de precisión en JSON.
 * El controlador lo convierte a BigInt antes de pasárselo al servicio.
 */
export class CrearUsuarioDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @IsString()
  @IsNotEmpty()
  telefono!: string;

  @IsIn(['cajero', 'cobrador'])
  rol!: 'cajero' | 'cobrador';

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

  @IsOptional()
  @IsString()
  notas?: string;
}
