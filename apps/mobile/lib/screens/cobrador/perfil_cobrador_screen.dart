import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_button.dart';
import '../../components/tav_card.dart';
import '../../components/tav_load_state.dart';
import '../../data/auth_api.dart';
import '../../state/auth_state.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_radius.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';
import '../../utils/labels.dart';

/// Perfil del cobrador.
///
/// Muestra datos del usuario autenticado, sincronización, rol, zona y
/// acceso a la sesión. Opciones que dependen de un endpoint aún no expuesto
/// se marcan como PENDIENTE DE DEFINIR.
class PerfilCobradorScreen extends ConsumerStatefulWidget {
  const PerfilCobradorScreen({super.key});

  @override
  ConsumerState<PerfilCobradorScreen> createState() =>
      _PerfilCobradorScreenState();
}

class _PerfilCobradorScreenState extends ConsumerState<PerfilCobradorScreen> {
  bool _cerrando = false;

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);

    return Scaffold(
      backgroundColor: TavColors.bg,
      body: SafeArea(
        child: TavLoadState(
          isLoading: authState is AuthLoading,
          error: authState is AuthError ? authState.message : null,
          child: authState is AuthAuthenticated
              ? _buildContenido(authState.usuario)
              : const SizedBox.shrink(),
        ),
      ),
    );
  }

  Widget _buildContenido(UsuarioDto u) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(
          TavSpace.xl, TavSpace.md, TavSpace.xl, TavSpace.xxl),
      children: [
        // Header
        Center(
          child: Column(
            children: [
              Container(
                width: 92,
                height: 92,
                decoration: const BoxDecoration(
                  color: TavColors.navy,
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Text(
                    inicialesNombre(u.nombre),
                    style: TavText.h1.copyWith(
                        color: TavColors.surface, fontSize: 24),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              Text(u.nombre, style: TavText.h1),
              const SizedBox(height: 4),
              Text(
                u.rol,
                style: TavText.body2.copyWith(color: TavColors.ink3),
              ),
            ],
          ),
        ),
        const SizedBox(height: TavSpace.xl),

        // Datos
        TavCard(
          child: Column(
            children: [
              _ProfileItem(
                icon: Icons.badge_outlined,
                label: 'Teléfono',
                value: u.telefono,
              ),
              _ProfileItem(
                icon: Icons.badge_outlined,
                label: 'ID',
                value: u.id,
              ),
              _ProfileItem(
                icon: Icons.groups_2_outlined,
                label: 'Rol',
                value: u.rol,
              ),
            ],
          ),
        ),

        // Opciones
        const SizedBox(height: TavSpace.lg),
        TavCard(
          child: Column(
            children: [
              _ProfileAction(
                icon: Icons.lock_outline,
                label: 'Cambiar PIN',
                onTap: () {},
              ),
              const Divider(height: 1, color: TavColors.line2),
              _ProfileAction(
                icon: Icons.sync_outlined,
                label: 'Sincronizar con la central',
                onTap: () {},
              ),
              const Divider(height: 1, color: TavColors.line2),
              _ProfileAction(
                icon: Icons.description_outlined,
                label: 'Términos y condiciones',
                onTap: () {},
              ),
              const Divider(height: 1, color: TavColors.line2),
              _ProfileAction(
                icon: Icons.help_outline,
                label: 'Ayuda y soporte',
                onTap: () {},
              ),
            ],
          ),
        ),

        const SizedBox(height: TavSpace.lg),
        Container(
          padding: const EdgeInsets.all(TavSpace.lg),
          decoration: BoxDecoration(
            color: TavColors.blue50,
            border: Border.all(color: const Color(0xFFCDE0FB)),
            borderRadius: BorderRadius.circular(TavRadius.card),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.cloud_done_outlined,
                  color: TavColors.blue, size: 20),
              const SizedBox(width: 11),
              Expanded(
                child: Text(
                  'Estás conectado en línea. No hay datos pendientes por sincronizar.',
                  style: TavText.caption
                      .copyWith(color: TavColors.blue600, height: 1.55),
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: TavSpace.lg),
        TavButton(
          label: 'Cerrar sesión',
          variant: TavButtonVariant.outline,
          loading: _cerrando,
          onPressed: _cerrando ? null : _logout,
        ),
        const SizedBox(height: 8),
        Text(
          'PENDIENTE DE DEFINIR: cambiar PIN y sincronización manual dependen de endpoints aún no conectados.',
          style: TavText.caption.copyWith(color: TavColors.ink3),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  Future<void> _logout() async {
    setState(() => _cerrando = true);
    await ref.read(authProvider.notifier).logout();
    if (mounted) {
      setState(() => _cerrando = false);
      context.go('/login');
    }
  }
}

class _ProfileItem extends StatelessWidget {
  const _ProfileItem({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: TavColors.blue50,
              borderRadius: BorderRadius.circular(TavRadius.field),
            ),
            child: Icon(icon, color: TavColors.blue, size: 18),
          ),
          const SizedBox(width: TavSpace.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: TavText.caption.copyWith(color: TavColors.ink3)),
                const SizedBox(height: 2),
                Text(value,
                    style:
                        TavText.body.copyWith(fontWeight: FontWeight.w600)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ProfileAction extends StatelessWidget {
  const _ProfileAction({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: TavColors.blue50,
                borderRadius: BorderRadius.circular(TavRadius.field),
              ),
              child: Icon(icon, color: TavColors.blue, size: 18),
            ),
            const SizedBox(width: TavSpace.md),
            Expanded(
              child: Text(label,
                  style: TavText.body.copyWith(fontWeight: FontWeight.w600)),
            ),
            const Icon(Icons.chevron_right, color: TavColors.ink3, size: 22),
          ],
        ),
      ),
    );
  }
}
