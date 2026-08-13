import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../theme/tav_colors.dart';
import '../theme/tav_text.dart';

/// Display de dinero formateado en locale es_VE.
///
/// Los montos llegan de la API como string y se manejan como int de centavos.
/// Nunca double. El formateo a "$1.240,00" ocurre solo aquí, en presentación.
///
/// Formato venezolano: punto para miles, coma para decimales.
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

  @override
  Widget build(BuildContext context) {
    final formatted = _format();
    final text = approximate ? '≈ $formatted' : formatted;

    return Text(
      text,
      style: (style ?? TavText.moneyDisplay).copyWith(
        color: color ?? TavColors.ink,
        fontFeatures: const [FontFeature.tabularFigures()],
      ),
    );
  }

  String _format() {
    final value = cents.abs() / 100.0;
    final fmt = switch (currency) {
      TavMoneyCurrency.usd => NumberFormat.currency(
          locale: 'es_VE',
          symbol: '\$',
          decimalDigits: 2,
        ),
      TavMoneyCurrency.bsd => NumberFormat.currency(
          locale: 'es_VE',
          symbol: 'Bs ',
          decimalDigits: 2,
        ),
      TavMoneyCurrency.usdt => NumberFormat.currency(
          locale: 'es_VE',
          symbol: '',
          decimalDigits: 2,
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
}

enum TavMoneyCurrency { usd, bsd, usdt }

/// Formatea centavos a string en formato venezolano sin widget.
/// Útil para texto inline en filas, chips, etc.
String formatCents(int cents, {TavMoneyCurrency currency = TavMoneyCurrency.usd}) {
  final value = cents.abs() / 100.0;
  final fmt = switch (currency) {
    TavMoneyCurrency.usd => NumberFormat.currency(
        locale: 'es_VE',
        symbol: '\$',
        decimalDigits: 2,
      ),
    TavMoneyCurrency.bsd => NumberFormat.currency(
        locale: 'es_VE',
        symbol: 'Bs ',
        decimalDigits: 2,
      ),
    TavMoneyCurrency.usdt => NumberFormat.currency(
        locale: 'es_VE',
        symbol: '',
        decimalDigits: 2,
      ),
  };
  final formatted = fmt.format(value);
  return switch (currency) {
    TavMoneyCurrency.usdt => '$formatted USDT',
    _ => formatted,
  };
}
