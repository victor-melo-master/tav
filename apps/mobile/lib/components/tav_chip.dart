import 'package:flutter/material.dart';

import '../theme/tav_colors.dart';
import '../theme/tav_text.dart';

/// Estados del semáforo de crédito.
///
/// El color nunca viaja solo: siempre acompañado de días, porcentaje
/// y una etiqueta escrita. Un cliente con daltonismo debe poder leer
/// su situación sin ver el color.
enum TavChipState {
  /// Verde — al día, sin deuda o dentro de plazo.
  verde,

  /// Ámbar — por vencer, entre 4 y 7 días.
  ambar,

  /// Rojo — vencido, bloqueado.
  rojo,

  /// Azul — informativo (en proceso, en verificación).
  azul,

  /// Gris — neutro (borrador, pendiente).
  gris,
}

/// Chip/píldora del sistema de diseño.
///
/// Font: 11.5px, peso 650. Padding: 4x10. Radio: full (píldora).
class TavChip extends StatelessWidget {
  const TavChip({
    super.key,
    required this.label,
    this.state = TavChipState.azul,
    this.icon,
  });

  final String label;
  final TavChipState state;
  final Widget? icon;

  @override
  Widget build(BuildContext context) {
    final colors = _resolveColors();

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: colors.background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            icon!,
            const SizedBox(width: 5),
          ],
          Text(
            label,
            style: TavText.label.copyWith(
              fontSize: 11.5,
              color: colors.text,
            ),
          ),
        ],
      ),
    );
  }

  ({Color background, Color text}) _resolveColors() {
    return switch (state) {
      TavChipState.verde => (
          background: TavColors.green50,
          text: const Color(0xFF256B2A),
        ),
      TavChipState.ambar => (
          background: TavColors.gold50,
          text: TavColors.gold700,
        ),
      TavChipState.rojo => (
          background: TavColors.red50,
          text: TavColors.red700,
        ),
      TavChipState.azul => (
          background: TavColors.blue50,
          text: TavColors.blue600,
        ),
      TavChipState.gris => (
          background: const Color(0xFFF1F3F6),
          text: TavColors.ink2,
        ),
    };
  }
}
