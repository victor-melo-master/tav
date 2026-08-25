import 'package:flutter/material.dart';

import '../theme/tav_colors.dart';
import '../theme/tav_text.dart';

/// Estado vacío honesto para secciones sin backend implementado.
///
/// Muestra un icono tenue, el título de la sección y un texto explicativo.
/// Nada de datos inventados ni botones que no hacen nada.
///
/// Si [note] no es null, se muestra debajo como información real del negocio.
class TavComingSoon extends StatelessWidget {
  const TavComingSoon({
    super.key,
    required this.icon,
    required this.title,
    this.note,
  });

  final IconData icon;
  final String title;

  /// Información real del negocio, no una disculpa.
  /// Se muestra en una tarjeta de fondo azul tenue.
  final String? note;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              size: 56,
              color: TavColors.ink4,
            ),
            const SizedBox(height: 18),
            Text(
              title,
              style: TavText.h2.copyWith(fontSize: 17),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              'Esta sección estará disponible pronto.',
              style: TavText.body2.copyWith(color: TavColors.ink3),
              textAlign: TextAlign.center,
            ),
            if (note != null) ...[
              const SizedBox(height: 24),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: TavColors.blue50,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  note!,
                  style: TavText.body2.copyWith(
                    color: TavColors.blue600,
                    height: 1.55,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
