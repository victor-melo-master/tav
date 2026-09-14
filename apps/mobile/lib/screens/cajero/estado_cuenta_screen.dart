import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_button.dart';
import '../../components/tav_card.dart';
import '../../components/tav_chip.dart';
import '../../components/tav_list_row.dart';
import '../../components/tav_load_state.dart';
import '../../components/tav_money_display.dart';
import '../../components/tav_progress_bar.dart';
import '../../data/cajero_api.dart';
import '../../state/cajero_state.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_radius.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';
import '../../utils/labels.dart';

/// Estado de cuenta del cajero: deuda, semáforo, resumen mensual y
/// movimientos paginados desde GET /cajero/movimientos.
class EstadoCuentaScreen extends ConsumerStatefulWidget {
  const EstadoCuentaScreen({super.key});

  @override
  ConsumerState<EstadoCuentaScreen> createState() =>
      _EstadoCuentaScreenState();
}

class _EstadoCuentaScreenState extends ConsumerState<EstadoCuentaScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(resumenProvider.notifier).cargar();
      ref.read(movimientosProvider.notifier).cargar();
      ref.read(tasasProvider.notifier).cargar();
    });
  }

  void _recargar() {
    ref.read(resumenProvider.notifier).cargar();
    ref.read(movimientosProvider.notifier).cargar();
    ref.read(tasasProvider.notifier).cargar();
  }

  @override
  Widget build(BuildContext context) {
    final resumenState = ref.watch(resumenProvider);
    final movsState = ref.watch(movimientosProvider);
    final tasasState = ref.watch(tasasProvider);

    return Scaffold(
      backgroundColor: TavColors.bg,
      appBar: AppBar(
        backgroundColor: TavColors.surface,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: TavColors.ink),
          onPressed: () => context.pop(),
        ),
        title: Text('Estado de cuenta', style: TavText.h2),
        centerTitle: false,
        actions: [
          IconButton(
            icon: const Icon(Icons.download_outlined, color: TavColors.ink2),
            onPressed: () {},
          ),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          color: TavColors.blue,
          onRefresh: () async => _recargar(),
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(TavSpace.xl),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildDeuda(resumenState, tasasState),
                const SizedBox(height: TavSpace.lg),
                _buildSemaforo(resumenState),
                const SizedBox(height: TavSpace.lg),
                _buildMovimientos(movsState),
                const SizedBox(height: TavSpace.lg),
                if (resumenState is! CajeroDataLoaded<ResumenDto> ||
                    resumenState.data.saldoCents > 0)
                  TavButton(
                    label: 'Abonar a mi deuda',
                    variant: TavButtonVariant.green,
                    onPressed: () => context.push('/cajero/abono'),
                  ),
                const SizedBox(height: TavSpace.xxl),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildDeuda(CajeroDataState resumenState, CajeroDataState tasasState) {
    int saldo = 0;
    double tasaBsGyd = 0;
    bool tieneFavor = false;

    if (resumenState is CajeroDataLoaded<ResumenDto>) {
      saldo = resumenState.data.saldoCents;
      tieneFavor = saldo < 0;
    }
    if (tasasState is CajeroDataLoaded<List<TasaDto>>) {
      for (final t in tasasState.data) {
        if (t.par == 'BS_GYD') {
          tasaBsGyd = double.tryParse(t.valor) ?? 0;
          break;
        }
      }
    }

    // El saldo está en GYD. Para mostrar la equivalencia en BS, dividimos
    // por la tasa BS_GYD (que va de BS a GYD). Si BS_GYD = 0.732, entonces
    // 1 GYD = 1/0.732 BS.
    final saldoBs = tasaBsGyd > 0 ? (saldo.abs() / tasaBsGyd).round() : 0;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(TavSpace.lg),
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
          Text(
            tieneFavor ? 'Saldo a favor' : 'Deuda actual',
            style: TavText.caption.copyWith(color: const Color(0xFF9EC0EC)),
          ),
          const SizedBox(height: 4),
          TavMoneyDisplay(
            cents: saldo.abs(),
            color: TavColors.surface,
            style: TavText.moneyDisplay.copyWith(fontSize: 32),
            fitted: true,
          ),
          const SizedBox(height: 2),
          if (tasaBsGyd > 0)
            Text(
              tieneFavor
                  ? '≈ Bs ${_formatBs(saldoBs)} a tasa de hoy'
                  : '≈ Bs ${_formatBs(saldoBs)} a tasa de hoy',
              style: TavText.caption.copyWith(color: const Color(0xFF9EC0EC)),
            ),
        ],
      ),
    );
  }

  Widget _buildSemaforo(CajeroDataState state) {
    if (state is! CajeroDataLoaded<ResumenDto>) {
      return TavLoadState(
        isLoading: state is CajeroDataLoading,
        isRefreshing: state is CajeroDataLoaded ? state.isRefreshing : false,
        error: state is CajeroDataError ? state.message : null,
        onRetry: _recargar,
        child: const SizedBox.shrink(),
      );
    }

    final r = state.data;
    final sem = r.semaforo;
    final pctProgreso = r.limiteCents > 0
        ? (sem.dias / 7).clamp(0.0, 1.0)
        : 0.0;

    final chipState = switch (sem.estado) {
      'verde' => TavChipState.verde,
      'ambar' => TavChipState.ambar,
      'rojo' => TavChipState.rojo,
      _ => TavChipState.gris,
    };

    final chipLabel = switch (sem.estado) {
      'verde' => 'Al día',
      'ambar' => 'Por vencer',
      'rojo' => 'Vencido',
      _ => sem.motivo,
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Semáforo de pago', style: TavText.overline.copyWith(color: TavColors.ink3)),
        const SizedBox(height: TavSpace.sm),
        TavCard(
          child: Column(
            children: [
              Row(
                children: [
                  // 3 luces
                  Row(
                    children: List.generate(3, (i) {
                      final isOn = i <= switch (sem.estado) {
                        'verde' => 0,
                        'ambar' => 1,
                        'rojo' => 2,
                        _ => 0,
                      };
                      final color = switch (i) {
                        0 => TavColors.green600,
                        1 => TavColors.gold,
                        2 => TavColors.red,
                        _ => TavColors.line,
                      };
                      return Padding(
                        padding: EdgeInsets.only(right: i < 2 ? 5 : 0),
                        child: Container(
                          width: 13,
                          height: 13,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: isOn ? color : TavColors.line,
                          ),
                        ),
                      );
                    }),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      '${sem.dias} días transcurridos',
                      style: TavText.h2.copyWith(fontSize: 14),
                    ),
                  ),
                  TavChip(label: chipLabel, state: chipState),
                ],
              ),
              const SizedBox(height: 14),
              TavProgressBar(
                progress: pctProgreso,
                color: switch (sem.estado) {
                  'verde' => TavColors.green600,
                  'ambar' => TavColors.gold,
                  'rojo' => TavColors.red,
                  _ => TavColors.blue,
                },
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  Text('0 días', style: TavText.caption.copyWith(color: TavColors.ink3, fontSize: 11)),
                  const Spacer(),
                  Text('Límite: 7 días', style: TavText.caption.copyWith(color: TavColors.ink3, fontSize: 11)),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                'Al llegar a 7 días tu cuenta pasa a rojo y se notifica al cobrador asignado a tu zona.',
                style: TavText.caption.copyWith(color: TavColors.ink3, height: 1.55),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildMovimientos(CajeroDataState state) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Movimientos', style: TavText.overline.copyWith(color: TavColors.ink3)),
        const SizedBox(height: TavSpace.sm),
        TavLoadState(
          isLoading: state is CajeroDataLoading,
          isRefreshing: state is CajeroDataLoaded ? state.isRefreshing : false,
          error: state is CajeroDataError ? state.message : null,
          onRetry: () => ref.read(movimientosProvider.notifier).cargar(),
          emptyCheck: () {
            if (state is CajeroDataLoaded) {
              final data = state.data as ({List items, int total, bool hasMore});
              return data.items.isEmpty;
            }
            return false;
          },
          emptyMessage: 'No tienes movimientos registrados.',
          child: _buildListaMovs(state),
        ),
      ],
    );
  }

  Widget _buildListaMovs(CajeroDataState state) {
    if (state is! CajeroDataLoaded) return const SizedBox.shrink();
    final data = state.data as ({List<MovimientoDto> items, int total, bool hasMore});

    return Column(
      children: [
        TavCard(
          padding: const EdgeInsets.symmetric(horizontal: TavSpace.lg, vertical: 0),
          child: Column(
            children: data.items.map((m) {
              final idx = data.items.indexOf(m);
              final isCargo = m.montoCents > 0;
              return TavListRow(
                title: '${tipoMovimientoLabel(m.tipo)} · ${m.origenTipo == 'operacion' ? 'Operación' : m.origenTipo}',
                subtitle: _fechaHora(m.creadoAt),
                trailingTitle: isCargo
                    ? '+${formatCents(m.montoCents)}'
                    : '−${formatCents(m.montoCents.abs())}',
                trailingSubtitle: 'Saldo ${formatCents(m.saldoDespues)}',
                avatar: Icon(
                  isCargo ? Icons.arrow_upward_outlined : Icons.arrow_downward_outlined,
                  color: isCargo ? TavColors.red : TavColors.green600,
                  size: 18,
                ),
                avatarColor: isCargo ? TavColors.red50 : TavColors.green50,
                showDivider: idx < data.items.length - 1,
              );
            }).toList(),
          ),
        ),
        if (data.hasMore)
          Padding(
            padding: const EdgeInsets.only(top: TavSpace.md),
            child: Center(
              child: TextButton(
                onPressed: () => ref.read(movimientosProvider.notifier).cargarMas(),
                child: Text('Cargar más', style: TavText.label.copyWith(color: TavColors.blue)),
              ),
            ),
          ),
      ],
    );
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

  String _formatBs(int cents) {
    final value = cents.abs() / 100.0;
    final s = value.toStringAsFixed(2);
    final parts = s.split('.');
    final entero = parts[0].replaceAllMapped(
      RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
      (m) => '${m[1]}.',
    );
    return '$entero,${parts[1]}';
  }
}
