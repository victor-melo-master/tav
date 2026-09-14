/**
 * Excepciones del núcleo contable.
 *
 * Son clases planas (no HttpException): el ledger no sabe de HTTP.
 * La capa de controladores (Fase 4) las mapea a códigos de estado:
 *   SinCupoException        → 409 SIN_CUPO
 *   YaAnuladoException      → 409 YA_ANULADO
 *   CierreNoAbiertoException→ 409 CIERRE_NO_ABIERTO
 *   TasaRequeridaException  → 422 TASA_REQUERIDA
 *   MotivoRequeridoException→ 422 MOTIVO_REQUERIDO
 *   CajeroNoValidoException → 422 CAJERO_NO_VALIDO
 *   CobradorNoValidoException → 422 COBRADOR_NO_VALIDO
 *   NoEncontradoException   → 404
 *   ConfigFaltanteException → 500 (error de despliegue, no del usuario)
 */

export abstract class LedgerException extends Error {
  abstract readonly code: string;
}

/** El total de la operación excede el cupo disponible (límite efectivo − saldo). */
export class SinCupoException extends LedgerException {
  readonly code = 'SIN_CUPO';
  constructor(
    readonly payload: {
      disponible: bigint; // límite efectivo − saldo actual (puede ser negativo si ya está sobregirado)
      requerido: bigint; // totalCents de la operación rechazada
      faltante: bigint; // requerido − disponible, siempre > 0
    },
  ) {
    super(
      `Sin cupo: disponible ${payload.disponible}, requerido ${payload.requerido}, faltante ${payload.faltante}`,
    );
  }
}

/** El registro (operación o cobro) ya fue anulado antes. */
export class YaAnuladoException extends LedgerException {
  readonly code = 'YA_ANULADO';
  constructor(readonly tipo: 'operacion' | 'cobro', readonly id: string) {
    super(`${tipo} ${id} ya está anulado`);
  }
}

/** El cierre del cobrador para hoy existe pero ya no está en estado `abierto`. */
export class CierreNoAbiertoException extends LedgerException {
  readonly code = 'CIERRE_NO_ABIERTO';
  constructor(readonly cierreId: string, readonly estado: string) {
    super(`El cierre ${cierreId} está en estado "${estado}", no admite más cobros`);
  }
}

/** No se encontró tasa vigente para la moneda de cobro. Sin tasa no hay conversión a GYD. */
export class TasaRequeridaException extends LedgerException {
  readonly code = 'TASA_REQUERIDA';
  constructor() {
    super('No hay tasa vigente para la moneda de cobro — no se puede convertir a la moneda base');
  }
}

/** Anular exige motivo. Un reverso sin motivo es ilegible en la auditoría. */
export class MotivoRequeridoException extends LedgerException {
  readonly code = 'MOTIVO_REQUERIDO';
  constructor() {
    super('Anular requiere un motivo no vacío');
  }
}

/**
 * El cajeroId recibido no corresponde a un PerfilCajero existente.
 * Se valida ANTES de abrir la transacción: es un valor que no cambia durante
 * la petición, no hay carrera que proteger, y así no se alarga la sección
 * crítica bajo el FOR UPDATE.
 */
export class CajeroNoValidoException extends LedgerException {
  readonly code = 'CAJERO_NO_VALIDO';
  constructor(readonly cajeroId: string) {
    super(`cajeroId ${cajeroId} no corresponde a un PerfilCajero`);
  }
}

/**
 * El cobradorId recibido no corresponde a un PerfilCobrador existente.
 * Misma rationale que CajeroNoValidoException: validación previa a la tx.
 */
export class CobradorNoValidoException extends LedgerException {
  readonly code = 'COBRADOR_NO_VALIDO';
  constructor(readonly cobradorId: string) {
    super(`cobradorId ${cobradorId} no corresponde a un PerfilCobrador`);
  }
}

export class NoEncontradoException extends LedgerException {
  readonly code = 'NO_ENCONTRADO';
  constructor(readonly entidad: string, readonly id: string) {
    super(`${entidad} ${id} no existe`);
  }
}

/**
 * Otro cobrador ya tiene una atención activa sobre el cajero.
 * No se puede marcar "lo estoy atendiendo" hasta que se libere.
 */
export class AtencionEnUsoException extends LedgerException {
  readonly code = 'ATENCION_EN_USO';
  constructor(readonly cajeroId: string, readonly cobradorId: string) {
    super(`El cajero ${cajeroId} ya está siendo atendido por el cobrador ${cobradorId}`);
  }
}

/** Falta una clave de configuración en la tabla Config. Los umbrales nunca van quemados. */
export class ConfigFaltanteException extends LedgerException {
  readonly code = 'CONFIG_FALTANTE';
  constructor(readonly clave: string) {
    super(`Falta la clave de configuración "${clave}" en la tabla Config`);
  }
}
