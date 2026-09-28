import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class DepositarCajaHttpDto {
  @IsString()
  @IsNotEmpty()
  clientUuid: string;

  @IsString()
  @IsNotEmpty()
  cajaId: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]+$/, { message: 'montoCents debe ser un entero positivo sin decimales' })
  montoCents: string;

  @IsString()
  @IsNotEmpty()
  motivo: string;
}
