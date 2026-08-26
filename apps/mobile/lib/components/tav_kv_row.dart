import 'package:flutter/material.dart';

import '../theme/tav_colors.dart';
import '../theme/tav_text.dart';

/// Fila clave-valor: etiqueta a la izquierda, valor a la derecha.
///
/// Es la pieza más repetida en los detalles (cobro, cajero, cierre).
/// Altura de fila con padding vertical de 7px, fuente 13.5px.
class TavKvRow extends StatelessWidget {
  const TavKvRow({
    super.key,
    required this.label,
    required this.value,
    this.valueColor,
    this.valueWeight = FontWeight.w600,
    this.divider = false,
  });

  final String label;
  final String value;
  final Color? valueColor;
  final FontWeight valueWeight;

  /// Si es true, dibuja un divisor debajo de la fila.
  final bool divider;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 7),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Flexible(
                child: Text(
                  label,
                  style: TavText.body2.copyWith(color: TavColors.ink3, fontSize: 13.5),
                ),
              ),
              const SizedBox(width: 12),
              Flexible(
                child: Text(
                  value,
                  style: TavText.body2.copyWith(
                    fontWeight: valueWeight,
                    fontSize: 13.5,
                    color: valueColor ?? TavColors.ink,
                  ),
                  textAlign: TextAlign.right,
                ),
              ),
            ],
          ),
        ),
        if (divider) const Divider(height: 16, color: TavColors.line2),
      ],
    );
  }
}
