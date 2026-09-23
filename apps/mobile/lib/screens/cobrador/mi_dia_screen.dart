import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_button.dart';
import '../../components/tav_card.dart';
import '../../components/tav_chip.dart';
import '../../components/tav_load_state.dart';
import '../../components/tav_money_display.dart';
import '../../components/tav_progress_bar.dart';
import '../../data/cobrador_api.dart';
import '../../state/auth_state.dart';
import '../../state/cobrador_state.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_radius.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';
import '../../utils/cobrador_labels.dart';
import '../../utils/labels.dart';
import 'cobrador_widgets.dart';

/// Pantalla "Mi día" del cobrador.
///
/// Muestra lo recaudado hoy con el desglose entre efectivo en mano y digital,
/// el progreso de cajeros visitados, estadísticas rápidas, los más urgentes
/// y los últimos cobros.
///
/// Datos de GET /cobrador/cierre-actual y GET /cobrador/cajeros.
class MiDiaScreen extends ConsumerStatefulWidget {
  const MiDiaScreen({super.key});

  @override
  ConsumerState<MiDiaScreen> createState() => _MiDiaScreenState();
}

class _MiDiaScreenState extends ConsumerState<MiDiaScreen> {
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
    final authState = ref.watch(authProvider);
    final nombre =
        authState is AuthAuthenticated ? authState.usuario.nombre : '';
    final cierreState = ref.watch(cierreActualProvider);
    final cajerosState = ref.watch(cajerosCobradorProvider);

    return Scaffold(
      backgroundColor: TavColors.bg,
      body: SafeArea(
        child: RefreshIndicator(
          color: TavColors.blue,
          onRefresh: () async => _cargar(),
          child: CustomScrollView(
            slivers: [
              SliverToBoxAdapter(child: _buildTopBar(nombre)),
              SliverToBoxAdapter(
                child: TavLoadState(
                  isLoading: cierreState is CobradorDataLoading,
                  isRefreshing: cierreState is CobradorDataLoaded ? cierreState.isRefreshing : false,
                  error: cierreState is CobradorDataError
                      ? cierreState.message
                      : null,
                  onRetry: _cargar,
                  child: _buildRecaudado(cierreState, cajerosState),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(
                      TavSpace.xl, TavSpace.md, TavSpace.xl, TavSpace.sm),
                  child: TavButton(
                    label: 'Registrar cobro',
                    variant: TavButtonVariant.primary,
                    icon: const Icon(Icons.add, size: 20),
                    onPressed: () => context.push('/cobrador/cajeros'),
                  ),
                ),
              ),
              SliverToBoxAdapter(child: _buildStats(cajerosState, cierreState)),
              SliverToBoxAdapter(child: _buildUrgentes(cajerosState)),
              SliverToBoxAdapter(child: _buildUltimos(cierreState, cajerosState)),
              const SliverToBoxAdapter(child: SizedBox(height: TavSpace.xxl)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTopBar(String nombre) {
    final iniciales = inicialesNombre(nombre);
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          TavSpace.xl, TavSpace.md, TavSpace.xl, TavSpace.sm),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => context.push('/cobrador/perfil'),
            child: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: TavColors.navy,
                borderRadius: BorderRadius.circular(13),
              ),
              child: Center(
                child: Text(
                  iniciales,
                  style: TavText.label.copyWith(
                    color: TavColors.surface,
                    fontSize: 14,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: TavSpace.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  fechaLarga(DateTime.now()),
                  style: TavText.caption.copyWith(color: TavColors.ink3),
                ),
                Text(nombre, style: TavText.h2.copyWith(fontSize: 15)),
              ],
            ),
          ),
          GestureDetector(
            onTap: () {},
            child: const Icon(
              Icons.notifications_outlined,
              color: TavColors.ink2,
              size: 24,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRecaudado(
      CobradorDataState cierreState, CobradorDataState cajerosState) {
    if (cierreState is! CobradorDataLoaded<CierreDto>) {
      return const SizedBox.shrink();
    }
    final cierre = cierreState.data;
    final activos = cierre.cobrosActivos;
    final total = cierre.totalRegistradoCents;
    final efectivo = cierre.efectivoCents;
    final digital = cierre.digitalCalculadoCents;

    // Cajeros visitados = cajeros distintos con cobro hoy.
    final visitados = activos.map((c) => c.cajeroId).toSet().length;
    final totalCajeros = cajerosState is CobradorDataLoaded<List<CajeroCobradorDto>>
        ? cajerosState.data.length
        : visitados;
    final prog = totalCajeros > 0 ? visitados / totalCajeros : 0.0;
    final cerrado = cierre.estado != EstadoCierre.abierto;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: TavSpace.xl),
      child: Container(
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
                  child: Text(
                    'Recaudado hoy',
                    style: TavText.caption.copyWith(color: const Color(0xFF9EC0EC)),
                  ),
                ),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 140),
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerRight,
                    child: TavChip(
                      label: '● ${cierre.estado.label}',
                      state: cerrado ? TavChipState.azul : TavChipState.ambar,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            TavMoneyDisplay(
              cents: total,
              color: TavColors.surface,
              style: TavText.moneyDisplay.copyWith(fontSize: 33),
              fitted: true,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _buildSubStat('Efectivo en mano', efectivo),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _buildSubStat('Digital verificable', digital),
                ),
              ],
            ),
            const SizedBox(height: 16),
            TavProgressBar(
              progress: prog,
              color: TavColors.blue,
              height: 7,
            ),
            const SizedBox(height: 7),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '$visitados de $totalCajeros cajeros visitados',
                  style: TavText.caption.copyWith(color: const Color(0xFF9EC0EC)),
                ),
                Text(
                  'Se entrega hoy mismo',
                  style: TavText.caption.copyWith(color: const Color(0xFF9EC0EC)),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSubStat(String label, int cents) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0x17FFFFFF),
        borderRadius: BorderRadius.circular(11),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TavText.caption.copyWith(
              fontSize: 10.5,
              color: const Color(0xFF9EC0EC),
            ),
          ),
          const SizedBox(height: 2),
          TavMoneyDisplay(
            cents: cents,
            color: TavColors.surface,
            style: TavText.body.copyWith(fontSize: 16, fontWeight: FontWeight.w700),
            fitted: true,
          ),
        ],
      ),
    );
  }

  Widget _buildStats(
      CobradorDataState cajerosState, CobradorDataState cierreState) {
    final cajeros = cajerosState is CobradorDataLoaded<List<CajeroCobradorDto>>
        ? cajerosState.data
        : <CajeroCobradorDto>[];
    final porCobrar = cajeros.fold(0, (s, c) => s + c.saldoCents);
    final enRojo = cajeros.where((c) => c.semaforo == 'rojo').length;
    final cobrosHoy = cierreState is CobradorDataLoaded<CierreDto>
        ? cierreState.data.cobrosActivos.length
        : 0;

    return Padding(
      padding: const EdgeInsets.fromLTRB(
          TavSpace.xl, TavSpace.sm, TavSpace.xl, TavSpace.sm),
      child: Row(
        children: [
          Expanded(child: _buildStatCard('Por cobrar', formatCents(porCobrar))),
          const SizedBox(width: 10),
          Expanded(
            child: _buildStatCard(
              'En rojo',
              '$enRojo',
              valueColor: TavColors.red700,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(child: _buildStatCard('Cobros hoy', '$cobrosHoy')),
        ],
      ),
    );
  }

  Widget _buildStatCard(String label, String value, {Color? valueColor}) {
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
            child: Text(
              value,
              style: TavText.h2.copyWith(
                fontSize: 18,
                color: valueColor ?? TavColors.ink,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildUrgentes(CobradorDataState cajerosState) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
              TavSpace.xl, TavSpace.lg, TavSpace.xl, TavSpace.sm),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Los más urgentes',
                  style: TavText.overline.copyWith(color: TavColors.ink3)),
              GestureDetector(
                onTap: () => context.push('/cobrador/cajeros'),
                child: Text(
                  'Ver todos',
                  style: TavText.caption.copyWith(
                    color: TavColors.blue,
                    fontSize: 12.5,
                  ),
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: TavSpace.xl),
          child: TavLoadState(
            isLoading: cajerosState is CobradorDataLoading,
            isRefreshing: cajerosState is CobradorDataLoaded ? cajerosState.isRefreshing : false,
            error: cajerosState is CobradorDataError
                ? cajerosState.message
                : null,
            onRetry: _cargar,
            emptyCheck: () {
              final cajeros =
                  cajerosState is CobradorDataLoaded<List<CajeroCobradorDto>>
                      ? cajerosState.data
                      : <CajeroCobradorDto>[];
              return cajeros.where((c) => c.saldoCents > 0).isEmpty;
            },
            emptyMessage: 'Nada en rojo. Ningún cajero pasado de días ni de límite.',
            child: _buildUrgentesLista(cajerosState),
          ),
        ),
      ],
    );
  }

  Widget _buildUrgentesLista(CobradorDataState cajerosState) {
    if (cajerosState is! CobradorDataLoaded<List<CajeroCobradorDto>>) {
      return const SizedBox.shrink();
    }
    // La lista ya viene ordenada por urgencia desde el servidor.
    final urgentes = cajerosState.data.where((c) => c.saldoCents > 0).take(3).toList();
    return TavCard(
      padding: const EdgeInsets.symmetric(horizontal: TavSpace.lg, vertical: 0),
      child: Column(
        children: urgentes.map((c) {
          final isLast = c == urgentes.last;
          return _FilaConDivisor(
            isLast: isLast,
            child: CajeroCobradorRow(
              cajero: c,
              onTap: () => context.push('/cobrador/cajero/${c.id}'),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildUltimos(
      CobradorDataState cierreState, CobradorDataState cajerosState) {
    final cierre = cierreState is CobradorDataLoaded<CierreDto>
        ? cierreState.data
        : null;
    final cajeros = cajerosState is CobradorDataLoaded<List<CajeroCobradorDto>>
        ? cajerosState.data
        : <CajeroCobradorDto>[];
    final nombres = {for (final c in cajeros) c.id: c.nombre};
    final ultimos = cierre?.cobrosActivos.take(3).toList() ?? [];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
              TavSpace.xl, TavSpace.lg, TavSpace.xl, TavSpace.sm),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Últimos cobros',
                  style: TavText.overline.copyWith(color: TavColors.ink3)),
              GestureDetector(
                onTap: () => context.go('/cobrador/cuadre'),
                child: Text(
                  'Ver lista',
                  style: TavText.caption.copyWith(
                    color: TavColors.blue,
                    fontSize: 12.5,
                  ),
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: TavSpace.xl),
          child: TavCard(
            padding: const EdgeInsets.symmetric(horizontal: TavSpace.lg, vertical: 0),
            child: ultimos.isEmpty
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
                    children: ultimos.map((c) {
                      final isLast = c == ultimos.last;
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
        ),
      ],
    );
  }
}

/// Envuelve una fila y dibuja un divisor inferior salvo en la última.
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
