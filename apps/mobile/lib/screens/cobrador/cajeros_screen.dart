import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_card.dart';
import '../../components/tav_load_state.dart';
import '../../data/cobrador_api.dart';
import '../../state/cobrador_state.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';
import 'cobrador_widgets.dart';

/// Pantalla "Cajeros por cobrar".
///
/// Lista compartida entre todos los cobradores, ordenada por urgencia.
/// El servidor la devuelve ordenada: aquí no se reordena.
/// Cada fila muestra deuda, días, porcentaje del límite, el semáforo,
/// si lleva días sin conectarse y quién lo está atendiendo.
///
/// El segmento "Cobrados hoy" muestra los cobros del cierre actual.
class CajerosScreen extends ConsumerStatefulWidget {
  const CajerosScreen({super.key});

  @override
  ConsumerState<CajerosScreen> createState() => _CajerosScreenState();
}

class _CajerosScreenState extends ConsumerState<CajerosScreen> {
  int _segmento = 0; // 0 = por cobrar, 1 = cobrados hoy

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _cargar());
  }

  void _cargar() {
    ref.read(cajerosCobradorProvider.notifier).cargar();
    ref.read(cierreActualProvider.notifier).cargar();
  }

  @override
  Widget build(BuildContext context) {
    final cajerosState = ref.watch(cajerosCobradorProvider);
    final cierreState = ref.watch(cierreActualProvider);

    final cajeros = cajerosState is CobradorDataLoaded<List<CajeroCobradorDto>>
        ? cajerosState.data
        : <CajeroCobradorDto>[];
    final cierre = cierreState is CobradorDataLoaded<CierreDto>
        ? cierreState.data
        : null;
    final nombres = {for (final c in cajeros) c.id: c.nombre};
    final cobros = cierre?.cobrosActivos ?? [];

    final pendientes = cajeros.where((c) => c.saldoCents > 0).toList();

    return Scaffold(
      backgroundColor: TavColors.bg,
      body: SafeArea(
        child: Column(
          children: [
            _buildTopBar(),
            _buildSegmento(pendientes.length, cobros.length),
            Expanded(
              child: RefreshIndicator(
                color: TavColors.blue,
                onRefresh: () async => _cargar(),
                child: _segmento == 0
                    ? _buildPorCobrar(cajerosState, pendientes)
                    : _buildCobradosHoy(cierreState, cobros, nombres),
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
              child: const Icon(Icons.arrow_back, color: TavColors.ink, size: 20),
            ),
          ),
          const SizedBox(width: TavSpace.md),
          Expanded(child: Text('Cajeros por cobrar', style: TavText.h2)),
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: TavColors.surface,
              border: Border.all(color: TavColors.line),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.place_outlined, color: TavColors.ink, size: 20),
          ),
        ],
      ),
    );
  }

  Widget _buildSegmento(int pend, int done) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: TavSpace.xl),
      child: Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: TavColors.line2,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Expanded(
              child: _buildSegTab('Por cobrar ($pend)', 0),
            ),
            Expanded(
              child: _buildSegTab('Cobrados hoy ($done)', 1),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSegTab(String label, int index) {
    final on = _segmento == index;
    return GestureDetector(
      onTap: () => setState(() => _segmento = index),
      child: Container(
        height: 36,
        decoration: BoxDecoration(
          color: on ? TavColors.surface : Colors.transparent,
          borderRadius: BorderRadius.circular(9),
          boxShadow: on
              ? [const BoxShadow(color: Color(0x1A101828), blurRadius: 4, offset: Offset(0, 1))]
              : null,
        ),
        child: Center(
          child: Text(
            label,
            style: TavText.label.copyWith(
              fontSize: 12.5,
              color: on ? TavColors.ink : TavColors.ink3,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildPorCobrar(
      CobradorDataState state, List<CajeroCobradorDto> pendientes) {
    return TavLoadState(
      isLoading: state is CobradorDataLoading,
      error: state is CobradorDataError ? state.message : null,
      onRetry: _cargar,
      emptyCheck: () => pendientes.isEmpty,
      emptyMessage: 'Nada pendiente. No queda nadie por cobrar.',
      child: ListView(
        padding: const EdgeInsets.fromLTRB(
            TavSpace.xl, TavSpace.md, TavSpace.xl, TavSpace.xxl),
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: TavSpace.md),
            child: Text(
              'Lista compartida por todos los cobradores. Primero los bloqueados '
              'por límite, después los de más días.',
              style: TavText.caption.copyWith(
                color: TavColors.ink3,
                height: 1.5,
              ),
            ),
          ),
          TavCard(
            padding:
                const EdgeInsets.symmetric(horizontal: TavSpace.lg, vertical: 0),
            child: Column(
              children: pendientes.map((c) {
                final isLast = c == pendientes.last;
                return _FilaConDivisor(
                  isLast: isLast,
                  child: CajeroCobradorRow(
                    cajero: c,
                    onTap: () => context.push('/cobrador/cajero/${c.id}'),
                  ),
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCobradosHoy(
    CobradorDataState state,
    List<CobroDto> cobros,
    Map<String, String> nombres,
  ) {
    return TavLoadState(
      isLoading: state is CobradorDataLoading,
      error: state is CobradorDataError ? state.message : null,
      onRetry: _cargar,
      emptyCheck: () => cobros.isEmpty,
      emptyMessage: 'Aún no has registrado cobros hoy.',
      child: ListView(
        padding: const EdgeInsets.fromLTRB(
            TavSpace.xl, TavSpace.lg, TavSpace.xl, TavSpace.xxl),
        children: [
          TavCard(
            padding:
                const EdgeInsets.symmetric(horizontal: TavSpace.lg, vertical: 0),
            child: Column(
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
        ],
      ),
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
