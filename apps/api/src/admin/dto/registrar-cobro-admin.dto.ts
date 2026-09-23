import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsOptional,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MetodoCobro } from '@prisma/client';

const METODOS = Object.values(MetodoCobro);

/**
 * DTO para POST /admin/cobros.
 *
 * El admin registra un pago en nombre de un cajero, SIN cobrador. Reusa el
 * mismo `LedgerService.registrarCobro` del ledger: con `cobradorId` nulo no
 * se crea ni toca ningún cierre.
 *
 * `cobradorId` y `registradoPorId` NO van aquí: el servicio los inyecta
 * (cobradorId = null, registradoPorId = adminId del JWT). forbidNonWhitelisted
 * los rechaza si un cliente intenta enviarlos.
 *
 * El cajero siempre paga en guyaneses: el monto es en centavos de GYD.
 * No hay conversión de moneda.
 */
export class RegistrarCobroAdminDto {
  @ApiProperty({ description: 'UUID generado por el admin para idempotencia', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsString()
  @IsNotEmpty()
  clientUuid!: string;

  @ApiProperty({ description: 'ID del cajero al que se le registra el pago', example: 'abc-123' })
  @IsString()
  @IsNotEmpty()
  cajeroId!: string;

  @ApiProperty({ enum: METODOS, example: 'efectivo_gyd' })
  @IsIn(METODOS)
  metodo!: MetodoCobro;

  @ApiProperty({ description: 'Monto en centavos de GYD (string)', example: '50000' })
  @IsString()
  @Matches(/^\d+$/, { message: 'montoCents debe ser un entero de centavos no negativo' })
  montoCents!: string;

  @ApiPropertyOptional({ description: 'Ruta del comprobante subido previamente' })
  @IsOptional()
  @IsString()
  comprobanteUrl?: string;

  @ApiPropertyOptional({ description: 'Nota del admin' })
  @IsOptional()
  @IsString()
  nota?: string;
}
