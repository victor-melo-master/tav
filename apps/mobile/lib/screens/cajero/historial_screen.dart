import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_card.dart';
import '../../components/tav_list_row.dart';
import '../../components/tav_load_state.dart';
import '../../components/tav_money_display.dart';
import '../../data/cajero_api.dart';
import '../../state/cajero_state.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';
import '../../utils/labels.dart';

/// Historial de operaciones del cajero con filtro por estado.
class HistorialScreen extends ConsumerStatefulWidget {
  const HistorialScreen({super.key});

  @override
  ConsumerState<HistorialScreen> createState() => _HistorialScreenState();
}

class _HistorialScreenState extends ConsumerState<HistorialScreen> {
  String? _filtro; // null = todas

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(operacionesProvider.notifier).cargar();
    });
  }

  void _aplicarFiltro(String? estado) {
    setState(() => _filtro = estado);
    ref.read(operacionesProvider.notifier).cargar(estado: estado);
  }

  @override
  Widget build(BuildContext context) {
    final opsState = ref.watch(operacionesProvider);

    return Scaffold(
      backgroundColor: TavColors.bg,
      appBar: AppBar(
        backgroundColor: TavColors.surface,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: TavColors.ink),
          onPressed: () => context.pop(),
        ),
        title: Text('Mis operaciones', style: TavText.h2),
        centerTitle: false,
      ),
      body: SafeArea(
        child: Column(
          children: [
            _buildFiltros(),
            Expanded(
              child: TavLoadState(
                isLoading: opsState is CajeroDataLoading,
                isRefreshing: opsState is CajeroDataLoaded ? opsState.isRefreshing : false,
                error: opsState is CajeroDataError
                    ? opsState.message
                    : null,
                onRetry: () => ref.read(operacionesProvider.notifier).cargar(estado: _filtro),
                emptyCheck: () {
                  if (opsState is CajeroDataLoaded) {
                    final data = opsState.data as ({List items, int total, bool hasMore});
                    return data.items.isEmpty;
                  }
                  return false;
                },
                emptyMessage: 'No tienes operaciones registradas.',
                child: RefreshIndicator(
                color: TavColors.blue,
                onRefresh: () async => ref.read(operacionesProvider.notifier).cargar(estado: _filtro),
                child: _buildLista(opsState),
              ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFiltros() {
    final filtros = [
      (null, 'Todas'),
      ('en_proceso', 'En proceso'),
      ('completada', 'Completadas'),
    ];
    return Container(
      padding: const EdgeInsets.fromLTRB(TavSpace.xl, TavSpace.sm, TavSpace.xl, TavSpace.sm),
      child: Row(
        children: filtros.map((f) {
          final isOn = _filtro == f.$1;
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: GestureDetector(
              onTap: () => _aplicarFiltro(f.$1),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                decoration: BoxDecoration(
                  color: isOn ? TavColors.blue : TavColors.surface,
                  border: Border.all(color: isOn ? TavColors.blue : TavColors.line),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  f.$2,
                  style: TavText.label.copyWith(
                    color: isOn ? TavColors.surface : TavColors.ink3,
                    fontSize: 12.5,
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildLista(CajeroDataState state) {
    if (state is! CajeroDataLoaded) return const SizedBox.shrink();
    final data = state.data as ({List<OperacionDto> items, int total, bool hasMore});

    // Agrupar por mes
    final grupos = <String, List<OperacionDto>>{};
    for (final op in data.items) {
      final key = _mesAnio(op.creadaAt);
      grupos.putIfAbsent(key, () => []).add(op);
    }

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(TavSpace.xl, TavSpace.sm, TavSpace.xl, TavSpace.xxl),
      itemCount: grupos.length + (data.hasMore ? 1 : 0),
      itemBuilder: (context, i) {
        if (i == grupos.length && data.hasMore) {
          return Padding(
            padding: const EdgeInsets.only(top: TavSpace.lg),
            child: Center(
              child: TextButton(
                onPressed: () => ref.read(operacionesProvider.notifier).cargarMas(),
                child: Text('Cargar más', style: TavText.label.copyWith(color: TavColors.blue)),
              ),
            ),
          );
        }

        final entry = grupos.entries.elementAt(i);
        final items = entry.value;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (i > 0) const SizedBox(height: TavSpace.lg),
            Text(entry.key, style: TavText.overline.copyWith(color: TavColors.ink3)),
            const SizedBox(height: TavSpace.sm),
            TavCard(
              padding: const EdgeInsets.symmetric(horizontal: TavSpace.lg, vertical: 0),
              child: Column(
                children: items.map((op) {
                  final idx = items.indexOf(op);
                  return TavListRow(
                    title: op.beneficiario.nombre,
                    subtitle: '#${op.folio} · ${tipoOperacionLabel(op.tipo)} · ${_fechaHora(op.creadaAt)}',
                    trailingTitle: formatCents(op.totalCents),
                    trailingSubtitle: op.estado.estadoLabel,
                    avatar: Icon(
                      _iconoEstado(op.estado),
                      color: _colorEstado(op.estado),
                      size: 18,
                    ),
                    avatarColor: _bgColorEstado(op.estado),
                    onTap: () => context.push('/cajero/operacion/${op.id}'),
                    showDivider: idx < items.length - 1,
                  );
                }).toList(),
              ),
            ),
          ],
        );
      },
    );
  }

  String _mesAnio(DateTime d) {
    const meses = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    return '${meses[d.month - 1]} ${d.year}';
  }

  String _fechaHora(DateTime d) {
    const meses = [
      'ene', 'feb', 'mar', 'abr', 'may', 'jun',
      'jul', 'ago', 'sep', 'oct', 'nov', 'dic'
    ];
    final h = d.hour.toString().padLeft(2, '0');
    final m = d.minute.toString().padLeft(2, '0');
    return '${d.day} ${meses[d.month - 1]} · $h:$m';
  }

  IconData _iconoEstado(String estado) => switch (estado) {
        'completada' => Icons.check_outlined,
        'en_proceso' => Icons.schedule_outlined,
        'en_verificacion' => Icons.hourglass_top_outlined,
        'observada' => Icons.warning_amber_outlined,
        'rechazada' => Icons.close_outlined,
        'anulada' => Icons.block_outlined,
        _ => Icons.circle_outlined,
      };

  Color _colorEstado(String estado) => switch (estado) {
        'completada' => TavColors.green600,
        'en_proceso' => TavColors.blue,
        'en_verificacion' => TavColors.blue,
        'observada' => TavColors.gold700,
        'rechazada' => TavColors.red700,
        'anulada' => TavColors.ink3,
        _ => TavColors.ink3,
      };

  Color _bgColorEstado(String estado) => switch (estado) {
        'completada' => TavColors.green50,
        'en_proceso' => TavColors.blue50,
        'en_verificacion' => TavColors.blue50,
        'observada' => TavColors.gold50,
        'rechazada' => TavColors.red50,
        'anulada' => const Color(0xFFF1F3F6),
        _ => const Color(0xFFF1F3F6),
      };
}
