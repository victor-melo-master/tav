import 'package:intl/intl.dart';

/// Formatea un string decimal como cantidad en guyaneses con dos decimales.
/// Ejemplo: "240" → "240,00", "240.5" → "240,50".
String formatGydDecimal(String value) {
  final n = double.tryParse(value);
  if (n == null) return value;
  return NumberFormat.currency(
    locale: 'es_VE',
    symbol: r'G$ ',
    decimalDigits: 2,
  ).format(n);
}

/// Enmascara un número de cuenta: deja visibles solo los últimos 4 dígitos.
/// Ejemplo: "0134123456789012" → "••••9012".
String enmascararCuenta(String cuenta) {
  final limpia = cuenta.trim();
  if (limpia.length <= 4) return '••••';
  return '••••${limpia.substring(limpia.length - 4)}';
}
