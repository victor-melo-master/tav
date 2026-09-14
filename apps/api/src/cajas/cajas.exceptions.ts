/**
 * Excepciones del módulo de cajas y corredores.
 *
 * Son clases planas (no HttpException), igual que las del ledger: el módulo
 * no sabe de HTTP. La capa de controladores las mapea después.
 * Contrato: docs/08-contrato-cajas.md, sección "Excepciones".
 */

export abstract class CajaException extends Error {
  abstract readonly code: string;
}

/** La caja referenciada no existe. */
export class CajaNoEncontradaException extends CajaException {
  readonly code = 'CAJA_NO_ENCONTRADA';
  constructor(readonly cajaId: string) {
    super(`Caja ${cajaId} no existe`);
  }
}

/** El corredor referenciado no existe. */
export class CorredorNoEncontradoException extends CajaException {
  readonly code = 'CORREDOR_NO_ENCONTRADO';
  constructor(readonly corredorId: string) {
    super(`Corredor ${corredorId} no existe`);
  }
}

/** Se pasó una caja que no es madre donde se esperaba una madre, o viceversa. */
export class CajaMadreInvalidaException extends CajaException {
  readonly code = 'CAJA_MADRE_INVALIDA';
  constructor(readonly cajaId: string) {
    super(`Caja ${cajaId} no es válida para esta operación (madre/corredor invertida o inexistente)`);
  }
}

/** Se intenta operar sobre un corredor desactivado. */
export class CorredorInactivoException extends CajaException {
  readonly code = 'CORREDOR_INACTIVO';
  constructor(readonly corredorId: string) {
    super(`Corredor ${corredorId} está desactivado`);
  }
}

/** Ya existe un corredor activo con la misma combinación pais + moneda + formaEntrega. */
export class CorredorDuplicadoException extends CajaException {
  readonly code = 'CORREDOR_DUPLICADO';
  constructor(
    readonly pais: string,
    readonly moneda: string,
    readonly formaEntrega: string,
  ) {
    super(`Ya existe un corredor activo ${pais} + ${moneda} + ${formaEntrega}`);
  }
}

/** La operación referenciada no existe. */
export class OperacionNoEncontradaException extends CajaException {
  readonly code = 'OPERACION_NO_ENCONTRADA';
  constructor(readonly operacionId: string) {
    super(`Operación ${operacionId} no existe`);
  }
}

/**
 * La operación está en un estado que no es ni `pendiente` ni `pagada`
 * (`anulada`, `rechazada`, ...). Una operación ya `pagada` NO lanza esto:
 * ejecutarPago devuelve el pago existente con yaExistia: true, venga el
 * clientUuid que venga. El estado de la operación manda.
 */
export class OperacionNoPendienteException extends CajaException {
  readonly code = 'OPERACION_NO_PENDIENTE';
  constructor(readonly operacionId: string, readonly estado: string) {
    super(`Operación ${operacionId} está en estado "${estado}", no admite pago`);
  }
}

/** La caja no pertenece al corredor de la operación. */
export class CajaCorredorMismatchException extends CajaException {
  readonly code = 'CAJA_CORREDOR_MISMATCH';
  constructor(readonly cajaId: string, readonly operacionId: string) {
    super(`La caja ${cajaId} no pertenece al corredor de la operación ${operacionId}`);
  }
}

/** anularApertura o ingresarCajaMadre con motivo vacío. */
export class MotivoRequeridoException extends CajaException {
  readonly code = 'MOTIVO_REQUERIDO';
  constructor() {
    super('Se requiere un motivo no vacío');
  }
}

/** Monto ≤ 0 en un ingreso/apertura/pago. Solo para campos de dinero. */
export class MontoInvalidoException extends CajaException {
  readonly code = 'MONTO_INVALIDO';
  constructor(readonly campo: string, readonly valor: bigint) {
    super(`${campo} debe ser mayor que cero (recibido: ${valor})`);
  }
}

/** Un campo obligatorio que no es monto llegó vacío (formaPago, nombreCliente). */
export class CampoRequeridoException extends CajaException {
  readonly code = 'CAMPO_REQUERIDO';
  constructor(readonly campo: string) {
    super(`${campo} es obligatorio y llegó vacío`);
  }
}

/** tasaConversion o tasaEjecucion ≤ 0 o no numérica. */
export class TasaInvalidaException extends CajaException {
  readonly code = 'TASA_INVALIDA';
  constructor(readonly valor: string) {
    super(`Tasa inválida: "${valor}" (debe ser numérica y mayor que cero)`);
  }
}

/** Se intenta anular un pago. El flujo no está definido — ver // PENDIENTE DE DEFINIR. */
export class ReversoPagoNoDefinidoException extends CajaException {
  readonly code = 'REVERSO_PAGO_NO_DEFINIDO';
  constructor(readonly movimientoCajaId: string) {
    super(
      `Anular el pago ${movimientoCajaId} no está definido: el cliente no ha ` +
        'decidido si la plata vuelve a la caja. No se escribió nada.',
    );
  }
}

/** Se intenta anular un movimiento que no es apertura ni recarga. */
export class MovimientoNoAnulableException extends CajaException {
  readonly code = 'MOVIMIENTO_NO_ANULABLE';
  constructor(readonly movimientoCajaId: string, readonly tipo: string) {
    super(`El movimiento ${movimientoCajaId} (tipo "${tipo}") no es anulable: solo apertura y recarga`);
  }
}

/**
 * Segundo intento de anular el mismo movimiento. Se detecta por CONSULTA
 * (existe un reverso_apertura que apunta al original por origenId), no por
 * un campo en el original: MovimientoCaja nunca recibe UPDATE.
 */
export class MovimientoYaAnuladoException extends CajaException {
  readonly code = 'MOVIMIENTO_YA_ANULADO';
  constructor(readonly movimientoCajaId: string) {
    super(`El movimiento ${movimientoCajaId} ya fue anulado (existe su reverso)`);
  }
}
