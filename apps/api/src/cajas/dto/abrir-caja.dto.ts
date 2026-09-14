import {
  IsString,
  IsNotEmpty,
  Matches,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  Validate,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { cuadraApertura } from '../coherencia-caja';

/**
 * Validación de coherencia aritmética de la apertura/recarga.
 *
 * Caso 26 del contrato de cajas (docs/08-contrato-cajas.md): el admin teclea
 * los tres números a mano y el servicio asienta lo que le mandan — no
 * comprueba que cuadren. Una cifra mal puesta pasaría derecho y dejaría la
 * caja con un saldo falso. Sigue el precedente del ledger
 * (CoherenciaAritmeticaConstraint en crear-operacion.dto.ts): la validación
 * vive en el DTO HTTP, con tolerancia para redondeo, y rechaza con 400 antes
 * de tocar la base.
 *
 * La lógica vive en coherencia-caja.ts (compartida con el seed) para que
 * los datos de demostración pasen por la misma validación que los de runtime.
 */
@ValidatorConstraint({ name: 'coherenciaAritmeticaCaja', async: false })
export class CoherenciaAritmeticaCajaConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const dto = args.object as AbrirCajaHttpDto;
    try {
      return cuadraApertura(
        BigInt(dto.montoMadreCents),
        BigInt(dto.montoDestinoCents),
        dto.tasaConversion,
      );
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return 'montoDestinoCents no cuadra con montoMadreCents × tasaConversion (fuera de la tolerancia de redondeo)';
  }
}

/**
 * DTO HTTP para abrir/recargar una caja de corredor.
 *
 * registradoPorId NO va aquí: sale del JWT (req.user.sub);
 * forbidNonWhitelisted lo rechaza si un cliente intenta enviarlo.
 * Los montos son strings de centavos (BigInt no existe en JSON).
 */
export class AbrirCajaHttpDto {
  @ApiProperty({ description: 'UUID generado en el dispositivo para idempotencia', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsString()
  @IsNotEmpty()
  clientUuid!: string;

  @ApiProperty({ description: 'La caja del corredor que se abre/recarga' })
  @IsString()
  @IsNotEmpty()
  cajaId!: string;

  @ApiProperty({ description: 'La caja madre de la que sale el USDT' })
  @IsString()
  @IsNotEmpty()
  cajaMadreId!: string;

  @ApiProperty({ description: 'Cuánto sale de la caja madre, en centavos (string)', example: '300000' })
  @IsString()
  @Matches(/^\d+$/, { message: 'montoMadreCents debe ser un entero de centavos no negativo' })
  montoMadreCents!: string;

  @ApiProperty({ description: 'Cuánto entra en la caja destino, en centavos (string)', example: '85620000' })
  @IsString()
  @Matches(/^\d+$/, { message: 'montoDestinoCents debe ser un entero de centavos no negativo' })
  montoDestinoCents!: string;

  @ApiProperty({ description: 'Tasa USDT → moneda del corredor, congelada en el registro', example: '285.4' })
  @IsString()
  @Matches(/^\d+(\.\d+)?$/, { message: 'tasaConversion debe ser un número decimal positivo' })
  tasaConversion!: string;

  // Validación a nivel de clase: montoDestinoCents ≈ montoMadreCents ×
  // tasaConversion, con tolerancia de redondeo. Caso 26 del contrato de cajas.
  @Validate(CoherenciaAritmeticaCajaConstraint)
  _coherencia?: void;
}
