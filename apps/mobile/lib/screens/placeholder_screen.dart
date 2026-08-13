import 'package:flutter/material.dart';

import '../theme/tav_colors.dart';
import '../theme/tav_space.dart';
import '../theme/tav_text.dart';

/// Pantalla placeholder vacía para los shells.
///
/// Los shells van vacíos por ahora (Fase 5). Las pantallas de contenido
/// se implementan en Fase 6 (cajero) y Fase 7 (cobrador).
class PlaceholderScreen extends StatelessWidget {
  const PlaceholderScreen({super.key, required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(TavSpace.xl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.construction_outlined,
              size: 48,
              color: TavColors.ink4,
            ),
            const SizedBox(height: TavSpace.lg),
            Text(
              title,
              style: TavText.h2,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: TavSpace.sm),
            Text(
              'Esta pantalla se construye en la siguiente fase.',
              style: TavText.body2.copyWith(color: TavColors.ink3),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
