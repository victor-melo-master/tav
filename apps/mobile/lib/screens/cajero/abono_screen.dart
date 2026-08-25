import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_coming_soon.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_text.dart';

/// Abono a deuda.
///
/// PENDIENTE DE DEFINIR: el registro de abonos no está conectado a la API.
/// Los pagos los registra el cobrador al recibir el efectivo, no el cajero
/// desde la app. Esta pantalla informa eso en lugar de simular un flujo.
class AbonoScreen extends StatelessWidget {
  const AbonoScreen({super.key});

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
        title: Text('Abonar a mi deuda', style: TavText.h2),
        centerTitle: false,
      ),
      body: const SafeArea(
        child: TavComingSoon(
          icon: Icons.payments_outlined,
          title: 'Abonar a mi deuda',
          note: 'Los abonos los registra el cobrador al recibir el efectivo. '
              'Tu saldo se actualiza automáticamente cuando él confirma el pago '
              'en su app.',
        ),
      ),
    );
  }
}
