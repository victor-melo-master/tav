import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../components/tav_keypad.dart';
import '../components/tav_progress_bar.dart';
import '../state/auth_state.dart';
import '../theme/tav_colors.dart';
import '../theme/tav_space.dart';
import '../theme/tav_text.dart';

/// Pantalla de establecer PIN de 4 dígitos.
///
/// Replica el prototipo s-pin-new:
/// - Icono candado en círculo blue-50
/// - Título "Crea tu PIN"
/// - Subtítulo "4 dígitos para entrar rápido y proteger tu cuenta."
/// - 4 puntos del PIN
/// - "No uses fechas de nacimiento ni secuencias."
/// - Keypad 3x3
class PinSetupScreen extends ConsumerStatefulWidget {
  const PinSetupScreen({super.key});

  @override
  ConsumerState<PinSetupScreen> createState() => _PinSetupScreenState();
}

class _PinSetupScreenState extends ConsumerState<PinSetupScreen> {
  String _pin = '';
  bool _saving = false;

  void _onDigit(int d) {
    if (_pin.length >= 4) return;
    setState(() => _pin = '$_pin$d');
    if (_pin.length == 4) {
      _confirmPin();
    }
  }

  void _onDelete() {
    if (_pin.isEmpty) return;
    setState(() => _pin = _pin.substring(0, _pin.length - 1));
  }

  Future<void> _confirmPin() async {
    setState(() => _saving = true);
    final success = await ref.read(authProvider.notifier).setPin(_pin);
    if (!mounted) return;
    setState(() => _saving = false);

    if (success) {
      // El router redirige automáticamente según el estado.
    } else {
      // Mostrar error del servidor y limpiar
      setState(() => _pin = '');
      final authState = ref.read(authProvider);
      if (authState is AuthError) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(authState.message),
            backgroundColor: TavColors.red,
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('No pudimos guardar el PIN. Intenta de nuevo.'),
            backgroundColor: TavColors.red,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: TavColors.bg,
      body: SafeArea(
        child: Column(
          children: [
            // Topbar con botón de cerrar sesión
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: () async {
                  await ref.read(authProvider.notifier).logout();
                  if (context.mounted) context.go('/login');
                },
                child: Text(
                  'Cerrar sesión',
                  style: TavText.button.copyWith(color: TavColors.ink2),
                ),
              ),
            ),
            // Steps (4/4 activos en esta pantalla final del flujo)
            const TavSteps(current: 4, total: 4),
            Expanded(
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    // Icono candado
                    Container(
                      width: 56,
                      height: 56,
                      decoration: BoxDecoration(
                        color: TavColors.blue50,
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: const Icon(
                        Icons.lock_outline,
                        color: TavColors.blue,
                        size: 26,
                      ),
                    ),
                    const SizedBox(height: TavSpace.lg),
                    Text('Crea tu PIN', style: TavText.h1.copyWith(fontSize: 22)),
                    const SizedBox(height: TavSpace.sm),
                    Text(
                      '4 dígitos para entrar rápido y proteger tu cuenta.',
                      style: TavText.body2.copyWith(color: TavColors.ink2),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 26),
                    TavPinDots(filled: _pin.length),
                    const SizedBox(height: TavSpace.sm),
                    Text(
                      'No uses fechas de nacimiento ni secuencias.',
                      style: TavText.caption.copyWith(color: TavColors.ink3),
                    ),
                    if (_saving) ...[
                      const SizedBox(height: TavSpace.lg),
                      const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            TavKeypad(
              onDigit: _onDigit,
              onDelete: _onDelete,
            ),
          ],
        ),
      ),
    );
  }
}
