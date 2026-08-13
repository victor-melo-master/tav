import 'package:flutter/material.dart';

import '../theme/tav_colors.dart';
import '../theme/tav_radius.dart';
import '../theme/tav_space.dart';

/// Tarjeta del sistema de diseño.
///
/// Nivel 1 de elevación: sombra sutil azulada, nunca gris neutro.
/// Radio: 14px. Borde: 1px [TavColors.line]. Padding: 16px.
class TavCard extends StatelessWidget {
  const TavCard({
    super.key,
    required this.child,
    this.padding,
    this.onTap,
    this.elevation = TavCardElevation.level1,
  });

  final Widget child;
  final EdgeInsets? padding;
  final VoidCallback? onTap;
  final TavCardElevation elevation;

  @override
  Widget build(BuildContext context) {
    final shadows = switch (elevation) {
      TavCardElevation.flat => null,
      TavCardElevation.level1 => TavColors.cardShadow,
      TavCardElevation.floating => TavColors.floatingShadow,
    };

    return Material(
      color: TavColors.surface,
      borderRadius: BorderRadius.circular(TavRadius.card),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(TavRadius.card),
        child: Container(
          padding: padding ?? const EdgeInsets.all(TavSpace.lg),
          decoration: BoxDecoration(
            border: Border.all(color: TavColors.line),
            borderRadius: BorderRadius.circular(TavRadius.card),
            boxShadow: shadows,
          ),
          child: child,
        ),
      ),
    );
  }
}

enum TavCardElevation { flat, level1, floating }
