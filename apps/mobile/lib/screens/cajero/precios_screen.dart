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
import '../../utils/format.dart';

/// Pantalla de precios por servicio del cajero.
///
/// Muestra lo que este cajero paga en guyaneses (GYD) por cada dólar que
/// envía, por cada servicio. Los datos vienen de GET /cajero/corredores.
class PreciosScreen extends ConsumerStatefulWidget {
  const PreciosScreen({super.key});

  @override
  ConsumerState<PreciosScreen> createState() => _PreciosScreenState();
}

class _PreciosScreenState extends ConsumerState<PreciosScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(corredoresProvider.notifier).cargar();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(corredoresProvider);

    return Scaffold(
      backgroundColor: TavColors.bg,
      appBar: AppBar(
        backgroundColor: TavColors.surface,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: TavColors.ink),
          onPressed: () => context.pop(),
        ),
        title: Text('Tus precios', style: TavText.h2),
        centerTitle: false,
      ),
      body: SafeArea(
        child: TavLoadState(
          isLoading: state is CajeroDataLoading,
          isRefreshing: state is CajeroDataLoaded ? state.isRefreshing : false,
          error: state is CajeroDataError ? state.message : null,
          onRetry: () => ref.read(corredoresProvider.notifier).cargar(),
          emptyCheck: () {
            if (state is CajeroDataLoaded<List<CorredorDto>>) {
              return state.data.isEmpty;
            }
            return false;
          },
          emptyMessage:
              'No tienes precios asignados. Contacta al administrador.',
          child: RefreshIndicator(
            color: TavColors.blue,
            onRefresh: () async =>
                ref.read(corredoresProvider.notifier).cargar(),
            child: _buildLista(state),
          ),
        ),
      ),
    );
  }

  Widget _buildLista(CajeroDataState state) {
    if (state is! CajeroDataLoaded<List<CorredorDto>>) {
      return const SizedBox.shrink();
    }
    final corredores = state.data;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(TavSpace.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            r'G$ por dólar que envías',
            style: TavText.body.copyWith(color: TavColors.ink3),
          ),
          const SizedBox(height: TavSpace.md),
          ...corredores.map(_buildItem),
        ],
      ),
    );
  }

  Widget _buildItem(CorredorDto c) {
    return Padding(
      padding: const EdgeInsets.only(bottom: TavSpace.md),
      child: TavCard(
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    c.servicioNombre,
                    style: TavText.label.copyWith(color: TavColors.ink),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${c.paisNombre} · ${c.formaEntregaNombre}',
                    style: TavText.caption.copyWith(color: TavColors.ink3),
                  ),
                ],
              ),
            ),
            Text(
              formatGydDecimal(c.precioGyd),
              style: TavText.h2.copyWith(fontSize: 18, color: TavColors.ink),
            ),
          ],
        ),
      ),
    );
  }
}
