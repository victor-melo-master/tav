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
import 'cobrador_widgets.dart';

/// Pantalla "Cuadre del día" / Lista del día.
///
/// Muestra el total registrado, el efectivo a entregar separado del digital,
/// el desglose por método y la lista de cobros. El botón cerrar día navega
/// a la pantalla de declarar entrega.
class CuadreScreen extends ConsumerStatefulWidget {
  const CuadreScreen({super.key});

  @override
  ConsumerState<CuadreScreen> createState() => _CuadreScreenState();
}

class _CuadreScreenState extends ConsumerState<CuadreScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _cargar());
  }

  void _cargar() {
    ref.read(cierreActualProvider.notifier).cargar();
    ref.read(cajerosCobradorProvider.notifier).cargar();
  }

  @override
  Widget build(BuildContext context) {
    final cierreState = ref.watch(cierreActualProvider);
    final cajerosState = ref.watch(cajerosCobradorProvider);

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
                  isLoading: cierreState is CobradorDataLoading,
                  isRefreshing: cierreState is CobradorDataLoaded ? cierreState.isRefreshing : false,
                  error: cierreState is CobradorDataError
                      ? cierreState.message
                      : null,
                  onRetry: _cargar,
                  child: _buildContenido(cierreState, cajerosState),
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
          Expanded(child: Text('Lista del día', style: TavText.h2)),
          GestureDetector(
            onTap: () => context.push('/cobrador/cierres'),
            child: Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: TavColors.surface,
                border: Border.all(color: TavColors.line),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.history,
                  color: TavColors.ink, size: 20),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildContenido(
      CobradorDataState cierreState, CobradorDataState cajerosState) {
    if (cierreState is! CobradorDataLoaded<CierreDto>) {
      return const SizedBox.shrink();
    }
    final cierre = cierreState.data;
    final cajeros = cajerosState is CobradorDataLoaded<List<CajeroCobradorDto>>
        ? cajerosState.data
        : <CajeroCobradorDto>[];
    final nombres = {for (final c in cajeros) c.id: c.nombre};
    final cobros = cierre.cobrosActivos;
    final desglose = _desglose(cobros);
    final abierto = cierre.estado == EstadoCierre.abierto;
    final puedeCerrar =
        abierto && cobros.isNotEmpty && (cierre.id?.isNotEmpty ?? false);

    return ListView(
      padding: const EdgeInsets.fromLTRB(
          TavSpace.xl, TavSpace.md, TavSpace.xl, TavSpace.xxl),
      children: [
        // Total
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment(0.0, -1.0),
              end: Alignment(0.9, 1.0),
              colors: [TavColors.navy, Color(0xFF1B4272)],
            ),
            borderRadius: BorderRadius.circular(TavRadius.card),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(fechaLarga(cierre.fecha),
                        style: TavText.caption
                            .copyWith(color: const Color(0xFF9EC0EC))),
                  ),
                  TavChip(
                    label: '● ${cierre.estado.label}',
                    state: cierre.estado == EstadoCierre.abierto
                        ? TavChipState.ambar
                        : TavChipState.azul,
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text('Total registrado',
                  style: TavText.caption
                      .copyWith(color: const Color(0xFF9EC0EC))),
              const SizedBox(height: 2),
              TavMoneyDisplay(
                cents: cierre.totalRegistradoCents,
                color: TavColors.surface,
                style: TavText.moneyDisplay.copyWith(fontSize: 29),
                fitted: true,
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(13),
                decoration: BoxDecoration(
                  color: const Color(0x1CFFFFFF),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  children: [
                    TavKvRow(
                      label: 'Efectivo GYD que entregas',
                      value: formatCents(cierre.efectivoGydCents),
                      valueColor: TavColors.surface,
                    ),
                    TavKvRow(
                      label: 'Efectivo USD que entregas',
                      value: formatCents(cierre.efectivoUsdCents,
                          currency: TavMoneyCurrency.usd),
                      valueColor: TavColors.surface,
                    ),
                    TavKvRow(
                      label: 'Digital (verificable en cuenta)',
                      value: formatCents(cierre.digitalCalculadoCents),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),

        // Desglose por método
        const SizedBox(height: TavSpace.lg),
        Text('Desglose por método',
            style: TavText.overline.copyWith(color: TavColors.ink3)),
        const SizedBox(height: TavSpace.sm),
        TavCard(
          child: Column(
            children: [
              ...desglose.entries.map((e) => _buildFilaDesglose(e.key, e.value)),
              TavKvRow(
                label: 'Total',
                value: formatCents(cierre.totalRegistradoCents),
                valueColor: TavColors.ink,
                divider: true,
              ),
            ],
          ),
        ),

        // Lista de cobros
        const SizedBox(height: TavSpace.lg),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Registros de hoy (${cobros.length})',
                style: TavText.overline.copyWith(color: TavColors.ink3)),
          ],
        ),
        const SizedBox(height: TavSpace.sm),
        TavCard(
          padding:
              const EdgeInsets.symmetric(horizontal: TavSpace.lg, vertical: 0),
          child: cobros.isEmpty
              ? Padding(
                  padding: const EdgeInsets.symmetric(vertical: 18),
                  child: Center(
                    child: Text(
                      'Aún no has registrado cobros hoy.',
                      style: TavText.caption.copyWith(color: TavColors.ink3),
                    ),
                  ),
                )
              : Column(
                  children: cobros.map((c) {
                    final isLast = c == cobros.last;
                    return _FilaConDivisor(
                      isLast: isLast,
                      child: CobroRow(
                        cobro: c,
                        nombresCajeros: nombres,
                        onTap: () => context.push('/cobrador/cobro/${c.id}'),
                      ),
                    );
                  }).toList(),
                ),
        ),

        // Aviso de cierre
        const SizedBox(height: TavSpace.md),
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
              const Icon(Icons.shield_outlined,
                  color: TavColors.blue, size: 20),
              const SizedBox(width: 11),
              Expanded(
                child: Text(
                  'Al cerrar, esta lista se envía al administrador. Él compara el efectivo '
                  'que entregas (GYD y USD por separado) contra lo declarado aquí.',
                  style: TavText.caption.copyWith(
                      color: TavColors.blue600, height: 1.55),
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: TavSpace.md),
        TavButton(
          label: puedeCerrar
              ? 'Cerrar día y declarar entrega'
              : 'Día cerrado · en verificación',
          variant: TavButtonVariant.dark,
          onPressed: puedeCerrar
              ? () => context.push('/cobrador/cierre/${cierre.id}/enviar')
              : null,
        ),
      ],
    );
  }

  Map<MetodoCobro, ({int monto, int montoBase})> _desglose(
      List<CobroDto> cobros) {
    final map = <MetodoCobro, ({int monto, int montoBase})>{};
    for (final c in cobros) {
      final prev = map[c.metodo] ?? (monto: 0, montoBase: 0);
      map[c.metodo] = (
        monto: prev.monto + c.montoCents,
        montoBase: prev.montoBase + c.montoBaseCents,
      );
    }
    // Asegurar los 4 métodos visibles.
    for (final m in MetodoCobro.values) {
      map.putIfAbsent(m, () => (monto: 0, montoBase: 0));
    }
    return map;
  }

  Widget _buildFilaDesglose(
      MetodoCobro m, ({int monto, int montoBase}) val) {
    final original = m == MetodoCobro.bolivares || m == MetodoCobro.pagoMovil
        ? '${formatCents(val.monto, currency: TavMoneyCurrency.bsd)} · '
        : '';
    return TavKvRow(
      label: m.label,
      value: '$original${formatCents(val.montoBase)}',
    );
  }
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
