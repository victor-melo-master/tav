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
  montoOrigenCents: bigint;
  monedaOrigen: string; // "USDT" | "USD"
  tasaAplicada: string; // tasa congelada en el registro
  comisionCents: bigint;
  totalCents: bigint; // lo que suma a la deuda = montoOrigen + comisión
  montoDestinoCents: bigint;
  monedaDestino: string; // "BS"
  beneficiario: BeneficiarioDto;
  comprobanteUrl?: string;
  /** INTERNO — el controlador lo inyecta desde el JWT. Nunca del body. */
  creadaPorId: string;
}

export interface RegistrarCobroDto {
  clientUuid: string; // idempotencia — CRÍTICO para el modo offline
  cajeroId: string;
  cobradorId?: string | null; // null si lo registró el admin
  metodo: MetodoCobro;
  montoCents: bigint; // en la moneda en que se recibió
  moneda: 'USD' | 'BS' | 'USDT';
  tasaAplicada?: string | null; // obligatoria si moneda === 'BS'
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
