import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_load_state.dart';
import '../../data/cajero_api.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_radius.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';
import '../../utils/labels.dart';

/// Pantalla de notificaciones del cajero.
///
/// Sin notificaciones push: los avisos se evalúan y se ven cuando el usuario
/// abre la app. Eso queda anotado como limitación conocida en la documentación.
class NotificacionesScreen extends ConsumerStatefulWidget {
  const NotificacionesScreen({super.key});

  @override
  ConsumerState<NotificacionesScreen> createState() => _NotificacionesScreenState();
}

class _NotificacionesScreenState extends ConsumerState<NotificacionesScreen> {
  bool _cargando = true;
  String? _error;
  List<AvisoNotificacionDto> _avisos = [];

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      final api = ref.read(cajeroApiProvider);
      final lista = await api.listarNotificaciones();
      if (!mounted) return;
      setState(() {
        _avisos = lista;
        _cargando = false;
      });
    } on Exception catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _cargando = false;
      });
    }
  }

  Future<void> _abrir(AvisoNotificacionDto aviso) async {
    if (aviso.leido) return;
    try {
      final api = ref.read(cajeroApiProvider);
      await api.marcarNotificacionLeida(aviso.id);
      if (!mounted) return;
      await _cargar();
    } on Exception catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo marcar como leído: $e')),
      );
    }
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
        title: Text('Notificaciones', style: TavText.h2),
        centerTitle: false,
      ),
      body: SafeArea(
        child: RefreshIndicator(
          color: TavColors.blue,
          onRefresh: _cargar,
          child: TavLoadState(
            isLoading: _cargando,
            error: _error,
            onRetry: _cargar,
            emptyCheck: () => _avisos.isEmpty,
            emptyMessage: 'No tienes notificaciones pendientes.',
            child: ListView.separated(
              padding: const EdgeInsets.all(TavSpace.lg),
              itemCount: _avisos.length,
              separatorBuilder: (_, __) => const SizedBox(height: TavSpace.md),
              itemBuilder: (_, index) {
                final a = _avisos[index];
                return _AvisoCard(
                  aviso: a,
                  onTap: () => _abrir(a),
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

class _AvisoCard extends StatelessWidget {
  const _AvisoCard({required this.aviso, this.onTap});

  final AvisoNotificacionDto aviso;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(TavRadius.card),
      child: Container(
        padding: const EdgeInsets.all(TavSpace.lg),
        decoration: BoxDecoration(
          color: TavColors.surface,
          borderRadius: BorderRadius.circular(TavRadius.card),
          border: Border.all(color: TavColors.line),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 10,
              height: 10,
              margin: const EdgeInsets.only(top: 5, right: TavSpace.md),
              decoration: BoxDecoration(
                color: aviso.leido ? TavColors.ink3 : TavColors.blue,
                shape: BoxShape.circle,
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    aviso.titulo,
                    style: TavText.body.copyWith(
                      fontWeight: aviso.leido ? FontWeight.w500 : FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: TavSpace.xs),
                  Text(
                    aviso.cuerpo,
                    style: TavText.body2.copyWith(color: TavColors.ink2),
                  ),
                  const SizedBox(height: TavSpace.sm),
                  Text(
                    tiempoRelativo(aviso.enviadoAt),
                    style: TavText.caption.copyWith(color: TavColors.ink3),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
