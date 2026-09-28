import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_button.dart';
import '../../components/tav_field.dart';
import '../../components/tav_load_state.dart';
import '../../components/tav_money_display.dart';
import '../../data/cajero_api.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_radius.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';

/// Abono a deuda.
///
/// ESTO ES UN AVISO, NO UN PAGO. El cajero avisa al cobrador que tiene plata
/// lista para entregar. La deuda, el cupo y el semáforo no cambian hasta que
/// el cobrador registre el cobro de verdad.
class AbonoScreen extends ConsumerStatefulWidget {
  const AbonoScreen({super.key});

  @override
  ConsumerState<AbonoScreen> createState() => _AbonoScreenState();
}

class _AbonoScreenState extends ConsumerState<AbonoScreen> {
  final _montoController = TextEditingController();
  final _notaController = TextEditingController();

  bool _enviando = false;
  String? _error;
  List<AvisoAbonoDto> _avisos = [];
  bool _cargandoLista = true;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() => _cargandoLista = true);
    try {
      final api = ref.read(cajeroApiProvider);
      final lista = await api.listarAvisosAbono();
      if (!mounted) return;
      setState(() {
        _avisos = lista;
        _cargandoLista = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _cargandoLista = false);
    }
  }

  int? _parseCents(String text) {
    final limpio = text.trim().replaceAll('.', '').replaceAll(',', '.');
    if (limpio.isEmpty) return null;
    final partes = limpio.split('.');
    if (partes.length > 2) return null;
    try {
      final enteros = int.parse(partes[0]);
      int centavos = 0;
      if (partes.length == 2) {
        final dec = partes[1].padRight(2, '0').substring(0, 2);
        centavos = int.parse(dec);
      }
      return enteros * 100 + centavos;
    } catch (_) {
      return null;
    }
  }

  Future<void> _enviar() async {
    setState(() => _error = null);
    final cents = _parseCents(_montoController.text);
    if (cents == null || cents <= 0) {
      setState(() => _error = 'Ingresa un monto mayor a cero');
      return;
    }

    setState(() => _enviando = true);
    try {
      final api = ref.read(cajeroApiProvider);
      await api.crearAvisoAbono(
        CrearAvisoAbonoRequest(
          montoCents: cents,
          nota: _notaController.text,
        ),
      );
      _montoController.clear();
      _notaController.clear();
      if (!mounted) return;
      await _cargar();
    } on Exception catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  Future<void> _cancelar(String id) async {
    try {
      final api = ref.read(cajeroApiProvider);
      await api.cancelarAvisoAbono(id);
      if (!mounted) return;
      await _cargar();
    } on Exception catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo cancelar: $e')),
      );
    }
  }

  String _estadoLabel(String estado) {
    return switch (estado) {
      'enviado' => 'Enviado',
      'atendido' => 'Atendido',
      'cancelado' => 'Cancelado',
      'caducado' => 'Caducado',
      _ => estado,
    };
  }

  Color _estadoColor(String estado) {
    return switch (estado) {
      'enviado' => TavColors.blue,
      'atendido' => TavColors.green600,
      'cancelado' => TavColors.ink3,
      'caducado' => TavColors.red,
      _ => TavColors.ink3,
    };
  }

  @override
  void dispose() {
    _montoController.dispose();
    _notaController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: TavColors.bg,
      appBar: AppBar(
        backgroundColor: TavColors.surface,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: TavColors.ink),
          onPressed: () => context.pop(),
        ),
        title: Text('Avisar abono', style: TavText.h2),
        centerTitle: false,
      ),
      body: SafeArea(
        child: RefreshIndicator(
          color: TavColors.blue,
          onRefresh: _cargar,
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(
              TavSpace.xl,
              TavSpace.lg,
              TavSpace.xl,
              TavSpace.xl,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(TavSpace.lg),
                  decoration: BoxDecoration(
                    color: TavColors.blue50,
                    borderRadius: BorderRadius.circular(TavRadius.field),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.info_outline, color: TavColors.blue, size: 20),
                          const SizedBox(width: TavSpace.sm),
                          Text('Esto es un aviso', style: TavText.h2.copyWith(color: TavColors.blue)),
                        ],
                      ),
                      const SizedBox(height: TavSpace.sm),
                      Text(
                        'Le avisas al cobrador que tienes plata lista para entregar. '
                        'Tu deuda no baja y tu cupo no se libera hasta que el cobrador '
                        'registre el cobro de verdad.',
                        style: TavText.body2.copyWith(color: TavColors.ink2, height: 1.5),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: TavSpace.xl),
                TavField(
                  label: 'Monto que piensas abonar (G\$)',
                  controller: _montoController,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  placeholder: '0,00',
                  hint: 'Ej: 50.000,00',
                  enabled: !_enviando,
                ),
                const SizedBox(height: TavSpace.lg),
                TavField(
                  label: 'Nota (opcional)',
                  controller: _notaController,
                  placeholder: 'Dónde te puede encontrar el cobrador',
                  enabled: !_enviando,
                ),
                if (_error != null) ...[
                  const SizedBox(height: TavSpace.md),
                  Text(
                    _error!,
                    style: TavText.caption.copyWith(color: TavColors.red),
                  ),
                ],
                const SizedBox(height: TavSpace.lg),
                TavButton(
                  label: 'Enviar aviso',
                  variant: TavButtonVariant.primary,
                  loading: _enviando,
                  onPressed: _enviando ? null : _enviar,
                ),
                const SizedBox(height: TavSpace.xxl),
                Text('Tus avisos', style: TavText.overline.copyWith(color: TavColors.ink3)),
                const SizedBox(height: TavSpace.sm),
                TavLoadState(
                  isLoading: _cargandoLista,
                  error: null,
                  emptyCheck: () => _avisos.isEmpty,
                  emptyMessage: 'No tienes avisos enviados.',
                  child: Column(
                          children: _avisos.map((a) {
                            return Container(
                              margin: const EdgeInsets.only(bottom: TavSpace.md),
                              padding: const EdgeInsets.all(TavSpace.lg),
                              decoration: BoxDecoration(
                                color: TavColors.surface,
                                borderRadius: BorderRadius.circular(TavRadius.field),
                                border: Border.all(color: TavColors.line),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      TavMoneyDisplay(
                                        cents: a.montoCents,
                                        currency: TavMoneyCurrency.gyd,
                                        style: TavText.h2.copyWith(fontSize: 18),
                                      ),
                                      const Spacer(),
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 10,
                                          vertical: 4,
                                        ),
                                        decoration: BoxDecoration(
                                          color: _estadoColor(a.estado).withValues(alpha: 0.1),
                                          borderRadius: BorderRadius.circular(TavRadius.sheet),
                                        ),
                                        child: Text(
                                          _estadoLabel(a.estado),
                                          style: TavText.caption.copyWith(
                                            color: _estadoColor(a.estado),
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                  if (a.nota != null && a.nota!.isNotEmpty) ...[
                                    const SizedBox(height: TavSpace.sm),
                                    Text(
                                      a.nota!,
                                      style: TavText.body2.copyWith(color: TavColors.ink2),
                                    ),
                                  ],
                                  const SizedBox(height: TavSpace.sm),
                                  Text(
                                    'Enviado el ${_fechaCorta(a.creadoAt)}',
                                    style: TavText.caption.copyWith(color: TavColors.ink3),
                                  ),
                                  if (a.estado == 'enviado') ...[
                                    const SizedBox(height: TavSpace.md),
                                    Align(
                                      alignment: Alignment.centerRight,
                                      child: TavButton(
                                        label: 'Cancelar',
                                        variant: TavButtonVariant.text,
                                        small: true,
                                        onPressed: () => _cancelar(a.id),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            );
                          }).toList(),
                        ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _fechaCorta(DateTime d) {
    return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
  }
}
