import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:local_auth/local_auth.dart';

import '../components/tav_keypad.dart';
import '../state/auth_state.dart';
import '../theme/tav_colors.dart';
import '../theme/tav_space.dart';
import '../theme/tav_text.dart';

/// Pantalla de reingreso con PIN + biometría.
///
/// Replica el prototipo s-login:
/// - Avatar con iniciales (fondo navy)
/// - "Hola, {nombre}"
/// - "Ingresa tu PIN para continuar"
/// - 4 puntos del PIN
/// - Botón "Usar Face ID" / "Huella"
/// - Keypad 3x3 con "Salir" en esquina inferior izquierda
class PinLoginScreen extends ConsumerStatefulWidget {
  const PinLoginScreen({super.key});

  @override
  ConsumerState<PinLoginScreen> createState() => _PinLoginScreenState();
}

class _PinLoginScreenState extends ConsumerState<PinLoginScreen> {
  String _pin = '';
  final LocalAuthentication _localAuth = LocalAuthentication();

  @override
  void initState() {
    super.initState();
    // Intentar biometría automáticamente al entrar
    WidgetsBinding.instance.addPostFrameCallback((_) => _tryBiometric());
  }

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
    // El PIN se valida contra el almacenamiento local (no contra la API).
    // La API ya validó teléfono+contraseña en el login inicial.
    final storage = ref.read(tokenStorageProvider);
    final savedPin = await storage.getPin();

    if (_pin == savedPin) {
      // PIN correcto: el router redirige al shell del rol.
      // El estado ya es AuthAuthenticated, solo necesitamos disparar
      // la navegación que el router hace automáticamente.
      setState(() => _pin = '');
    } else {
      // PIN incorrecto: limpiar y mostrar error
      setState(() => _pin = '');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('PIN incorrecto. Intenta de nuevo.'),
            backgroundColor: TavColors.red,
            duration: Duration(seconds: 2),
          ),
        );
      }
    }
  }

  Future<void> _tryBiometric() async {
    try {
      final available = await _localAuth.canCheckBiometrics;
      if (!available) return;

      final didAuth = await _localAuth.authenticate(
        localizedReason: 'Usa Face ID para entrar a TAV',
        options: const AuthenticationOptions(
          biometricOnly: true,
          stickyAuth: true,
        ),
      );

      if (didAuth && mounted) {
        // Biometría exitosa: el router redirige al shell del rol.
      }
    } catch (_) {
      // Si la biometría falla, el usuario usa el PIN manualmente.
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
    final nombre = authState is AuthAuthenticated
        ? authState.usuario.nombre
        : '';

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
                    TextButton(
                      onPressed: _tryBiometric,
                      child: Text(
                        'Usar Face ID',
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
