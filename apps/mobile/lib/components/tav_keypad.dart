import 'package:flutter/material.dart';

import '../theme/tav_colors.dart';
import '../theme/tav_radius.dart';
import '../theme/tav_space.dart';
import '../theme/tav_text.dart';

/// Teclado numérico para entrada de PIN.
///
/// Grid 3x3 con números 1-9, botón auxiliar inferior izquierdo,
/// 0 al centro, y borrar inferior derecho.
///
/// Cada tecla: 54px alto, radio 12, font 22px peso 500.
/// Espacio entre teclas: 6px.
class TavKeypad extends StatelessWidget {
  const TavKeypad({
    super.key,
    required this.onDigit,
    required this.onDelete,
    this.auxiliaryLabel,
    this.onAuxiliary,
  });

  /// Se llama cuando se presiona un dígito (0-9).
  final ValueChanged<int> onDigit;

  /// Se llama cuando se presiona borrar.
  final VoidCallback onDelete;

  /// Texto del botón auxiliar inferior izquierdo ("Face ID", "Huella", "Salir").
  final String? auxiliaryLabel;

  /// Se llama cuando se presiona el botón auxiliar.
  final VoidCallback? onAuxiliary;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.only(
        top: TavSpace.sm,
        left: TavSpace.lg,
        right: TavSpace.lg,
        bottom: 18,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildRow([1, 2, 3]),
          const SizedBox(height: 6),
          _buildRow([4, 5, 6]),
          const SizedBox(height: 6),
          _buildRow([7, 8, 9]),
          const SizedBox(height: 6),
          _buildBottomRow(),
        ],
      ),
    );
  }

  Widget _buildRow(List<int> digits) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: digits.map((d) => _buildDigitKey(d)).toList(),
    );
  }

  Widget _buildBottomRow() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        _buildAuxiliaryKey(),
        _buildDigitKey(0),
        _buildDeleteKey(),
      ],
    );
  }

  Widget _buildDigitKey(int digit) {
    return SizedBox(
      width: 72,
      height: 54,
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(TavRadius.field),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => onDigit(digit),
          highlightColor: const Color(0xFFE7EBF0),
          child: Center(
            child: Text(
              '$digit',
              style: TavText.keypad.copyWith(color: TavColors.ink),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildDeleteKey() {
    return SizedBox(
      width: 72,
      height: 54,
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(TavRadius.field),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onDelete,
          highlightColor: const Color(0xFFE7EBF0),
          child: const Center(
            child: Icon(
              Icons.backspace_outlined,
              color: TavColors.ink3,
              size: 22,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildAuxiliaryKey() {
    return SizedBox(
      width: 72,
      height: 54,
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(TavRadius.field),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onAuxiliary,
          highlightColor: const Color(0xFFE7EBF0),
          child: Center(
            child: Text(
              auxiliaryLabel ?? '',
              style: TavText.caption.copyWith(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: TavColors.ink3,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Indicador de puntos del PIN.
///
/// 4 círculos de 14px, borde 1.7px ink-3.
/// Rellenos: azul cuando el dígito está ingresado.
class TavPinDots extends StatelessWidget {
  const TavPinDots({super.key, required this.filled, this.length = 4});

  final int filled;
  final int length;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(length, (i) {
        final isFilled = i < filled;
        return Padding(
          padding: EdgeInsets.only(right: i < length - 1 ? TavSpace.lg : 0),
          child: Container(
            width: 14,
            height: 14,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: isFilled ? TavColors.blue : Colors.transparent,
              border: Border.all(
                color: isFilled ? TavColors.blue : TavColors.ink3,
                width: 1.7,
              ),
            ),
          ),
        );
      }),
    );
  }
}
