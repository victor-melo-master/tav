import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsOptional,
  Matches,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  Validate,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BeneficiarioDto } from './beneficiario.dto';

/**
 * Validación de coherencia aritmética de la operación.
 *
 * Cierra el pendiente 12 de docs/01-reglas-de-negocio.md (caso 18 del contrato
 * del ledger): el ledger asienta lo que le mandan — no comprueba que
 * totalCents == montoOrigenCents + comisionCents. Esta validación vive en la
 * capa HTTP, antes de llegar al ledger, para que un DTO incoherente se rechace
 * con 400 antes de tocar la base de datos.
 *
 * Los montos viajan como string (BigInt no existe en JSON) y se convierten a
 * BigInt solo para la comparación.
 */
@ValidatorConstraint({ name: 'coherenciaAritmetica', async: false })
export class CoherenciaAritmeticaConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const dto = args.object as CrearOperacionDto;
    try {
      const total = BigInt(dto.totalCents);
      const origen = BigInt(dto.montoOrigenCents);
      const comision = BigInt(dto.comisionCents);
      return total === origen + comision;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return 'totalCents debe ser igual a montoOrigenCents + comisionCents';
  }
}

const MONEDA_ORIGEN = ['USDT', 'USD'] as const;
const TIPO_OPERACION = ['usdt_bs', 'usd_efectivo_bs'] as const;

/**
 * DTO para POST /cajero/operaciones.
 *
 * cajeroId y creadaPorId NO van aquí: salen del JWT (req.user.sub).
 * forbidNonWhitelisted los rechaza si un cliente intenta enviarlos.
 *
 * Los montos son strings de centavos (BigInt serializado).
 *
 * tasaAplicada y montoDestinoCents NO van aquí: el servidor los calcula
 * a partir de la publicación vigente del corredor. El cliente manda
 * corredorId y montoOrigenCents; el servidor lee la tasa publicada,
 * la congela en la operación, y calcula el monto destino con
 * calcularMontoDestinoCents (Decimal + ROUND_HALF_UP). Esto es lo mismo
 * que hace el ledger con los cobros en convertirAMonedaBase.
 */
export class CrearOperacionDto {
  @ApiProperty({ description: 'UUID generado en el dispositivo para idempotencia', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsString()
  @IsNotEmpty()
  clientUuid!: string;

  @ApiProperty({ enum: TIPO_OPERACION, example: 'usdt_bs' })
  @IsIn(TIPO_OPERACION)
  tipo!: string;

  @ApiProperty({ description: 'Monto de origen en centavos (string)', example: '100000' })
  @IsString()
  @Matches(/^\d+$/, { message: 'montoOrigenCents debe ser un entero de centavos no negativo' })
  montoOrigenCents!: string;

  @ApiProperty({ enum: MONEDA_ORIGEN, example: 'USDT' })
  @IsIn(MONEDA_ORIGEN)
  monedaOrigen!: string;

  @ApiProperty({ description: 'Comisión de TAV en centavos (string)', example: '3000' })
  @IsString()
  @Matches(/^\d+$/, { message: 'comisionCents debe ser un entero de centavos no negativo' })
  comisionCents!: string;

  @ApiProperty({ description: 'Total que suma a la deuda = montoOrigenCents + comisionCents', example: '103000' })
  @IsString()
  @Matches(/^\d+$/, { message: 'totalCents debe ser un entero de centavos no negativo' })
  totalCents!: string;

  @ApiProperty({ example: 'BS' })
  @IsString()
  @IsNotEmpty()
  monedaDestino!: string;

  @ApiProperty({ type: BeneficiarioDto })
  @ValidateNested()
  @Type(() => BeneficiarioDto)
  beneficiario!: BeneficiarioDto;

  @ApiPropertyOptional({ description: 'Ruta del comprobante subido previamente' })
  @IsOptional()
  @IsString()
  comprobanteUrl?: string;

  @ApiProperty({ description: 'ID del corredor elegido (de /cajero/corredores)', example: 'abc-123' })
  @IsString()
  @IsNotEmpty()
  corredorId!: string;

  // Validación a nivel de clase: totalCents == montoOrigenCents + comisionCents.
  // Cierra el pendiente 12 de docs/01-reglas-de-negocio.md.
  @Validate(CoherenciaAritmeticaConstraint)
  _coherencia?: void;
}
