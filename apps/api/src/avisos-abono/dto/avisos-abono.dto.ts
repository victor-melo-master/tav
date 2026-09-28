import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CrearAvisoAbonoDto {
  /**
   * Monto en centavos de GYD que el cajero dice tener listo para abonar.
   * Es una intención, no dinero real: viaja como string para no perder
   * precisión en JSON.
   */
  @IsString()
  @IsNotEmpty()
  montoCents!: string;

  @IsOptional()
  @IsString()
  nota?: string;
}
