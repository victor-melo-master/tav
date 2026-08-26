import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_button.dart';
import '../../components/tav_card.dart';
import '../../components/tav_chip.dart';
import '../../components/tav_kv_row.dart';
import '../../components/tav_load_state.dart';
import '../../components/tav_money_display.dart';
import '../../data/cobrador_api.dart';
import '../../state/cobrador_state.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_radius.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';
import '../../utils/cobrador_labels.dart';

/// Detalle de un cierre con su estado de verificación.
///
/// Si el cierre es el del día, muestra los cobros disponibles en
/// cierre-actual. Los cierres anteriores no traen cobros desde
/// GET /cobrador/cierres (PENDIENTE DE DEFINIR).
class CierreDetailScreen extends ConsumerStatefulWidget {
  const CierreDetailScreen({super.key, required this.cierreId});

  final String cierreId;

  @override
  ConsumerState<CierreDetailScreen> createState() => _CierreDetailScreenState();
}

class _CierreDetailScreenState extends ConsumerState<CierreDetailScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _cargar());
  }

  void _cargar() {
    ref.read(cierreActualProvider.notifier).cargar();
    ref.read(cierresProvider.notifier).cargar();
  }

  CierreDto? _resolverCierre() {
    final actual = ref.watch(cierreActualProvider);
    final historial = ref.watch(cierresProvider);
    if (actual is CobradorDataLoaded<CierreDto> &&
        actual.data.id == widget.cierreId) {
      return actual.data;
    }
    if (historial is CobradorDataLoaded<
        ({List<CierreDto> items, int total, bool hasMore})>) {
      try {
        return historial.data.items.firstWhere((c) => c.id == widget.cierreId);
      } catch (_) {}
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final cierre = _resolverCierre();

    return Scaffold(
      backgroundColor: TavColors.bg,
      body: SafeArea(
        child: Column(
          children: [
            _buildTopBar(),
            Expanded(
              child: TavLoadState(
                isLoading: _resolviendo(),
                error: _error(),
                onRetry: _cargar,
                child: cierre == null
                    ? const SizedBox.shrink()
                    : _buildContenido(cierre),
              ),
            ),
          ],
        ),
      ),
    );
  }

  bool _resolviendo() {
    final a = ref.watch(cierreActualProvider);
    final h = ref.watch(cierresProvider);
    return a is CobradorDataLoading || h is CobradorDataLoading;
  }

  String? _error() {
    final a = ref.watch(cierreActualProvider);
    final h = ref.watch(cierresProvider);
    if (a is CobradorDataError) return a.message;
    if (h is CobradorDataError) return h.message;
    if (!_resolviendo() && _resolverCierre() == null) {
      return 'No encontramos este cierre.';
    }
    return null;
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
          Expanded(
            child: Text(fechaLarga(_resolverCierre()?.fecha ?? DateTime.now()),
                style: TavText.h2),
          ),
        ],
      ),
    );
  }

  Widget _buildContenido(CierreDto c) {
    final chip = _chipEstado(c.estado);
    final tieneDiferencia = c.estado == EstadoCierre.conDiferencia &&
        c.diferenciaCents != null &&
        c.diferenciaCents != 0;

    return RefreshIndicator(
      color: TavColors.blue,
      onRefresh: () async => _cargar(),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(
            TavSpace.xl, TavSpace.sm, TavSpace.xl, TavSpace.xxl),
        children: [
          TavCard(
            child: Center(
              child: Column(
                children: [
                  TavChip(label: '● ${c.estado.label}', state: chip),
                  const SizedBox(height: 10),
                  if (tieneDiferencia) ...[
                    TavMoneyDisplay(
                      cents: c.diferenciaCents!,
                      prefix: c.diferenciaCents! < 0 ? '−' : '+',
                      style: TavText.moneyDisplay
                          .copyWith(fontSize: 30, color: TavColors.red700),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      c.diferenciaCents! < 0
                          ? 'Entregaste menos de lo declarado'
                          : 'Entregaste más de lo declarado',
                      style: TavText.body2.copyWith(color: TavColors.red700),
                    ),
                  ] else ...[
                    Text(c.estado.label,
                        style: TavText.h1.copyWith(fontSize: 20)),
                    const SizedBox(height: 4),
                    Text(
                      c.estado == EstadoCierre.verificado
                          ? 'El administrador verificó tu entrega.'
                          : 'El administrador está verificando tu entrega.',
                      style: TavText.caption.copyWith(color: TavColors.ink3),
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: TavSpace.lg),
          TavCard(
            child: Column(
              children: [
                TavKvRow(
                    label: 'Declarado en efectivo',
                    value: formatCents(c.efectivoDeclaradoCents)),
                TavKvRow(
                    label: 'Digital', value: formatCents(c.digitalCents)),
                if (c.entregadoA != null)
                  TavKvRow(label: 'Entregado a', value: c.entregadoA!),
                if (c.notaCobrador?.isNotEmpty ?? false)
                  TavKvRow(label: 'Tu nota', value: c.notaCobrador!),
              ],
            ),
          ),
          if (c.notaAdmin != null && c.notaAdmin!.isNotEmpty) ...[
            const SizedBox(height: TavSpace.lg),
            Text('Nota del administrador',
                style: TavText.overline.copyWith(color: TavColors.ink3)),
            const SizedBox(height: TavSpace.sm),
            TavCard(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      color: TavColors.navy,
                      borderRadius: BorderRadius.circular(11),
                    ),
                    child: Center(
                      child: Text('SR',
                          style: TavText.label.copyWith(
                              color: TavColors.surface, fontSize: 11)),
                    ),
                  ),
                  const SizedBox(width: TavSpace.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Administración',
                            style: TavText.body
                                .copyWith(fontWeight: FontWeight.w600)),
                        const SizedBox(height: 5),
                        Text(
                          c.notaAdmin!,
                          style: TavText.body2
                              .copyWith(color: TavColors.ink2, height: 1.55),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: TavSpace.lg),
          TavButton(
            label: 'Responder al administrador',
            variant: TavButtonVariant.outline,
            icon: const Icon(Icons.chat_bubble_outline, size: 20),
            onPressed: () {},
          ),
          if (c.cobros.isNotEmpty) ...[
            const SizedBox(height: TavSpace.lg),
            Text('Registros del día (${c.cobros.length})',
                style: TavText.overline.copyWith(color: TavColors.ink3)),
            const SizedBox(height: TavSpace.sm),
            TavCard(
              child: Column(
                children: c.cobros.map((cobro) => TavKvRow(
                  label: '#${cobro.folio}',
                  value: formatCents(cobro.montoUsdCents),
                )).toList(),
              ),
            ),
          ] else ...[
            const SizedBox(height: TavSpace.lg),
            Text('Registros del día',
                style: TavText.overline.copyWith(color: TavColors.ink3)),
            const SizedBox(height: TavSpace.sm),
            Container(
              padding: const EdgeInsets.all(TavSpace.lg),
              decoration: BoxDecoration(
                color: TavColors.surface,
                border: Border.all(color: TavColors.line),
                borderRadius: BorderRadius.circular(TavRadius.card),
              ),
              child: Center(
                child: Text(
                  'PENDIENTE DE DEFINIR: el historial no devuelve la lista de cobros.',
                  style: TavText.caption.copyWith(color: TavColors.ink3),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  TavChipState _chipEstado(EstadoCierre e) => switch (e) {
        EstadoCierre.abierto => TavChipState.ambar,
        EstadoCierre.enviado => TavChipState.azul,
        EstadoCierre.verificado => TavChipState.verde,
        EstadoCierre.conDiferencia => TavChipState.rojo,
      };
}
