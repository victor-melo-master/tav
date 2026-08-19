import 'package:flutter/material.dart';

import '../theme/tav_colors.dart';
import '../theme/tav_space.dart';
import '../theme/tav_text.dart';
import 'tav_button.dart';

/// Resuelve los tres estados de carga de una pantalla:
/// - loading: spinner centrado
/// - error: mensaje + botón de reintentar
/// - vacío: mensaje + opcional acción
///
/// Nada de pantallas en blanco mientras carga ni errores silenciosos.
class TavLoadState extends StatelessWidget {
  const TavLoadState({
    super.key,
    required this.isLoading,
    required this.error,
    required this.child,
    this.onRetry,
    this.emptyCheck,
    this.emptyMessage,
    this.emptyAction,
  });

  final bool isLoading;
  final String? error;
  final Widget child;
  final VoidCallback? onRetry;

  /// Si retorna true, muestra el mensaje de vacío en vez del child.
  final bool Function()? emptyCheck;
  final String? emptyMessage;
  final Widget? emptyAction;

  @override
  Widget build(BuildContext context) {
    if (isLoading) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(TavSpace.xxl),
          child: CircularProgressIndicator(color: TavColors.blue),
        ),
      );
    }

    if (error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(TavSpace.xxl),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.cloud_off_outlined,
                size: 48,
                color: TavColors.ink4,
              ),
              const SizedBox(height: TavSpace.lg),
              Text(
                error!,
                style: TavText.body2.copyWith(color: TavColors.ink3),
                textAlign: TextAlign.center,
              ),
              if (onRetry != null) ...[
                const SizedBox(height: TavSpace.lg),
                TavButton(
                  label: 'Reintentar',
                  variant: TavButtonVariant.outline,
                  small: true,
                  onPressed: onRetry,
                ),
              ],
            ],
          ),
        ),
      );
    }

    if (emptyCheck != null && emptyCheck!()) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(TavSpace.xxl),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.inbox_outlined,
                size: 48,
                color: TavColors.ink4,
              ),
              const SizedBox(height: TavSpace.lg),
              Text(
                emptyMessage ?? 'No hay nada aquí todavía.',
                style: TavText.body2.copyWith(color: TavColors.ink3),
                textAlign: TextAlign.center,
              ),
              if (emptyAction != null) ...[
                const SizedBox(height: TavSpace.lg),
                emptyAction!,
              ],
            ],
          ),
        ),
      );
    }

    return child;
  }
}
