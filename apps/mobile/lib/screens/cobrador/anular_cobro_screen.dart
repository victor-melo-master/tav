import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_button.dart';
import '../../components/tav_card.dart';
import '../../components/tav_field.dart';
import '../../components/tav_kv_row.dart';
import '../../components/tav_money_display.dart';
import '../../data/cobrador_api.dart';
import '../../state/cobrador_state.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_radius.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';

/// Pantalla para anular un cobro con motivo.
///
/// El motivo es obligatorio y mínimo 10 caracteres. Nunca se borra: la API
/// inserta un reverso y deja el cobro original marcado como anulado.
class AnularCobroScreen extends ConsumerStatefulWidget {
  const AnularCobroScreen({super.key, required this.cobroId});

  final String cobroId;

  @override
  ConsumerState<AnularCobroScreen> createState() => _AnularCobroScreenState();
}

class _AnularCobroScreenState extends ConsumerState<AnularCobroScreen> {
  final _motivoCtrl = TextEditingController();
  String _motivoRapido = '';
  bool _anulando = false;

  final _motivosRapidos = [
    'Monto equivocado',
    'Cajero equivocado',
    'El cajero no entregó el dinero',
    'Registro duplicado',
    'Otro',
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _cargar());
  }

  void _cargar() {
    ref.read(cierreActualProvider.notifier).cargar();
    ref.read(cajerosCobradorProvider.notifier).cargar();
  }

  CobroDto? _resolverCobro() {
    final state = ref.watch(cierreActualProvider);
    if (state is! CobradorDataLoaded<CierreDto>) return null;
    try {
      return state.data.cobros.firstWhere((c) => c.id == widget.cobroId);
    } catch (_) {
      return null;
    }
  }

  Map<String, String> _nombresCajeros() {
    final state = ref.watch(cajerosCobradorProvider);
    if (state is! CobradorDataLoaded<List<CajeroCobradorDto>>) return {};
    return {for (final c in state.data) c.id: c.nombre};
  }

  String get _motivoFinal {
    if (_motivoRapido == 'Otro' || _motivoRapido.isEmpty) {
      return _motivoCtrl.text.trim();
    }
    final extra = _motivoCtrl.text.trim();
    if (extra.isEmpty) return _motivoRapido;
    return '$_motivoRapido: $extra';
  }

  bool get _puedeAnular => _motivoFinal.length >= 10 && !_anulando;

  @override
  Widget build(BuildContext context) {
    final cobro = _resolverCobro();
    final nombres = _nombresCajeros();

    return Scaffold(
      backgroundColor: TavColors.bg,
      body: SafeArea(
        child: Column(
          children: [
            _buildTopBar(),
            Expanded(
              child: cobro == null
                  ? const Center(
                      child: CircularProgressIndicator(color: TavColors.blue))
                  : _buildContenido(cobro, nombres),
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
          Expanded(child: Text('Anular cobro', style: TavText.h2)),
        ],
      ),
    );
  }

  Widget _buildContenido(CobroDto cobro, Map<String, String> nombres) {
    final nombreCajero = nombres[cobro.cajeroId] ?? 'Cajero';

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(
                TavSpace.xl, TavSpace.sm, TavSpace.xl, TavSpace.xxl),
            children: [
        Container(
          padding: const EdgeInsets.all(TavSpace.lg),
          decoration: BoxDecoration(
            color: TavColors.red50,
            border: Border.all(color: const Color(0xFFF3C9C6)),
            borderRadius: BorderRadius.circular(TavRadius.card),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.warning_amber_rounded,
                  color: TavColors.red700, size: 20),
              const SizedBox(width: 11),
              Expanded(
                child: Text(
                  'Vas a anular #${cobro.folio} · ${formatCents(cobro.montoUsdCents)}. '
                  'La deuda del cajero vuelve a subir y tu efectivo en mano baja. '
                  'Esta acción queda registrada con tu nombre y la hora.',
                  style: TavText.caption
                      .copyWith(color: TavColors.red700, height: 1.55),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: TavSpace.lg),
        TavCard(
          child: Column(
            children: [
              TavKvRow(label: 'Cobro', value: '#${cobro.folio}'),
              TavKvRow(label: 'Cajero', value: nombreCajero),
              TavKvRow(label: 'Monto', value: formatCents(cobro.montoUsdCents)),
              TavKvRow(label: 'Método', value: cobro.metodo.label),
            ],
          ),
        ),
        const SizedBox(height: TavSpace.lg),
        Text('Motivo de la anulación',
            style: TavText.overline.copyWith(color: TavColors.ink3)),
        const SizedBox(height: TavSpace.sm),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: _motivosRapidos.map((m) {
            final selected = _motivoRapido == m;
            return GestureDetector(
              onTap: () => setState(() {
                _motivoRapido = m;
                if (m != 'Otro') _motivoCtrl.text = '';
              }),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: selected ? TavColors.red50 : TavColors.surface,
                  border: Border.all(
                    color: selected ? TavColors.red700 : TavColors.line,
                  ),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  m,
                  style: TavText.caption.copyWith(
                    color: selected ? TavColors.red700 : TavColors.ink2,
                    fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                  ),
                ),
              ),
            );
          }).toList(),
        ),
        const SizedBox(height: TavSpace.md),
        TavField(
          label: _motivoRapido == 'Otro' ? 'Explicación' : 'Detalle (opcional)',
          placeholder: 'Explica qué pasó. El administrador lo va a leer.',
          controller: _motivoCtrl,
          keyboardType: TextInputType.multiline,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 6),
        Text(
          _motivoFinal.length >= 10
              ? 'Motivo listo'
              : 'El motivo debe tener al menos 10 caracteres',
          style: TavText.caption.copyWith(
            color: _motivoFinal.length >= 10
                ? TavColors.green600
                : TavColors.red700,
          ),
        ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(
              TavSpace.xl, 0, TavSpace.xl, TavSpace.xl),
          child: TavButton(
            label: 'Anular cobro',
            variant: TavButtonVariant.text,
            icon: const Icon(Icons.delete_outline,
                color: TavColors.red700, size: 20),
            loading: _anulando,
            onPressed: _puedeAnular ? () => _anular(cobro) : null,
          ),
        ),
      ],
    );
  }

  @override
  void dispose() {
    _motivoCtrl.dispose();
    super.dispose();
  }

  void _anular(CobroDto cobro) async {
    if (!_puedeAnular) return;
    setState(() => _anulando = true);
    try {
      final api = ref.read(cobradorApiProvider);
      await api.anularCobro(cobro.id, _motivoFinal);
      await ref.read(cierreActualProvider.notifier).cargar();
      await ref.read(cajerosCobradorProvider.notifier).cargar();
      if (mounted) {
        setState(() => _anulando = false);
        _toast('Cobro anulado');
        context.go('/cobrador/cuadre');
      }
    } on DioException catch (e) {
      _toast(e.message ?? 'No pudimos anular el cobro.');
      if (mounted) setState(() => _anulando = false);
    } catch (_) {
      _toast('No pudimos anular el cobro.');
      if (mounted) setState(() => _anulando = false);
    }
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: TavColors.navy,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}
