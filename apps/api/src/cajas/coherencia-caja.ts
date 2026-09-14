/**
 * Validación de coherencia aritmética para apertura/recarga de cajas.
 *
 * El admin teclea tres números a mano: cuánto USDT sale de la madre, cuánto
 * entra en la caja destino, y a qué tasa. El servicio asienta lo que le
 * mandan — no comprueba que cuadren. Esta validación vive aparte para que la
 * usen tanto el DTO HTTP (CoherenciaAritmeticaCajaConstraint) como el seed:
 * si el seed siembra datos que la aplicación jamás aceptaría, es un bug.
 *
 * Fórmula del contrato (docs/08-contrato-cajas.md):
 *   esperado  = round(montoMadreCents × tasaConversion)   — half-up
 *   tolerancia = max(1n, esperado / 10_000n)               — división entera; 0,01%
 *   válido si abs(montoDestinoCents − esperado) <= tolerancia
 *
 * Todo en bigint: la tasa (string decimal) se descompone en dígitos + escala
 * y el producto se calcula en aritmética entera. Nunca float.
 */

/**
 * Calcula el monto destino esperado a partir del monto madre y la tasa,
 * en aritmética entera con redondeo half-up. Devuelve null si la tasa no
 * es parseable.
 */
export function calcularMontoDestinoEsperado(
  montoMadreCents: bigint,
  tasaConversion: string,
): bigint | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(tasaConversion);
  if (!match) return null;
  const enteros = match[1];
  const decimales = match[2] ?? '';
  const tasaDigits = BigInt(enteros + decimales);
  if (tasaDigits <= 0n) return null;
  const divisor = 10n ** BigInt(decimales.length);

  // round half-up en enteros: (producto + divisor/2) / divisor
  const producto = montoMadreCents * tasaDigits;
  return (producto + divisor / 2n) / divisor;
}

/**
 * Verifica que montoDestinoCents cuadre con montoMadreCents × tasaConversion,
 * con tolerancia de redondeo del 0,01% (mínimo 1 centavo).
 * Devuelve true si cuadra, false si no.
 */
export function cuadraApertura(
  montoMadreCents: bigint,
  montoDestinoCents: bigint,
  tasaConversion: string,
): boolean {
  const esperado = calcularMontoDestinoEsperado(montoMadreCents, tasaConversion);
  if (esperado === null) return false;

  const tolerancia = esperado / 10_000n > 1n ? esperado / 10_000n : 1n;
  const diferencia =
    montoDestinoCents > esperado ? montoDestinoCents - esperado : esperado - montoDestinoCents;
  return diferencia <= tolerancia;
}
