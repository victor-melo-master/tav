import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_card.dart';
import '../../components/tav_load_state.dart';
import '../../components/tav_money_display.dart';
import '../../data/pagador_api.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';

/// Cola de pagos pendientes del pagador.
///
/// Muestra las operaciones en estado `pendiente` cuyo corredor es del
/// país del pagador, ordenadas por antigüedad. Tocar una operación abre
/// la pantalla de ejecución de pago.
class PagadorColaScreen extends ConsumerStatefulWidget {
  const PagadorColaScreen({super.key});

  @override
  ConsumerState<PagadorColaScreen> createState() => _PagadorColaScreenState();
}

class _PagadorColaScreenState extends ConsumerState<PagadorColaScreen> {
  List<ItemColaPagadorDto>? _cola;
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
      final cola = await api.cola();
      if (!mounted) return;
      setState(() {
        _cola = cola;
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
        title: const Text('Cola de pagos'),
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
        child: _cola == null
            ? const SizedBox.shrink()
            : _cola!.isEmpty
                ? _colaVacia()
                : _lista(),
      ),
    );
  }

  Widget _colaVacia() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.check_circle_outline, size: 64, color: TavColors.ink3),
          const SizedBox(height: TavSpace.md),
          Text('Sin pagos pendientes', style: TavText.body.copyWith(color: TavColors.ink3)),
        ],
      ),
    );
  }

  Widget _lista() {
    return RefreshIndicator(
      onRefresh: _cargar,
      child: ListView.builder(
        padding: const EdgeInsets.all(TavSpace.md),
        itemCount: _cola!.length,
        itemBuilder: (context, i) => _item(_cola![i]),
      ),
    );
  }

  Widget _item(ItemColaPagadorDto item) {
    return Padding(
      padding: const EdgeInsets.only(bottom: TavSpace.sm),
      child: TavCard(
        onTap: () async {
          await context.push('/pagador/operacion/${item.id}');
          _cargar(); // refrescar al volver (la operación pudo pagarse)
        },
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(item.folio, style: TavText.h2),
                Text(
                  _fechaCorta(item.creadaAt),
                  style: TavText.caption.copyWith(color: TavColors.ink3),
                ),
              ],
            ),
            const SizedBox(height: TavSpace.xs),
            TavMoneyDisplay(
              cents: item.montoOrigenCents,
              currency: TavMoneyCurrency.usd,
              style: TavText.h2,
            ),
            const SizedBox(height: TavSpace.xs),
            Text(
              '${item.corredor.paisNombre} · ${item.corredor.monedaNombre} · ${item.corredor.formaEntregaNombre}',
              style: TavText.caption.copyWith(color: TavColors.ink3),
            ),
            const SizedBox(height: TavSpace.xs),
            Text(
              '${item.beneficiario['nombre'] ?? '—'} · ${item.beneficiario['banco'] ?? '—'} · ${item.beneficiario['cuenta'] ?? '—'}',
              style: TavText.caption.copyWith(color: TavColors.ink2),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }

  String _fechaCorta(DateTime d) {
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return '${d.day} ${meses[d.month - 1]} · ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
  }
}
