import 'package:flutter/material.dart';

import '../theme/tav_colors.dart';
import '../theme/tav_radius.dart';
import '../theme/tav_text.dart';

/// Las seis variantes de botón del sistema de diseño.
///
/// Regla: un solo botón primario por pantalla. Si hay dos acciones que
/// compiten, la segunda va como [outline] o [text].
enum TavButtonVariant {
  /// Azul — acción principal. Sombra azul.
  primary,

  /// Navy — confirmación sobre fondos oscuros.
  dark,

  /// Verde (#2E7D32) — abonar, acción positiva de dinero.
  green,

  /// Blanco con borde — acción secundaria.
  outline,

  /// Transparente, texto azul — acción terciaria.
  text,

  /// Gris deshabilitado — no es un variant real, se activa con [enabled]=false.
  disabled,
}

/// Botón del sistema de diseño TAV.
///
/// Altura: 52px (44px en text). Radio: 14px.
/// El estado deshabilitado usa fondo #DDE2E8 y texto #9AA5B2.
class TavButton extends StatelessWidget {
  const TavButton({
    super.key,
    required this.label,
    this.onPressed,
    this.variant = TavButtonVariant.primary,
    this.icon,
    this.expanded = true,
    this.small = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final TavButtonVariant variant;
  final Widget? icon;
  final bool expanded;
  final bool small;

  @override
  Widget build(BuildContext context) {
    final isDisabled = onPressed == null;
    final height = small ? 40.0 : (variant == TavButtonVariant.text ? 44.0 : 52.0);
    final radius = small ? 11.0 : TavRadius.card;
    final fontSize = small ? 13.5 : 15.0;

    final colors = _resolveColors(isDisabled);

    return SizedBox(
      width: expanded ? double.infinity : null,
      height: height,
      child: ElevatedButton(
        onPressed: onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: colors.background,
          foregroundColor: colors.foreground,
          elevation: 0,
          padding: EdgeInsets.symmetric(
            horizontal: small ? 16 : 26,
            vertical: 0,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radius),
            side: colors.border != null
                ? BorderSide(color: colors.border!)
                : BorderSide.none,
          ),
          shadowColor: colors.shadow?.color,
        ),
        child: Row(
          mainAxisSize: expanded ? MainAxisSize.max : MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (icon != null) ...[
              icon!,
              const SizedBox(width: 8),
            ],
            Text(
              label,
              style: TavText.button.copyWith(
                fontSize: fontSize,
                color: colors.foreground,
              ),
            ),
          ],
        ),
      ),
    );
  }

  ({Color background, Color foreground, Color? border, BoxShadow? shadow})
      _resolveColors(bool disabled) {
    if (disabled) {
      return (
        background: const Color(0xFFDDE2E8),
        foreground: const Color(0xFF9AA5B2),
        border: null,
        shadow: null,
      );
    }

    switch (variant) {
      case TavButtonVariant.primary:
        return (
          background: TavColors.blue,
          foreground: TavColors.surface,
          border: null,
          shadow: const BoxShadow(
            color: Color(0x471F6FEB),
            blurRadius: 16,
            offset: Offset(0, 6),
          ),
        );
      case TavButtonVariant.dark:
        return (
          background: TavColors.navy,
          foreground: TavColors.surface,
          border: null,
          shadow: null,
        );
      case TavButtonVariant.green:
        return (
          background: TavColors.green600,
          foreground: TavColors.surface,
          border: null,
          shadow: const BoxShadow(
            color: Color(0x404CAF50),
            blurRadius: 16,
            offset: Offset(0, 6),
          ),
        );
      case TavButtonVariant.outline:
        return (
          background: TavColors.surface,
          foreground: TavColors.ink,
          border: TavColors.line,
          shadow: null,
        );
      case TavButtonVariant.text:
        return (
          background: Colors.transparent,
          foreground: TavColors.blue,
          border: null,
          shadow: null,
        );
      case TavButtonVariant.disabled:
        return (
          background: const Color(0xFFDDE2E8),
          foreground: const Color(0xFF9AA5B2),
          border: null,
          shadow: null,
        );
    }
  }
}
