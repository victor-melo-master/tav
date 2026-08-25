/**
 * Formato de dinero — español de Venezuela.
 *
 * Los montos viajan como string de centavos (BigInt no existe en JSON).
 * Aquí se parsean a entero y se formatean con símbolo delante:
 *   "$1.240,00"  ·  "Bs 353.896,00"
 *
 * Regla 1 del proyecto: nada de float/double/Number para montos. El parseo
 * usa BigInt para no perder precisión, y el formateo manual evita Number.
 */

/** Convierte un string de centavos (de la API) a BigInt. Acepta "0" y nulos. */
export function centsToBigInt(cents: string | number | null | undefined): bigint {
  if (cents === null || cents === undefined || cents === '') return 0n;
  return BigInt(cents);
}

/**
 * Formatea centavos a "$1.240,00" o "Bs 353.896,00".
 * El símbolo va siempre delante, separador de miles ".", decimales ",".
 */
export function formatMoney(
  cents: string | number | bigint | null | undefined,
  simbolo: string = '$',
): string {
  const total = typeof cents === 'bigint' ? cents : centsToBigInt(cents);
  const negativo = total < 0n;
  const abs = negativo ? -total : total;
  const enteros = abs / 100n;
  const decimales = abs % 100n;

  const enterosStr = enteros.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimalesStr = decimales.toString().padStart(2, '0');

  const monto = `${enterosStr},${decimalesStr}`;
  return `${negativo ? '−' : ''}${simbolo}${monto}`;
}

/** Formatea centavos como USD ($). */
export function usd(cents: string | number | bigint | null | undefined): string {
  return formatMoney(cents, '$');
}

/** Formatea centavos como bolívares (Bs). */
export function bs(cents: string | number | bigint | null | undefined): string {
  return formatMoney(cents, 'Bs ');
}

/**
 * Convierte un monto escrito por el usuario en formato "1240,00" o "1240.00"
 * a centavos (string, para enviar a la API). Devuelve null si no es válido.
 *
 * Acepta coma o punto como separador decimal, y puntos como separador de miles.
 * No usa Number para el parseo de la parte entera grande: se limpia y se
 * reconstruye como entero de centavos con BigInt.
 */
export function parseUserAmountToCents(input: string): string | null {
  const limpio = input.trim().replace(/\s/g, '');
  if (!limpio) return null;

  // Quita símbolos de moneda que el usuario pueda haber escrito.
  const sinSimbolo = limpio.replace(/^[Bs$]+/i, '').replace(/\$/g, '');
  if (!sinSimbolo) return null;

  // Determina separador decimal: si hay coma, la coma es decimal y los puntos
  // son miles. Si solo hay punto y aparece una vez al final con 1-2 dígitos,
  // es decimal; si no, todo es entero.
  let enteros: string;
  let decimales: string;

  if (sinSimbolo.includes(',')) {
    const partes = sinSimbolo.split(',');
    if (partes.length > 2) return null;
    enteros = partes[0].replace(/\./g, '');
    decimales = partes[1] ?? '';
  } else if (sinSimbolo.includes('.')) {
    const partes = sinSimbolo.split('.');
    // "1.240" → miles (entero 1240). "1240.50" → decimal. "1.240.000" → miles.
    const ultima = partes[partes.length - 1];
    if (partes.length > 1 && ultima.length <= 2 && !partes.slice(0, -1).some((p) => p.length > 3)) {
      // Podría ser decimal: "1240.5" o "1240.50". Pero "1.240" es ambiguo.
      // Heurística: si la última parte tiene exactamente 2 dígitos, es decimal.
      if (ultima.length === 2) {
        enteros = partes.slice(0, -1).join('');
        decimales = ultima;
      } else {
        enteros = partes.join('');
        decimales = '';
      }
    } else {
      enteros = partes.join('');
      decimales = '';
    }
  } else {
    enteros = sinSimbolo;
    decimales = '';
  }

  if (!/^\d+$/.test(enteros)) return null;
  if (decimales && !/^\d+$/.test(decimales)) return null;

  const decimales2 = (decimales + '00').slice(0, 2);
  const total = BigInt(enteros) * 100n + BigInt(decimales2);
  return total.toString();
}

/** Formatea una tasa decimal (string "285.400000") a "285,40". */
export function formatTasa(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  const num = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isFinite(num)) return '—';
  return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

/** Formatea una fecha ISO a "24/08/2026" o "24/08/2026, 09:30". */
export function formatFecha(iso: string | Date | null | undefined, conHora = false): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  const opts: Intl.DateTimeFormatOptions = conHora
    ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' };
  return d.toLocaleString('es-VE', opts);
}

/** "hace 3 días" / "hace 2 h" / "nunca" para la columna de días sin conectarse. */
export function haceTexto(iso: string | Date | null | undefined): string {
  if (!iso) return 'Nunca';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const dias = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? 'hace 1 mes' : `hace ${meses} meses`;
}
