import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_button.dart';
import '../../components/tav_card.dart';
import '../../components/tav_list_row.dart';
import '../../state/auth_state.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';
import '../../utils/labels.dart';

/// Pantalla de perfil del cajero.
///
/// Muestra al usuario, sus accesos (beneficiarios, estado de cuenta,
/// seguridad, notificaciones, soporte) y el botón de cerrar sesión.
class PerfilScreen extends ConsumerWidget {
  const PerfilScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);
    final nombre = authState is AuthAuthenticated ? authState.usuario.nombre : '';
    final telefono = authState is AuthAuthenticated
        ? authState.usuario.telefono ?? 'Sin teléfono'
        : '';
    final iniciales = inicialesNombre(nombre);

    return Scaffold(
      backgroundColor: TavColors.bg,
      appBar: AppBar(
        backgroundColor: TavColors.surface,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: TavColors.ink),
          onPressed: () => context.pop(),
        ),
        title: Text('Mi perfil', style: TavText.h2),
        centerTitle: false,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(TavSpace.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Cabecera del usuario
              TavCard(
                child: Row(
                  children: [
                    Container(
                      width: 56,
                      height: 56,
                      decoration: const BoxDecoration(
                        color: TavColors.navy,
                        shape: BoxShape.circle,
                      ),
                      child: Center(
                        child: Text(
                          iniciales,
                          style: TavText.h2.copyWith(color: TavColors.surface, fontSize: 18),
                        ),
                      ),
                    ),
                    const SizedBox(width: TavSpace.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(nombre, style: TavText.h2.copyWith(fontSize: 16)),
                          const SizedBox(height: 2),
                          Text(
                            telefono,
                            style: TavText.caption.copyWith(color: TavColors.ink3),
                          ),
                        ],
                      ),
                    ),
                    TavButton(
                      label: 'Editar',
                      variant: TavButtonVariant.outline,
                      small: true,
                      expanded: false,
                      onPressed: () {},
                    ),
                  ],
                ),
              ),
              const SizedBox(height: TavSpace.lg),
              Text('Accesos', style: TavText.overline.copyWith(color: TavColors.ink3)),
              const SizedBox(height: TavSpace.sm),
              TavCard(
                padding: const EdgeInsets.symmetric(horizontal: TavSpace.lg, vertical: 0),
                child: Column(
                  children: [
                    TavListRow(
                      title: 'Mis beneficiarios',
                      subtitle: 'Guarda tus contactos frecuentes',
                      avatar: const Icon(Icons.group_outlined, color: TavColors.blue, size: 20),
                      onTap: () => context.push('/cajero/beneficiarios'),
                      showDivider: true,
                    ),
                    TavListRow(
                      title: 'Estado de cuenta',
                      subtitle: 'Deuda, semáforo y movimientos',
                      avatar: const Icon(Icons.receipt_long_outlined, color: TavColors.blue, size: 20),
                      onTap: () => context.push('/cajero/cuenta'),
                      showDivider: true,
                    ),
                    TavListRow(
                      title: 'Abonar a mi deuda',
                      subtitle: 'Los abonos los registra el cobrador',
                      avatar: const Icon(Icons.payments_outlined, color: TavColors.blue, size: 20),
                      onTap: () => context.push('/cajero/abono'),
                      showDivider: true,
                    ),
                    TavListRow(
                      title: 'Seguridad',
                      subtitle: 'PIN y autenticación',
                      avatar: const Icon(Icons.lock_outline, color: TavColors.blue, size: 20),
                      onTap: () => context.push('/cajero/seguridad'),
                      showDivider: true,
                    ),
                    TavListRow(
                      title: 'Notificaciones',
                      subtitle: 'Avisos y recordatorios',
                      avatar: const Icon(Icons.notifications_outlined, color: TavColors.blue, size: 20),
                      onTap: () => context.push('/cajero/notificaciones'),
                      showDivider: true,
                    ),
                    TavListRow(
                      title: 'Soporte',
                      subtitle: '¿Necesitas ayuda? Escríbenos',
                      avatar: const Icon(Icons.support_agent_outlined, color: TavColors.blue, size: 20),
                      onTap: () => context.push('/cajero/soporte'),
                      showDivider: false,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: TavSpace.lg),
              Text('Cuenta', style: TavText.overline.copyWith(color: TavColors.ink3)),
              const SizedBox(height: TavSpace.sm),
              TavCard(
                padding: const EdgeInsets.symmetric(horizontal: TavSpace.lg, vertical: 0),
                child: Column(
                  children: [
                    TavListRow(
                      title: 'Términos y condiciones',
                      avatar: const Icon(Icons.description_outlined, color: TavColors.ink2, size: 20),
                      onTap: () {},
                      showDivider: true,
                    ),
                    const TavListRow(
                      title: 'Versión de la app',
                      subtitle: '1.0.0',
                      avatar: Icon(Icons.info_outline, color: TavColors.ink2, size: 20),
                      showDivider: false,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: TavSpace.xxl),
              TavButton(
                label: 'Cerrar sesión',
                variant: TavButtonVariant.outline,
                onPressed: () async {
                  await ref.read(authProvider.notifier).logout();
                  if (context.mounted) context.go('/login');
                },
              ),
              const SizedBox(height: TavSpace.xxl),
            ],
          ),
        ),
      ),
    );
  }
}
