import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_coming_soon.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_text.dart';

/// Pantalla de seguridad del cajero.
///
/// PENDIENTE DE DEFINIR: el cambio de PIN y la verificación biométrica
/// no están implementados en la API todavía. Esta pantalla muestra
/// un estado vacío honesto.
class SeguridadScreen extends StatelessWidget {
  const SeguridadScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: TavColors.bg,
      appBar: AppBar(
        backgroundColor: TavColors.surface,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: TavColors.ink),
          onPressed: () => context.pop(),
        ),
        title: Text('Seguridad', style: TavText.h2),
        centerTitle: false,
      ),
      body: const SafeArea(
        child: TavComingSoon(
          icon: Icons.lock_outline_rounded,
          title: 'Seguridad',
        ),
      ),
    );
  }
}
