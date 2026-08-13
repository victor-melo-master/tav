import 'package:flutter/material.dart';

import '../theme/tav_colors.dart';

/// Barra de progreso del sistema de diseño.
///
/// Altura: 7px. Radio: full. Fondo: #E9ECF1.
/// El indicador hereda el color del semáforo o usa azul por defecto.
class TavProgressBar extends StatelessWidget {
  const TavProgressBar({
    super.key,
    required this.progress,
    this.color = TavColors.blue,
    this.height = 7,
  });

  /// Progreso de 0.0 a 1.0.
  final double progress;

  final Color color;
  final double height;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(999),
      child: SizedBox(
        height: height,
        child: LinearProgressIndicator(
          value: progress.clamp(0.0, 1.0),
          backgroundColor: const Color(0xFFE9ECF1),
          valueColor: AlwaysStoppedAnimation(color),
          minHeight: height,
        ),
      ),
    );
  }
}

/// Indicador de pasos segmentado (para flujos de varios pasos).
///
/// N barras horizontales de 3.5px. Las activas son azules.
class TavSteps extends StatelessWidget {
  const TavSteps({
    super.key,
    required this.current,
    required this.total,
  });

  final int current;
  final int total;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      child: Row(
        children: List.generate(total, (i) {
          final isOn = i < current;
          return Expanded(
            child: Container(
              height: 3.5,
              margin: EdgeInsets.only(right: i < total - 1 ? 6 : 0),
              decoration: BoxDecoration(
                color: isOn ? TavColors.blue : const Color(0xFFDFE4EA),
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          );
        }),
      ),
    );
  }
}
