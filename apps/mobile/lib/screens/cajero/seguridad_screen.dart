import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_button.dart';
import '../../components/tav_card.dart';
import '../../components/tav_list_row.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';

/// Pantalla de seguridad del cajero.
///
/// PENDIENTE DE DEFINIR: el cambio de PIN y la verificación biométrica
/// no están implementados en la API todavía. Esta pantalla muestra
/// las opciones del prototipo.
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
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(TavSpace.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Acceso', style: TavText.overline.copyWith(color: TavColors.ink3)),
              const SizedBox(height: TavSpace.sm),
              TavCard(
                padding: const EdgeInsets.symmetric(horizontal: TavSpace.lg, vertical: 0),
                child: Column(
                  children: [
                    TavListRow(
                      title: 'Cambiar PIN',
                      subtitle: 'PIN de 4 dígitos para ingresar',
                      avatar: const Icon(Icons.lock_outline, color: TavColors.blue, size: 20),
                      onTap: () {},
                      showDivider: true,
                    ),
                    TavListRow(
                      title: 'Biometría',
                      subtitle: 'Huella o Face ID para ingresar más rápido',
                      avatar: const Icon(Icons.fingerprint_outlined, color: TavColors.blue, size: 20),
                      onTap: () {},
                      showDivider: false,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: TavSpace.lg),
              Text('Sesión', style: TavText.overline.copyWith(color: TavColors.ink3)),
              const SizedBox(height: TavSpace.sm),
              TavCard(
                padding: const EdgeInsets.symmetric(horizontal: TavSpace.lg, vertical: 0),
                child: Column(
                  children: [
                    TavListRow(
                      title: 'Cerrar sesión en todos los dispositivos',
                      subtitle: 'Cierra tu sesión en todos los equipos donde iniciaste',
                      avatar: const Icon(Icons.logout_outlined, color: TavColors.red700, size: 20),
                      avatarColor: TavColors.red50,
                      onTap: () {},
                      showDivider: false,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: TavSpace.xxl),
              TavButton(
                label: 'Cerrar sesión',
                variant: TavButtonVariant.outline,
                onPressed: () => context.go('/login'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
