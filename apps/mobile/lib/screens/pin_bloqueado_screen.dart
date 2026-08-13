import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../components/tav_button.dart';
import '../state/auth_state.dart';
import '../theme/tav_colors.dart';
import '../theme/tav_space.dart';
import '../theme/tav_text.dart';

/// Pantalla de PIN bloqueado.
///
/// Cuando el servidor responde PIN_BLOQUEADO, el usuario ve esta pantalla.
/// Un cobrador en la calle no recuerda una contraseña que le puso el admin
/// hace meses: la pantalla explica que hay que entrar con contraseña y
/// ofrece un botón de contacto por WhatsApp con administración.
class PinBloqueadoScreen extends ConsumerWidget {
  const PinBloqueadoScreen({super.key});

  // PENDIENTE DE DEFINIR: número de WhatsApp de administración.
  // Iván debe confirmar el número real. Por ahora un placeholder visible.
  static const _whatsappAdmin = '+58 412 000 0000';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: TavColors.bg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: TavSpace.xl),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Icono de candado bloqueado
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  color: TavColors.red50,
                  borderRadius: BorderRadius.circular(24),
                ),
                child: const Icon(
                  Icons.lock_outline,
                  color: TavColors.red700,
                  size: 36,
                ),
              ),
              const SizedBox(height: TavSpace.xxl),
              Text(
                'Tu PIN está bloqueado',
                style: TavText.h1.copyWith(fontSize: 23),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: TavSpace.md),
              Text(
                'Bloqueamos el PIN después de varios intentos fallidos para '
                'proteger tu cuenta. Tienes que entrar con tu contraseña '
                'para volver a usar la app.',
                style: TavText.body.copyWith(color: TavColors.ink2),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: TavSpace.xxxl),
              TavButton(
                label: 'Entrar con contraseña',
                onPressed: () async {
                  await ref.read(authProvider.notifier).logout();
                  if (context.mounted) {
                    context.go('/login');
                  }
                },
              ),
              const SizedBox(height: TavSpace.md),
              TavButton(
                label: 'Contactar a administración por WhatsApp',
                variant: TavButtonVariant.outline,
                icon: const Icon(Icons.chat_outlined, size: 20),
                onPressed: () {
                  // PENDIENTE DE DEFINIR: abrir WhatsApp con el número real.
                  // Por ahora muestra el número. Cuando Iván confirme,
                  // se usa url_launcher para abrir wa.me/584120000000.
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(
                        'WhatsApp administración: $_whatsappAdmin',
                        style: TavText.body,
                      ),
                      backgroundColor: TavColors.navy,
                    ),
                  );
                },
              ),
              const SizedBox(height: TavSpace.xl),
              Text(
                'Si no recuerdas tu contraseña, administración puede '
                'reiniciarla por WhatsApp.',
                style: TavText.caption.copyWith(color: TavColors.ink3),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
