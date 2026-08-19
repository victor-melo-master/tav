import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_card.dart';
import '../../components/tav_load_state.dart';
import '../../data/cajero_api.dart';
import '../../state/cajero_state.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';
import '../../utils/labels.dart';

/// Pantalla de tasas vigentes.
/// GET /tasas/vigentes.
class TasasScreen extends ConsumerStatefulWidget {
  const TasasScreen({super.key});

  @override
  ConsumerState<TasasScreen> createState() => _TasasScreenState();
}

class _TasasScreenState extends ConsumerState<TasasScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(tasasProvider.notifier).cargar();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(tasasProvider);

    return Scaffold(
      backgroundColor: TavColors.bg,
      appBar: AppBar(
        backgroundColor: TavColors.surface,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: TavColors.ink),
          onPressed: () => context.pop(),
        ),
        title: Text('Tasa del día', style: TavText.h2),
        centerTitle: false,
      ),
      body: SafeArea(
        child: TavLoadState(
          isLoading: state is CajeroDataLoading,
          error: state is CajeroDataError ? state.message : null,
          onRetry: () => ref.read(tasasProvider.notifier).cargar(),
          emptyCheck: () {
            if (state is CajeroDataLoaded<List<TasaDto>>) {
              return state.data.isEmpty;
            }
            return false;
          },
          emptyMessage: 'No hay tasas vigentes configuradas.',
          child: _buildLista(state),
        ),
      ),
    );
  }

  Widget _buildLista(CajeroDataState state) {
    if (state is! CajeroDataLoaded<List<TasaDto>>) return const SizedBox.shrink();
    final tasas = state.data;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(TavSpace.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Las tasas las define el administrador. Se congelan al momento de registrar una operación.',
            style: TavText.body2.copyWith(color: TavColors.ink3, height: 1.55),
          ),
          const SizedBox(height: TavSpace.lg),
          ...tasas.map((t) {
            final icon = switch (t.par) {
              'USDT_BS' => Icons.currency_bitcoin,
              'USD_BS' => Icons.payments_outlined,
              'ZELLE_BS' => Icons.account_balance_wallet_outlined,
              _ => Icons.currency_exchange_outlined,
            };
            final iconBg = switch (t.par) {
              'USDT_BS' => TavColors.blue50,
              'USD_BS' => TavColors.green50,
              'ZELLE_BS' => TavColors.gold50,
              _ => TavColors.blue50,
            };
            final iconColor = switch (t.par) {
              'USDT_BS' => TavColors.blue,
              'USD_BS' => TavColors.green600,
              'ZELLE_BS' => TavColors.gold700,
              _ => TavColors.blue,
            };

            return Padding(
              padding: const EdgeInsets.only(bottom: TavSpace.md),
              child: TavCard(
                child: Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: iconBg,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Icon(icon, color: iconColor, size: 22),
                    ),
                    const SizedBox(width: 13),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(parTasaLabel(t.par), style: TavText.h2.copyWith(fontSize: 15)),
                          const SizedBox(height: 2),
                          Text(
                            'Vigente desde ${_fecha(t.vigenteDesde)}',
                            style: TavText.caption.copyWith(color: TavColors.ink3),
                          ),
                        ],
                      ),
                    ),
                    Text(
                      '${_formatTasa(t.valor)} Bs',
                      style: TavText.h2.copyWith(fontSize: 18, color: TavColors.green600),
                    ),
                  ],
                ),
              ),
            );
          }),
        ],
      ),
    );
  }

  String _fecha(DateTime d) {
    const meses = [
      'ene', 'feb', 'mar', 'abr', 'may', 'jun',
      'jul', 'ago', 'sep', 'oct', 'nov', 'dic'
    ];
    return '${d.day} ${meses[d.month - 1]} ${d.year}';
  }

  String _formatTasa(String valor) {
    final d = double.tryParse(valor);
    if (d == null) return valor;
    final s = d.toStringAsFixed(2);
    final parts = s.split('.');
    final entero = parts[0].replaceAllMapped(
      RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
      (m) => '${m[1]}.',
    );
    return '$entero,${parts[1]}';
  }
}
