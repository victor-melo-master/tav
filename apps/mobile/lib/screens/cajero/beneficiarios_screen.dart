import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_coming_soon.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_text.dart';

/// Pantalla de beneficiarios del cajero.
///
/// PENDIENTE DE DEFINIR: el endpoint de beneficiarios guardados no
/// existe todavía en la API. Hoy no hay libreta de beneficiarios:
/// las cuentas de destino se ingresan al momento de cada operación,
/// con el pegado rápido desde el portapapeles.
///
/// Cuando se implemente el endpoint, esta pantalla listará los
/// beneficiarios guardados y permitirá editarlos.
class BeneficiariosScreen extends StatelessWidget {
  const BeneficiariosScreen({super.key});

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
        title: Text('Mis beneficiarios', style: TavText.h2),
        centerTitle: false,
      ),
      body: const SafeArea(
        child: TavComingSoon(
          icon: Icons.group_outlined,
          title: 'Mis beneficiarios',
          note: 'Por ahora las cuentas de destino se ingresan al momento de '
              'cada operación, con el pegado rápido desde el portapapeles. '
              'No necesitas guardar contactos.',
        ),
      ),
    );
  }
}
