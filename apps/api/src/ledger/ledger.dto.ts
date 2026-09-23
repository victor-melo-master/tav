import { MetodoCobro } from '@prisma/client';

/**
 * DTOs del núcleo contable. Todo monto es BigInt de centavos.
 * Las tasas no son dinero: viajan como string decimal ("285.400000").
 *
 * IMPORTANTE — campos de autoría (creadaPorId, registradoPorId):
 * Estos campos son INTERNOS del servicio. Nunca viajan en el cuerpo de la
 * petición HTTP. El controlador los inyecta a partir del JWT del usuario
 * autenticado (req.user.sub). Los DTOs de la capa HTTP (Fase 4) NO los
 * incluyen; class-validator con forbidNonWhitelisted los rechaza si un
 * cliente intenta enviarlos.
 */

export interface BeneficiarioDto {
  nombre: string;
  documento: string;
  banco: string;
  cuenta: string;
  metodo: string;
}

export interface RegistrarOperacionDto {
  clientUuid: string; // idempotencia — generado en el dispositivo
  cajeroId: string; // PerfilCajero.usuarioId
  tipo: string; // "usdt_bs" | "usd_efectivo_bs"
  montoOrigenCents: bigint; // dólares que el cajero envía
  monedaOrigen: string; // "USDT" | "USD"
  tasaAplicada: string; // precio congelado en el registro (GYD por 1 USD)
  totalCents: bigint; // deuda en GYD centavos, calculada por el servidor
  montoDestinoCents: bigint; // 0 al crear; el pagador lo registra al ejecutar
  monedaDestino: string; // "BS" — derivada del servicio
  beneficiario: BeneficiarioDto;
  comprobanteUrl?: string;
  /** Precio de compra del USDT congelado al registrar (del ingreso a la caja
   * madre más reciente hasta la fecha). Nullable: si no hay ingreso antes
   * de la operación, va null y el reporte la muestra sin margen. */
  precioCompraGyd?: string | null;
  /** INTERNO — el controlador lo inyecta desde el JWT. Nunca del body. */
  creadaPorId: string;
  /** Fase 9: corredor elegido por el cajero. La operación nace en `pendiente`. */
  corredorId?: string;
}

export interface RegistrarCobroDto {
  clientUuid: string; // idempotencia — CRÍTICO para el modo offline
  cajeroId: string;
  cobradorId?: string | null; // null si lo registró el admin
  metodo: MetodoCobro;
  montoCents: bigint; // en GYD — el cajero siempre paga en guyaneses
  comprobanteUrl?: string;
  nota?: string;
  /** INTERNO — el controlador lo inyecta desde el JWT. Nunca del body. */
  registradoPorId: string;
}

export type EstadoSemaforo = 'verde' | 'ambar' | 'rojo';

export interface SemaforoResultado {
  estado: EstadoSemaforo; // el peor de los dos ejes
  dias: number; // días transcurridos desde deudaDesde (0 si no hay deuda)
  pct: number; // saldo / límite efectivo, con ampliación activa incluida
  bloqueado: boolean; // pct >= 1 → no puede operar
  motivo: string; // texto legible del eje que manda
  disponibleCents: bigint; // límite efectivo − saldo, nunca negativo
}
