import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../theme/tav_colors.dart';
import '../theme/tav_text.dart';

/// Display de dinero formateado en locale es_VE.
///
/// Los montos llegan de la API como string y se manejan como int de centavos.
/// Nunca double. El formateo a "$1.240,00" ocurre solo aquí, en presentación.
///
/// Formato venezolano: símbolo delante, punto para miles, coma para decimales.
/// Los dólares siempre con dos decimales, incluso si son cero.
class TavMoneyDisplay extends StatelessWidget {
  const TavMoneyDisplay({
    super.key,
    required this.cents,
    this.currency = TavMoneyCurrency.usd,
    this.style,
    this.color,
    this.prefix,
    this.approximate = false,
    this.fitted = false,
  });

  /// Monto en centavos (int). Nunca double.
  final int cents;

  final TavMoneyCurrency currency;

  /// Sobreescribe el estilo tipográfico.
  final TextStyle? style;

  /// Sobreescribe el color del texto.
  final Color? color;

  /// Prefijo opcional ("+", "−", "≈").
  final String? prefix;

  /// Si es true, muestra "≈" delante (equivalencia informativa en Bs).
  final bool approximate;

  /// Si es true, envuelve el texto en FittedBox(scaleDown) para que
  /// montos con muchos dígitos se reduzcan en lugar de desbordar.
  final bool fitted;

  @override
  Widget build(BuildContext context) {
    final formatted = formatCents(cents, currency: currency, prefix: prefix);
    final text = approximate ? '≈ $formatted' : formatted;

    final textWidget = Text(
      text,
      style: (style ?? TavText.moneyDisplay).copyWith(
        color: color ?? TavColors.ink,
        fontFeatures: const [FontFeature.tabularFigures()],
      ),
    );

    if (!fitted) return textWidget;

    // FittedBox con scaleDown: el texto se encoge si no cabe,
    // pero nunca crece más allá de su tamaño natural.
    // No usar FractionallySizedBox aquí porque dentro de un Row
    // sin Expanded causa un overflow invisible.
    return FittedBox(
      fit: BoxFit.scaleDown,
      alignment: Alignment.centerLeft,
      child: textWidget,
    );
  }
}

enum TavMoneyCurrency { usd, bsd, usdt }

/// Helper único de formato de moneda en formato venezolano.
///
/// Usa un patrón explícito `¤#,##0.00` para garantizar que el símbolo
/// vaya delante: `$1.240,00`, `Bs 353.896,00`. El locale es_VE de intl
/// pone el símbolo al final por defecto, así que el patrón es obligatorio.
///
/// [prefix] añade un signo opcional ("+", "−") delante del símbolo.
String formatCents(
  int cents, {
  TavMoneyCurrency currency = TavMoneyCurrency.usd,
  String? prefix,
}) {
  final value = cents.abs() / 100.0;
  // Patrón explícito: ¤ = símbolo, #,##0.00 = separador de miles y decimales.
  // El locale es_VE define que . es miles y , es decimal dentro de este patrón.
  final fmt = switch (currency) {
    TavMoneyCurrency.usd => NumberFormat.currency(
        locale: 'es_VE',
        symbol: '\$',
        decimalDigits: 2,
        customPattern: '\u00a4#,##0.00',
      ),
    TavMoneyCurrency.bsd => NumberFormat.currency(
        locale: 'es_VE',
        symbol: 'Bs ',
        decimalDigits: 2,
        customPattern: '\u00a4#,##0.00',
      ),
    TavMoneyCurrency.usdt => NumberFormat.currency(
        locale: 'es_VE',
        symbol: '',
        decimalDigits: 2,
        customPattern: '#,##0.00',
      ),
  };
  final formatted = fmt.format(value);
  final result = switch (currency) {
    TavMoneyCurrency.usdt => '$formatted USDT',
    _ => formatted,
  };
  final sign = cents < 0 ? '−' : (prefix ?? '');
  return '$sign$result';
}
