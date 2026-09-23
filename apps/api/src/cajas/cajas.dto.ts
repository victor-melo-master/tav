import { Caja, MovimientoCaja, Operacion } from '@prisma/client';

/**
 * Tipos del módulo de cajas y corredores. Todo monto es bigint de CENTAVOS
 * en la moneda de la caja correspondiente (no siempre GYD: USDT, BS, BRL...).
 * Las tasas viajan como string decimal ("285.4"); nunca son dinero.
 *
 * Campos de autoría (registradoPorId, creadoPorId, actorId): INTERNOS del
 * servicio. La capa HTTP los inyecta desde el JWT, nunca del body.
 *
 * Contrato: docs/08-contrato-cajas.md.
 */

export interface IngresarCajaMadreDto {
  clientUuid: string; // idempotencia
  cajaMadreId: string; // la caja madre a la que entra el USDT
  montoCents: bigint; // en centavos de la moneda de la caja madre (USDT)
  precioCompraGyd: string; // precio al que se compró el USDT (GYD por 1 USD). Obligatorio, > 0.
  motivo: string; // obligatorio: "recarga de capital", "venta del día", ...
  registradoPorId: string; // el admin
}

export interface AbrirCajaDto {
  clientUuid: string; // idempotencia
  cajaId: string; // la caja del corredor que se abre/recarga
  cajaMadreId: string; // de dónde sale el USDT
  montoMadreCents: bigint; // cuánto USDT sale de la caja madre (centavos USDT)
  montoDestinoCents: bigint; // cuánto entra en la caja destino (centavos de la moneda del corredor)
  tasaConversion: string; // tasa USDT → moneda del corredor. Se congela.
  registradoPorId: string; // el admin
}

export interface EjecutarPagoDto {
  clientUuid: string; // idempotencia
  operacionId: string; // la operación que se paga
  cajaId: string; // de qué caja del corredor sale la plata
  montoCents: bigint; // cuánto se descuenta de la caja (centavos de la moneda del corredor)
  montoDestinoCents: bigint; // cuánto recibió el beneficiario (centavos de la moneda destino). Llena el campo que dejó en 0 el paso 3.
  tasaEjecucion: string; // a cómo se ejecutó el cambio (240, 244, 250...). Se congela.
  formaPago: string; // "pago_movil" | "transferencia" | "efectivo" | ...
  nombreCliente: string; // el nombre del cliente que recibió
  comprobantePagoUrl: string; // captura del pago (subida antes, ruta devuelta por /uploads/comprobante)
  registradoPorId: string; // el pagador
}

export interface AnularAperturaDto {
  movimientoCajaId: string; // el movimiento de apertura/recarga a anular
  motivo: string; // obligatorio
  actorId: string; // el admin
}

export interface AnularPagoDto {
  movimientoCajaId: string; // el movimiento de pago a anular
  motivo: string;
  actorId: string;
}

export interface CrearCorredorDto {
  pais: string; // código ISO-3: "VEN", "BRA", ...
  paisNombre: string; // "Venezuela"
  moneda: string; // código ISO-4217: "BS", "USD", "BRL", ...
  monedaNombre: string; // "Bolívares"
  formaEntrega: string; // "transferencia" | "efectivo" | ...
  formaEntregaNombre: string; // etiqueta legible
  servicio: string; // "bcv" | "tasa_especial" | "efectivo" | "pix" | ... — el producto
  servicioNombre: string; // "BCV", "Tasa especial" — etiqueta legible
  cajaId: string; // → Caja.id (la caja física de la que descuenta)
  creadoPorId: string; // el admin
}

export interface EditarCorredorDto {
  cajaId?: string; // cambiar la caja física (valida moneda y no-madre)
  formaEntrega?: string;
  formaEntregaNombre?: string;
  servicioNombre?: string; // etiqueta legible (el código `servicio` no se edita)
  moneda?: string; // cambia la moneda del servicio (valida contra la caja)
  monedaNombre?: string;
}

export interface CajaResultado {
  caja: Caja; // la caja afectada, con saldoCents actualizado
  movimiento: MovimientoCaja; // el movimiento insertado (o el existente si yaExistia)
  yaExistia: boolean; // true si el clientUuid ya estaba
}

export interface AperturaResultado {
  cajaDestino: Caja;
  cajaMadre: Caja;
  movimientoDestino: MovimientoCaja; // tipo apertura/recarga, monto +
  movimientoMadre: MovimientoCaja; // tipo transferencia, monto −
  yaExistia: boolean;
}

export interface PagoResultado {
  operacion: Operacion; // la operación marcada como pagada
  caja: Caja; // la caja descontada
  movimiento: MovimientoCaja; // el movimiento de pago insertado (o el existente)
  yaExistia: boolean;
}

export interface AlertaCaja {
  cajaId: string;
  tipo: 'saldo_bajo' | 'saldo_negativo';
  saldoCents: bigint;
  umbralAlertaCents: bigint | null;
  moneda: string;
  cajaNombre: string; // "Bolívares en cuenta" o "Caja madre USDT" — de Caja.nombre
}
