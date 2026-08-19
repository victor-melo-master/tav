import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_card.dart';
import '../../components/tav_list_row.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';

/// Pantalla de notificaciones del cajero.
///
/// PENDIENTE DE DEFINIR: el endpoint de notificaciones no existe todavía
/// en la API. Esta pantalla muestra datos estáticos del prototipo.
/// Cuando se implemente el endpoint, se conecta aquí.
class NotificacionesScreen extends StatelessWidget {
  const NotificacionesScreen({super.key});

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
        title: Text('Notificaciones', style: TavText.h2),
        centerTitle: false,
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: TavSpace.lg),
            child: Center(
              child: GestureDetector(
                onTap: () {},
                child: Text('Marcar leídas', style: TavText.caption.copyWith(color: TavColors.blue)),
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(TavSpace.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Hoy', style: TavText.overline.copyWith(color: TavColors.ink3)),
              const SizedBox(height: TavSpace.sm),
              TavCard(
                padding: const EdgeInsets.symmetric(horizontal: TavSpace.lg, vertical: 0),
                child: Column(
                  children: [
                    TavListRow(
                      title: 'Recordatorio de pago',
                      subtitle: 'Recuerda abonar para mantener tu semáforo en verde.',
                      avatar: const Icon(Icons.warning_amber_outlined, color: TavColors.red700, size: 18),
                      avatarColor: TavColors.red50,
                      onTap: () => context.push('/cajero/cuenta'),
                      showDivider: true,
                    ),
                    TavListRow(
                      title: 'Tasa actualizada',
                      subtitle: 'USDT → Bs actualizada · revisa la tasa de hoy.',
                      avatar: const Icon(Icons.refresh, color: TavColors.gold700, size: 18),
                      avatarColor: TavColors.gold50,
                      onTap: () => context.push('/cajero/tasas'),
                      showDivider: false,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: TavSpace.lg),
              Text('Ayer', style: TavText.overline.copyWith(color: TavColors.ink3)),
              const SizedBox(height: TavSpace.sm),
              TavCard(
                padding: const EdgeInsets.symmetric(horizontal: TavSpace.lg, vertical: 0),
                child: Column(
                  children: [
                    TavListRow(
                      title: 'Operación completada',
                      subtitle: 'Tu operación fue completada exitosamente.',
                      avatar: const Icon(Icons.check_outlined, color: TavColors.green600, size: 18),
                      avatarColor: TavColors.green50,
                      onTap: () => context.push('/cajero/operaciones'),
                      showDivider: true,
                    ),
                    TavListRow(
                      title: 'Pago verificado',
                      subtitle: 'Recibimos tu comprobante.',
                      avatar: const Icon(Icons.schedule_outlined, color: TavColors.blue, size: 18),
                      avatarColor: TavColors.blue50,
                      onTap: () => context.push('/cajero/operaciones'),
                      showDivider: false,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
