import { IsString, IsNotEmpty, Matches, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO HTTP para que el pagador ejecute un pago.
 *
 * El pagador escribe al marcar una operación como pagada:
 * - montoDestinoCents: los bolívares (o la moneda destino) que recibió el
 *   beneficiario. Llena el campo que el paso 3 dejó en 0.
 * - tasaEjecucion: la tasa real de ese pago (240, 244, 250...). No se
 *   precarga con la tasa cotizada: si se precarga nadie la cambia y el
 *   dato pierde valor.
 * - formaPago: pago móvil, transferencia, efectivo. Dato descriptivo
 *   más fino que la caja. La caja la determina el corredor, no la forma
 *   de pago.
 * - nombreCliente: el nombre del cliente que recibió.
 * - comprobantePagoUrl: la captura del pago (subida antes a
 *   /uploads/comprobante, que devolvió la ruta). Obligatoria.
 *
 * registradoPorId NO va aquí: sale del JWT (req.user.sub).
 * cajaId NO va aquí: el servicio lo deriva del corredor de la operación.
 * El pagador no elige la caja: el corredor ya es destino + forma de
 * entrega, y hay una caja por corredor.
 */
export class EjecutarPagoHttpDto {
  @ApiProperty({ description: 'UUID generado en el dispositivo para idempotencia' })
  @IsString()
  @IsNotEmpty()
  clientUuid!: string;

  @ApiProperty({ description: 'La operación que se paga' })
  @IsString()
  @IsNotEmpty()
  operacionId!: string;

  @ApiProperty({ description: 'Cuánto se descuenta de la caja, en centavos (string)', example: '28540000' })
  @IsString()
  @Matches(/^\d+$/, { message: 'montoCents debe ser un entero de centavos no negativo' })
  montoCents!: string;

  @ApiProperty({ description: 'Cuánto recibió el beneficiario en la moneda destino, en centavos (string)', example: '28540000' })
  @IsString()
  @Matches(/^\d+$/, { message: 'montoDestinoCents debe ser un entero de centavos no negativo' })
  montoDestinoCents!: string;

  @ApiProperty({ description: 'A cómo se ejecutó el cambio (240, 244, 250...). No es la cotizada.', example: '240.5' })
  @IsString()
  @Matches(/^\d+(\.\d+)?$/, { message: 'tasaEjecucion debe ser un número decimal positivo' })
  tasaEjecucion!: string;

  @ApiPropertyOptional({ description: 'Nota libre del pagador sobre la forma de pago (Pix, SPEI, Nequi, ...)', example: 'Pix' })
  @IsOptional()
  @IsString()
  formaPago?: string;

  @ApiProperty({ description: 'Nombre del cliente que recibió', example: 'María González' })
  @IsString()
  @IsNotEmpty()
  nombreCliente!: string;

  @ApiProperty({ description: 'Ruta de la captura del pago (devuelta por /uploads/comprobante)', example: '/uploads/abc-123.jpg' })
  @IsString()
  @IsNotEmpty()
  comprobantePagoUrl!: string;
}
