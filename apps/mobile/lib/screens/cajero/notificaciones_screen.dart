import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_coming_soon.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_text.dart';

/// Pantalla de notificaciones del cajero.
///
/// PENDIENTE DE DEFINIR: el endpoint de notificaciones no existe todavía
/// en la API. Esta pantalla muestra un estado vacío honesto.
/// Cuando se implemente el endpoint, se conecta aquí.
class NotificacionesScreen extends StatelessWidget {
  const NotificacionesScreen({super.key});

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
        title: Text('Notificaciones', style: TavText.h2),
        centerTitle: false,
      ),
      body: const SafeArea(
        child: TavComingSoon(
          icon: Icons.notifications_none_rounded,
          title: 'Notificaciones',
        ),
      ),
    );
  }
}
