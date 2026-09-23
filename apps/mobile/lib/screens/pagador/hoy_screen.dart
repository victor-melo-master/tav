import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../components/tav_card.dart';
import '../../components/tav_load_state.dart';
import '../../data/pagador_api.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';
import '../../utils/labels.dart';

/// Pantalla de pagos del día del pagador.
///
/// Muestra las operaciones que él marcó como pagadas hoy, con la tasa
/// de ejecución, la forma de pago y el nombre del cliente que recibió.
/// No muestra deuda, margen ni saldos de caja.
class PagadorHoyScreen extends ConsumerStatefulWidget {
  const PagadorHoyScreen({super.key});

  @override
  ConsumerState<PagadorHoyScreen> createState() => _PagadorHoyScreenState();
}

class _PagadorHoyScreenState extends ConsumerState<PagadorHoyScreen> {
  List<PagoDelDiaDto>? _pagos;
  String? _error;
  bool _cargando = true;

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
      final api = ref.read(pagadorApiProvider);
      final pagos = await api.pagosDelDia();
      if (!mounted) return;
      setState(() {
        _pagos = pagos;
        _cargando = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _cargando = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: TavColors.bg,
      appBar: AppBar(
        title: const Text('Pagos de hoy'),
        backgroundColor: TavColors.surface,
        foregroundColor: TavColors.ink,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _cargar,
          ),
        ],
      ),
      body: TavLoadState(
        isLoading: _cargando,
        error: _error,
        onRetry: _cargar,
        child: _pagos == null
            ? const SizedBox.shrink()
            : _pagos!.isEmpty
                ? _vacio()
                : _lista(),
      ),
    );
  }

  Widget _vacio() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.history_outlined, size: 64, color: TavColors.ink3),
          const SizedBox(height: TavSpace.md),
          Text('Sin pagos hoy', style: TavText.body.copyWith(color: TavColors.ink3)),
        ],
      ),
    );
  }

  Widget _lista() {
    return RefreshIndicator(
      onRefresh: _cargar,
      child: ListView.builder(
        padding: const EdgeInsets.all(TavSpace.md),
        itemCount: _pagos!.length,
        itemBuilder: (context, i) => _item(_pagos![i]),
      ),
    );
  }

  Widget _item(PagoDelDiaDto p) {
    return Padding(
      padding: const EdgeInsets.only(bottom: TavSpace.sm),
      child: TavCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(p.folio, style: TavText.h2),
                Text(
                  _hora(p.pagadaAt),
                  style: TavText.caption.copyWith(color: TavColors.ink3),
                ),
              ],
            ),
            const SizedBox(height: TavSpace.xs),
            Text(
              simboloMoneda(p.monedaDestino) +
                  (p.montoDestinoCents / 100).toStringAsFixed(2),
              style: TavText.h2.copyWith(
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
            const SizedBox(height: TavSpace.xs),
            Text(
              '${p.corredor.paisNombre} · ${p.corredor.monedaNombre} · ${p.corredor.formaEntregaNombre}',
              style: TavText.caption.copyWith(color: TavColors.ink3),
            ),
            const SizedBox(height: TavSpace.xs),
            _fila('Tasa ejecución', p.tasaEjecucion ?? '—'),
            _fila('Forma de pago', formaPagoLabel(p.formaPago ?? '')),
            _fila('Cliente', p.nombreCliente ?? '—'),
          ],
        ),
      ),
    );
  }

  Widget _fila(String label, String valor) {
    return Padding(
      padding: const EdgeInsets.only(top: 2),
      child: Row(
        children: [
          Text('$label: ', style: TavText.caption.copyWith(color: TavColors.ink3)),
          Expanded(child: Text(valor, style: TavText.caption.copyWith(color: TavColors.ink))),
        ],
      ),
    );
  }

  String _hora(DateTime dt) {
    final h = dt.hour.toString().padLeft(2, '0');
    final m = dt.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }
}
