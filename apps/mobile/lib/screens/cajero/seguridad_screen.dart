import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_button.dart';
import '../../components/tav_field.dart';
import '../../state/auth_state.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';

/// Pantalla de seguridad del cajero.
///
/// Permite cambiar la contraseña de la cuenta. Al cambiarla, el servidor
/// invalida todos los tokens activos, por lo que la app vuelve a pedir
/// inicio de sesión.
class SeguridadScreen extends ConsumerStatefulWidget {
  const SeguridadScreen({super.key});

  @override
  ConsumerState<SeguridadScreen> createState() => _SeguridadScreenState();
}

class _SeguridadScreenState extends ConsumerState<SeguridadScreen> {
  final _actualController = TextEditingController();
  final _nuevaController = TextEditingController();
  final _confirmarController = TextEditingController();

  bool _cargando = false;
  String? _error;

  Future<void> _cambiar() async {
    setState(() {
      _error = null;
    });

    final actual = _actualController.text;
    final nueva = _nuevaController.text;
    final confirmar = _confirmarController.text;

    if (nueva.isEmpty) {
      setState(() => _error = 'La nueva contraseña no puede estar vacía');
      return;
    }
    if (nueva != confirmar) {
      setState(() => _error = 'La confirmación no coincide');
      return;
    }

    setState(() => _cargando = true);

    final mensaje = await ref.read(authProvider.notifier).cambiarContrasena(
          contrasenaActual: actual,
          nuevaContrasena: nueva,
          confirmarContrasena: confirmar,
        );

    if (!mounted) return;

    setState(() => _cargando = false);

    if (mensaje != null) {
      setState(() => _error = mensaje);
      return;
    }

    if (!mounted) return;
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: Text('Contraseña actualizada', style: TavText.h2),
        content: Text(
          'Tu contraseña cambió correctamente. Inicia sesión de nuevo para continuar.',
          style: TavText.body,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text('Aceptar', style: TavText.body.copyWith(color: TavColors.blue)),
          ),
        ],
      ),
    );

    if (!mounted) return;
    await ref.read(authProvider.notifier).logout();
    if (!mounted) return;
    context.go('/login');
  }

  @override
  void dispose() {
    _actualController.dispose();
    _nuevaController.dispose();
    _confirmarController.dispose();
    super.dispose();
  }

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
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            TavSpace.xl,
            TavSpace.lg,
            TavSpace.xl,
            TavSpace.xl,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Cambiar contraseña',
                style: TavText.h1,
              ),
              const SizedBox(height: TavSpace.sm),
              Text(
                'Al cambiarla, todas las sesiones abiertas se cerrarán y tendrás que volver a entrar.',
                style: TavText.body2.copyWith(color: TavColors.ink2),
              ),
              const SizedBox(height: TavSpace.xl),
              TavField(
                label: 'Contraseña actual',
                controller: _actualController,
                obscureText: true,
                placeholder: '••••••••',
                enabled: !_cargando,
              ),
              const SizedBox(height: TavSpace.lg),
              TavField(
                label: 'Nueva contraseña',
                controller: _nuevaController,
                obscureText: true,
                placeholder: '••••••••',
                enabled: !_cargando,
              ),
              const SizedBox(height: TavSpace.lg),
              TavField(
                label: 'Confirmar nueva contraseña',
                controller: _confirmarController,
                obscureText: true,
                placeholder: '••••••••',
                enabled: !_cargando,
              ),
              if (_error != null) ...[
                const SizedBox(height: TavSpace.md),
                Text(
                  _error!,
                  style: TavText.caption.copyWith(color: TavColors.red),
                ),
              ],
              const Spacer(),
              TavButton(
                label: 'Guardar cambios',
                variant: TavButtonVariant.primary,
                loading: _cargando,
                onPressed: _cargando ? null : _cambiar,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
