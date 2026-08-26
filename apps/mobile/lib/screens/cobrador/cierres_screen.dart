import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_button.dart';
import '../../components/tav_card.dart';
import '../../components/tav_chip.dart';
import '../../components/tav_load_state.dart';
import '../../components/tav_money_display.dart';
import '../../data/cobrador_api.dart';
import '../../state/cobrador_state.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_radius.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';
import '../../utils/cobrador_labels.dart';

/// Historial de cierres del cobrador con su estado de verificación.
///
/// Datos de GET /cobrador/cierres. La API devuelve los cierres sin la lista de
/// cobros (PENDIENTE DE DEFINIR: contar cobros por cierre).
class CierresScreen extends ConsumerStatefulWidget {
  const CierresScreen({super.key});

  @override
  ConsumerState<CierresScreen> createState() => _CierresScreenState();
}

class _CierresScreenState extends ConsumerState<CierresScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _cargar());
  }

  void _cargar() {
    ref.read(cierresProvider.notifier).cargar();
  }

  @override
  Widget build(BuildContext context) {
    final cierresState = ref.watch(cierresProvider);

    return Scaffold(
      backgroundColor: TavColors.bg,
      body: SafeArea(
        child: Column(
          children: [
            _buildTopBar(),
            Expanded(
              child: RefreshIndicator(
                color: TavColors.blue,
                onRefresh: () async => _cargar(),
                child: TavLoadState(
                  isLoading: cierresState is CobradorDataLoading,
                  error: cierresState is CobradorDataError
                      ? cierresState.message
                      : null,
                  onRetry: _cargar,
                  emptyCheck: () {
                    final items = cierresState is CobradorDataLoaded<
                            ({List<CierreDto> items, int total, bool hasMore})>
                        ? cierresState.data.items
                        : <CierreDto>[];
                    return items.isEmpty;
                  },
                  emptyMessage: 'Aún no tienes cierres registrados.',
                  child: _buildLista(cierresState),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          TavSpace.lg, TavSpace.md, TavSpace.xl, TavSpace.sm),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => context.pop(),
            child: Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: TavColors.surface,
                border: Border.all(color: TavColors.line),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.arrow_back,
                  color: TavColors.ink, size: 20),
            ),
          ),
          const SizedBox(width: TavSpace.md),
          Expanded(child: Text('Mis cierres', style: TavText.h2)),
        ],
      ),
    );
  }

  Widget _buildLista(CobradorDataState state) {
    final page = state is CobradorDataLoaded<
            ({List<CierreDto> items, int total, bool hasMore})>
        ? state.data
        : null;
    final items = page?.items ?? [];

    return ListView(
      padding: const EdgeInsets.fromLTRB(
          TavSpace.xl, TavSpace.md, TavSpace.xl, TavSpace.xxl),
      children: [
        // Estadísticas resumen
        Row(
          children: [
            Expanded(
              child: _buildStat(
                'Este mes',
                page == null
                    ? '\$0,00'
                    : formatCents(_totalMes(page.items)),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _buildStat(
                'Cierres conformes',
                page == null ? '0/0' : _conformes(page.items),
              ),
            ),
          ],
        ),
        const SizedBox(height: TavSpace.lg),
        Text('Historial',
            style: TavText.overline.copyWith(color: TavColors.ink3)),
        const SizedBox(height: TavSpace.sm),
        TavCard(
          padding: const EdgeInsets.symmetric(horizontal: TavSpace.lg, vertical: 0),
          child: Column(
            children: items.asMap().entries.map((e) {
              final i = e.key;
              final c = e.value;
              final isLast = i == items.length - 1;
              return _FilaConDivisor(
                isLast: isLast,
                child: _CierreRow(
                  cierre: c,
                  onTap: () => context.push('/cobrador/cierre/${c.id}'),
                ),
              );
            }).toList(),
          ),
        ),
        if (page?.hasMore ?? false) ...[
          const SizedBox(height: TavSpace.md),
          TavButton(
            label: 'Cargar más',
            variant: TavButtonVariant.outline,
            onPressed: () => ref.read(cierresProvider.notifier).cargarMas(),
          ),
        ],
      ],
    );
  }

  Widget _buildStat(String label, String value) {
    return Container(
      padding: const EdgeInsets.all(TavSpace.md),
      decoration: BoxDecoration(
        color: TavColors.surface,
        border: Border.all(color: TavColors.line),
        borderRadius: BorderRadius.circular(TavRadius.card),
        boxShadow: TavColors.cardShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TavText.caption.copyWith(color: TavColors.ink3)),
          const SizedBox(height: 3),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value,
                style: TavText.h2.copyWith(
                    fontSize: 18, color: TavColors.ink)),
          ),
        ],
      ),
    );
  }

  int _totalMes(List<CierreDto> items) {
    final hoy = DateTime.now();
    return items
        .where((c) => c.fecha.month == hoy.month && c.fecha.year == hoy.year)
        .fold(0, (s, c) => s + c.totalRegistradoCents);
  }

  String _conformes(List<CierreDto> items) {
    final total = items.length;
    final conformes = items.where((c) => c.estado == EstadoCierre.verificado).length;
    return '$conformes/$total';
  }
}

class _CierreRow extends StatelessWidget {
  const _CierreRow({required this.cierre, this.onTap});

  final CierreDto cierre;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final chip = _chipEstado(cierre.estado);
    final icon = _iconoEstado(cierre.estado);
    final color = _colorIcono(cierre.estado);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(TavRadius.card),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 13),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: _fondoIcono(cierre.estado),
                borderRadius: BorderRadius.circular(TavRadius.field),
              ),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(width: TavSpace.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(fechaCorta(cierre.fecha),
                      style: TavText.body
                          .copyWith(fontSize: 14, fontWeight: FontWeight.w600)),
                  Text(
                    // PENDIENTE DE DEFINIR: API no devuelve conteo de cobros.
                    cierre.estado.label,
                    style: TavText.caption.copyWith(color: TavColors.ink3),
                  ),
                ],
              ),
            ),
            const SizedBox(width: TavSpace.md),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                TavMoneyDisplay(
                  cents: cierre.totalRegistradoCents,
                  style: TavText.body
                      .copyWith(fontSize: 14, fontWeight: FontWeight.w600),
                  fitted: true,
                ),
                const SizedBox(height: 4),
                TavChip(label: '● ${cierre.estado.label}', state: chip),
              ],
            ),
          ],
        ),
      ),
    );
  }

  TavChipState _chipEstado(EstadoCierre e) => switch (e) {
        EstadoCierre.abierto => TavChipState.ambar,
        EstadoCierre.enviado => TavChipState.azul,
        EstadoCierre.verificado => TavChipState.verde,
        EstadoCierre.conDiferencia => TavChipState.rojo,
      };

  IconData _iconoEstado(EstadoCierre e) => switch (e) {
        EstadoCierre.abierto => Icons.more_horiz,
        EstadoCierre.enviado => Icons.schedule,
        EstadoCierre.verificado => Icons.check,
        EstadoCierre.conDiferencia => Icons.warning_amber_rounded,
      };

  Color _colorIcono(EstadoCierre e) => switch (e) {
        EstadoCierre.abierto => TavColors.gold,
        EstadoCierre.enviado => TavColors.blue,
        EstadoCierre.verificado => TavColors.green600,
        EstadoCierre.conDiferencia => TavColors.red700,
      };

  Color _fondoIcono(EstadoCierre e) => switch (e) {
        EstadoCierre.abierto => TavColors.gold50,
        EstadoCierre.enviado => TavColors.blue50,
        EstadoCierre.verificado => TavColors.green50,
        EstadoCierre.conDiferencia => TavColors.red50,
      };
}

class _FilaConDivisor extends StatelessWidget {
  const _FilaConDivisor({required this.child, required this.isLast});

  final Widget child;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        child,
        if (!isLast) const Divider(height: 1, color: TavColors.line2),
      ],
    );
  }
}
