import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../components/tav_keypad.dart';
import '../state/auth_state.dart';
import '../theme/tav_colors.dart';
import '../theme/tav_space.dart';
import '../theme/tav_text.dart';

/// Pantalla de reingreso con PIN.
///
/// Replica el prototipo s-login:
/// - Avatar con iniciales (fondo navy)
/// - "Hola, {nombre}"
/// - "Ingresa tu PIN para continuar"
/// - 4 puntos del PIN
/// - Keypad 3x3 con "Salir" en esquina inferior izquierda
/// - Botón "Entrar con contraseña" para volver al login
class PinLoginScreen extends ConsumerStatefulWidget {
  const PinLoginScreen({super.key});

  @override
  ConsumerState<PinLoginScreen> createState() => _PinLoginScreenState();
}

class _PinLoginScreenState extends ConsumerState<PinLoginScreen> {
  String _pin = '';
  // Cache del nombre del último AuthAuthenticated visto. Cuando loginPin()
  // pone el estado en AuthLoading, el widget no pierde el nombre del usuario
  // ni cae a "Hola," vacío con iniciales "TAV".
  String _cachedNombre = '';

  void _onDigit(int d) {
    if (_pin.length >= 4) return;
    setState(() => _pin = '$_pin$d');
    if (_pin.length == 4) {
      _verifyPin();
    }
  }

  void _onDelete() {
    if (_pin.isEmpty) return;
    setState(() => _pin = _pin.substring(0, _pin.length - 1));
  }

  Future<void> _verifyPin() async {
    // Validar PIN contra el servidor usando /auth/login-pin
    await ref.read(authProvider.notifier).loginPin(_pin);
    if (mounted) {
      setState(() => _pin = '');
    }
  }

  String _getInitials(String nombre) {
    final parts = nombre.trim().split(' ');
    if (parts.length >= 2) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    } else if (parts.isNotEmpty && parts[0].isNotEmpty) {
      return parts[0].substring(0, parts[0].length >= 2 ? 2 : 1).toUpperCase();
    }
    return 'TAV';
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);

    // Actualizar el cache cuando hay un AuthAuthenticated.
    if (authState is AuthAuthenticated) {
      _cachedNombre = authState.usuario.nombre;
    }

    // Usar el cache durante AuthLoading para no perder el nombre.
    final nombre = _cachedNombre;

    return Scaffold(
      backgroundColor: TavColors.bg,
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    // Avatar con iniciales
                    Container(
                      width: 74,
                      height: 74,
                      decoration: BoxDecoration(
                        color: TavColors.navy,
                        borderRadius: BorderRadius.circular(26),
                      ),
                      child: Center(
                        child: Text(
                          _getInitials(nombre),
                          style: TavText.h1.copyWith(
                            fontSize: 25,
                            fontWeight: FontWeight.w600,
                            color: TavColors.surface,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    Text(
                      'Hola, $nombre',
                      style: TavText.h1.copyWith(fontSize: 21),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Ingresa tu PIN para continuar',
                      style: TavText.body2.copyWith(color: TavColors.ink2),
                    ),
                    const SizedBox(height: 26),
                    TavPinDots(filled: _pin.length),
                    const SizedBox(height: TavSpace.sm),
                    if (authState is AuthLoading)
                      const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    else
                      TextButton(
                        onPressed: () async {
                          await ref.read(authProvider.notifier).logout();
                        },
                        child: Text(
                          'Entrar con contraseña',
                          style: TavText.button.copyWith(color: TavColors.blue),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            TavKeypad(
              onDigit: _onDigit,
              onDelete: _onDelete,
              auxiliaryLabel: 'Salir',
              onAuxiliary: () async {
                await ref.read(authProvider.notifier).logout();
              },
            ),
          ],
        ),
      ),
    );
  }
}
