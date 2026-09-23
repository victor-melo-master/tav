import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../theme/tav_colors.dart';
import '../theme/tav_text.dart';

/// Display de dinero formateado en locale es_VE.
///
/// Los montos llegan de la API como string y se manejan como int de centavos.
/// Nunca double. El formateo a "G$ 1.240,00" ocurre solo aquí, en presentación.
///
/// Formato venezolano: símbolo delante, punto para miles, coma para decimales.
/// Dos decimales siempre, incluso si son cero: las conversiones desde BS
/// producen centavos de verdad y esconderlos haría que la suma de cabeza no
/// cuadre con el saldo.
class TavMoneyDisplay extends StatelessWidget {
  const TavMoneyDisplay({
    super.key,
    required this.cents,
    this.currency = TavMoneyCurrency.gyd,
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

enum TavMoneyCurrency { gyd, usd, bsd }

/// Helper único de formato de moneda en formato venezolano.
///
/// Usa un patrón explícito `¤#,##0.00` para garantizar que el símbolo
/// vaya delante: `G$ 1.240,00`, `Bs 353.896,00`. El locale es_VE de intl
/// pone el símbolo al final por defecto, así que el patrón es obligatorio.
///
/// La moneda base del libro de deuda es GYD → símbolo G$. USD tiene su
/// propio símbolo para que no haya ambigüedad en pantallas que muestran
/// varias monedas a la vez.
///
/// [prefix] añade un signo opcional ("+", "−") delante del símbolo.
String formatCents(
  int cents, {
  TavMoneyCurrency currency = TavMoneyCurrency.gyd,
  String? prefix,
}) {
  final value = cents.abs() / 100.0;
  // Patrón explícito: ¤ = símbolo, #,##0.00 = separador de miles y decimales.
  // El locale es_VE define que . es miles y , es decimal dentro de este patrón.
  final fmt = switch (currency) {
    TavMoneyCurrency.gyd => NumberFormat.currency(
        locale: 'es_VE',
        symbol: 'G\$ ',
        decimalDigits: 2,
        customPattern: '\u00a4#,##0.00',
      ),
    TavMoneyCurrency.usd => NumberFormat.currency(
        locale: 'es_VE',
        symbol: 'US\$ ',
        decimalDigits: 2,
        customPattern: '\u00a4#,##0.00',
      ),
    TavMoneyCurrency.bsd => NumberFormat.currency(
        locale: 'es_VE',
        symbol: 'Bs ',
        decimalDigits: 2,
        customPattern: '\u00a4#,##0.00',
      ),
  };
  final formatted = fmt.format(value);
  final result = formatted;
  final sign = cents < 0 ? '−' : (prefix ?? '');
  return '$sign$result';
}
