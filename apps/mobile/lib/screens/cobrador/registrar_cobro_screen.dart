import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_button.dart';
import '../../components/tav_card.dart';
import '../../components/tav_chip.dart';
import '../../components/tav_field.dart';
import '../../components/tav_kv_row.dart';
import '../../components/tav_money_display.dart';
import '../../data/cajero_api.dart' as cajero;
import '../../data/cobrador_api.dart';
import '../../state/cobrador_state.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_radius.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';
import '../../utils/cobrador_labels.dart';
import '../../utils/labels.dart';
import '../../utils/uuid_gen.dart';

/// Flujo de registro de un cobro: monto/método, confirmación y recibo.
///
/// [cajeroId] llega por parámetro de ruta. El clientUuid se genera en el
/// dispositivo para idempotencia. No hay cola offline: todo va directo a la API.
class RegistrarCobroScreen extends ConsumerStatefulWidget {
  const RegistrarCobroScreen({super.key, required this.cajeroId});

  final String cajeroId;

  @override
  ConsumerState<RegistrarCobroScreen> createState() =>
      _RegistrarCobroScreenState();
}

class _RegistrarCobroScreenState extends ConsumerState<RegistrarCobroScreen> {
  int _paso = 0;
  bool _loading = true;
  bool _guardando = false;
  String? _error;

  int _montoCents = 0;
  MetodoCobro _metodo = MetodoCobro.efectivoUsd;
  String _quick = 'other';

  CajeroCobradorDto? _cajero;
  List<cajero.TasaDto> _tasas = [];
  CobroDto? _cobroCreado;

  final _notaCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _cargar());
  }

  Future<void> _cargar() async {
    setState(() => _loading = true);
    try {
      final api = ref.read(cobradorApiProvider);
      final cajeroApi = ref.read(cajero.cajeroApiProvider);
      final results = await Future.wait([
        api.cajeros(),
        cajeroApi.tasasVigentes(),
      ]);
      _tasas = results[1] as List<cajero.TasaDto>;
      final cajeros = results[0] as List<CajeroCobradorDto>;
      _cajero = cajeros.where((c) => c.id == widget.cajeroId).firstOrNull;
      _error = _cajero == null ? 'No encontramos este cajero.' : null;
    } on DioException catch (e) {
      _error = e.message ?? 'No pudimos cargar los datos.';
    } catch (_) {
      _error = 'No pudimos cargar los datos.';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  double? get _tasaUsdBs {
    final t = _tasas.where((t) => t.par == 'USD_BS').firstOrNull;
    if (t == null) return null;
    return double.tryParse(t.valor);
  }

  int get _montoUsdCents {
    if (_cajero == null || _montoCents == 0) return 0;
    if (_metodo == MetodoCobro.efectivoUsd || _metodo == MetodoCobro.usdt) {
      return _montoCents;
    }
    final t = _tasaUsdBs;
    if (t == null || t <= 0) return 0;
    return (_montoCents / t).round();
  }

  int get _deudaDespues =>
      _cajero == null ? 0 : max(0, _cajero!.saldoCents - _montoUsdCents);

  bool get _puedeContinuar =>
      _montoCents > 0 &&
      (_metodo == MetodoCobro.efectivoUsd ||
          _metodo == MetodoCobro.usdt ||
          _tasaUsdBs != null);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: TavColors.bg,
      body: SafeArea(
        child: _loading
            ? const Center(
                child: CircularProgressIndicator(color: TavColors.blue))
            : _error != null
                ? _buildError()
                : _buildPaso(),
      ),
    );
  }

  Widget _buildError() => Center(
        child: Padding(
          padding: const EdgeInsets.all(TavSpace.xxl),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(_error!, style: TavText.body2.copyWith(color: TavColors.ink3)),
              const SizedBox(height: TavSpace.lg),
              TavButton(
                label: 'Reintentar',
                variant: TavButtonVariant.outline,
                small: true,
                onPressed: _cargar,
              ),
            ],
          ),
        ),
      );

  Widget _buildPaso() {
    return switch (_paso) {
      0 => _buildPasoMonto(),
      1 => _buildPasoConfirmar(),
      _ => _buildPasoRecibo(),
    };
  }

  // Paso 0: monto y método
  Widget _buildPasoMonto() {
    final c = _cajero!;
    final chip = semaforoChipState(c.semaforo);
    final esBs = _metodo == MetodoCobro.bolivares || _metodo == MetodoCobro.pagoMovil;
    final symbol = esBs ? 'Bs' : '\$';
    final currency = _metodo == MetodoCobro.bolivares || _metodo == MetodoCobro.pagoMovil
        ? TavMoneyCurrency.bsd
        : TavMoneyCurrency.usd;

    return Column(
      children: [
        _buildTopBar('Registrar cobro'),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.symmetric(horizontal: TavSpace.xl),
            children: [
              TavCard(
                child: Row(
                  children: [
                    Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                        color: TavColors.navy,
                        borderRadius: BorderRadius.circular(11),
                      ),
                      child: Center(
                        child: Text(
                          inicialesNombre(c.nombre),
                          style: TavText.label.copyWith(
                              color: TavColors.surface, fontSize: 12),
                        ),
                      ),
                    ),
                    const SizedBox(width: TavSpace.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(c.nombre,
                              style: TavText.body
                                  .copyWith(fontWeight: FontWeight.w600)),
                          Text(
                            'Debe ${formatCents(c.saldoCents)}',
                            style: TavText.caption
                                .copyWith(color: TavColors.ink3),
                          ),
                        ],
                      ),
                    ),
                    TavChip(label: '● ${c.motivo}', state: chip),
                  ],
                ),
              ),
              const SizedBox(height: 11),
              TavCard(
                child: Center(
                  child: Column(
                    children: [
                      Text('Monto recibido',
                          style:
                              TavText.caption.copyWith(color: TavColors.ink3)),
                      const SizedBox(height: 4),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.baseline,
                        textBaseline: TextBaseline.alphabetic,
                        children: [
                          Text(symbol,
                              style: TavText.moneyDisplay.copyWith(
                                  fontSize: 24, color: TavColors.blue)),
                          const SizedBox(width: 4),
                          TavMoneyDisplay(
                            cents: _montoCents,
                            currency: currency,
                            style: TavText.moneyDisplay
                                .copyWith(fontSize: 34, color: TavColors.blue),
                          ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        _textoDeuda(),
                        style: TavText.caption
                            .copyWith(color: _colorDeuda(), height: 1.4),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _QuickButton(
                      label: 'Toda la deuda',
                      selected: _quick == 'all',
                      onTap: () => _aplicarQuick('all'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _QuickButton(
                      label: 'Mitad',
                      selected: _quick == 'half',
                      onTap: () => _aplicarQuick('half'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _QuickButton(
                      label: 'Otro monto',
                      selected: _quick == 'other',
                      onTap: () => _aplicarQuick('other'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Text('¿Cómo lo recibiste?',
                  style: TavText.overline.copyWith(color: TavColors.ink3)),
              const SizedBox(height: 9),
              _MethodSelector(
                metodo: _metodo,
                onChanged: (m) => setState(() {
                  _metodo = m;
                  _quick = 'other';
                  _montoCents = 0;
                }),
              ),
              const SizedBox(height: 9),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: TavSpace.sm),
                child: Text(_hintMetodo(),
                    style: TavText.caption
                        .copyWith(color: TavColors.ink3, height: 1.5)),
              ),
            ],
          ),
        ),
        _buildKeypad(),
        Padding(
          padding: const EdgeInsets.fromLTRB(
              TavSpace.xl, 0, TavSpace.xl, TavSpace.xl),
          child: TavButton(
            label: 'Continuar',
            onPressed: _puedeContinuar ? () => setState(() => _paso = 1) : null,
          ),
        ),
      ],
    );
  }

  String _hintMetodo() => switch (_metodo) {
        MetodoCobro.efectivoUsd =>
            'El efectivo suma a lo que debes entregar al cierre del día.',
        MetodoCobro.bolivares =>
            'Transferencia en bolívares. No suma a tu efectivo, se verifica en cuenta.',
        MetodoCobro.pagoMovil =>
            'Pago móvil en bolívares. No suma a tu efectivo, se verifica en cuenta.',
        MetodoCobro.usdt =>
            'Transferencia en USDT. No suma a tu efectivo, se verifica en wallet.',
      };

  String _textoDeuda() {
    if (_cajero == null || _montoCents == 0) return 'Selecciona un monto';
    final saldo = _cajero!.saldoCents;
    final usd = _montoUsdCents;
    final esBs = _metodo == MetodoCobro.bolivares || _metodo == MetodoCobro.pagoMovil;
    final equiv = esBs ? '\nEquivale a ${formatCents(usd)}' : '';
    if (usd > saldo) {
      return 'Excede la deuda en ${formatCents(usd - saldo)}$equiv';
    }
    if (usd == saldo) {
      return 'Salda la deuda completa ✓$equiv';
    }
    return 'Le quedarían ${formatCents(saldo - usd)}$equiv';
  }

  Color _colorDeuda() {
    if (_montoCents == 0) return TavColors.ink3;
    if (_montoUsdCents > _cajero!.saldoCents) return TavColors.red;
    if (_montoUsdCents == _cajero!.saldoCents) return TavColors.green600;
    return TavColors.ink3;
  }

  Widget _buildKeypad() {
    return Container(
      padding: const EdgeInsets.only(
          top: TavSpace.sm, left: TavSpace.lg, right: TavSpace.lg, bottom: 18),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildKeypadRow([1, 2, 3]),
          const SizedBox(height: 6),
          _buildKeypadRow([4, 5, 6]),
          const SizedBox(height: 6),
          _buildKeypadRow([7, 8, 9]),
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _KeypadButton(label: '00', onTap: _duplicarCeros),
              _KeypadButton(label: '0', onTap: () => _digito(0)),
              _KeypadButton(
                label: '',
                onTap: _borrar,
                child: const Icon(Icons.backspace_outlined,
                    color: TavColors.ink3, size: 22),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildKeypadRow(List<int> digits) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: digits
          .map((d) => _KeypadButton(label: '$d', onTap: () => _digito(d)))
          .toList(),
    );
  }

  void _digito(int d) {
    if (_montoCents.toString().length >= 9) return;
    setState(() {
      _quick = 'other';
      _montoCents = _montoCents * 10 + d;
    });
  }

  void _duplicarCeros() {
    if (_montoCents.toString().length >= 8) return;
    setState(() {
      _quick = 'other';
      _montoCents = _montoCents * 100;
    });
  }

  void _borrar() => setState(() => _montoCents = _montoCents ~/ 10);

  void _aplicarQuick(String tipo) {
    if (_cajero == null) return;
    final saldo = _cajero!.saldoCents;
    final esBs = _metodo == MetodoCobro.bolivares || _metodo == MetodoCobro.pagoMovil;
    final t = _tasaUsdBs;
    setState(() {
      _quick = tipo;
      switch (tipo) {
        case 'all':
          _montoCents = esBs
              ? (t == null ? 0 : (saldo * t).round())
              : saldo;
        case 'half':
          _montoCents = esBs
              ? (t == null ? 0 : (saldo * t / 2).round())
              : saldo ~/ 2;
        default:
          _montoCents = 0;
      }
    });
  }

  // Paso 1: confirmación
  Widget _buildPasoConfirmar() {
    final c = _cajero!;
    final montoUsd = _montoUsdCents;
    final deudaDespues = _deudaDespues;
    final cierre = _cierreActual();
    final efectivoPasaA = _metodo.esEfectivo
        ? (cierre?.efectivoCents ?? 0) + montoUsd
        : (cierre?.efectivoCents ?? 0);

    return Column(
      children: [
        _buildTopBar('Revisa antes de cargar'),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.symmetric(horizontal: TavSpace.xl),
            children: [
              // Monto principal en navy
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(22),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    begin: Alignment(0.0, -1.0),
                    end: Alignment(0.9, 1.0),
                    colors: [TavColors.navy, Color(0xFF1B4272)],
                  ),
                  borderRadius: BorderRadius.circular(TavRadius.card),
                ),
                child: Center(
                  child: Column(
                    children: [
                      Text('Vas a registrar',
                          style: TavText.caption
                              .copyWith(color: const Color(0xFF9EC0EC))),
                      const SizedBox(height: 5),
                      TavMoneyDisplay(
                        cents: montoUsd,
                        style: TavText.moneyDisplay
                            .copyWith(fontSize: 32, color: TavColors.surface),
                        color: TavColors.surface,
                      ),
                      const SizedBox(height: 3),
                      Text('${_metodo.label} · de ${c.nombre}',
                          style: TavText.caption
                              .copyWith(color: const Color(0xFF9EC0EC))),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              TavCard(
                child: Column(
                  children: [
                    TavKvRow(label: 'Cajero', value: c.nombre),
                    TavKvRow(label: 'Deuda antes', value: formatCents(c.saldoCents)),
                    TavKvRow(
                      label: 'Deuda después',
                      value: formatCents(deudaDespues),
                      valueColor: TavColors.green600,
                      divider: true,
                    ),
                    TavKvRow(
                      label: 'Tu efectivo en mano pasa a',
                      value: formatCents(efectivoPasaA),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(TavSpace.lg),
                decoration: BoxDecoration(
                  color: TavColors.gold50,
                  border: Border.all(color: const Color(0xFFF0DFBB)),
                  borderRadius: BorderRadius.circular(TavRadius.card),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.warning_amber_rounded,
                        color: TavColors.gold700, size: 20),
                    const SizedBox(width: 11),
                    Expanded(
                      child: Text(
                        'Al confirmar, el cobro queda cargado al sistema de inmediato '
                        'y entra en tu lista del día. El cajero no lo aprueba. '
                        'Si te equivocas tendrás que anularlo indicando el motivo, '
                        'y la anulación queda visible para el administrador.',
                        style: TavText.caption
                            .copyWith(color: const Color(0xFF7E570D), height: 1.55),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: TavSpace.lg),
              TavField(
                label: 'Nota (opcional)',
                placeholder: 'Ej. abona el resto el viernes',
                controller: _notaCtrl,
                keyboardType: TextInputType.multiline,
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(
              TavSpace.xl, 0, TavSpace.xl, TavSpace.xl),
          child: TavButton(
            label: 'Confirmar cobro',
            variant: TavButtonVariant.green,
            loading: _guardando,
            onPressed: _guardando ? null : _confirmar,
          ),
        ),
      ],
    );
  }

  CierreDto? _cierreActual() {
    final state = ref.read(cierreActualProvider);
    if (state is CobradorDataLoaded<CierreDto>) return state.data;
    return null;
  }

  Future<void> _confirmar() async {
    if (_cajero == null || _montoCents == 0) return;
    final esBs = _metodo == MetodoCobro.bolivares || _metodo == MetodoCobro.pagoMovil;
    final t = _tasaUsdBs;
    if (esBs && (t == null || t <= 0)) {
      _toast('No hay tasa vigente para bolívares.');
      return;
    }
    setState(() => _guardando = true);
    try {
      final api = ref.read(cobradorApiProvider);
      final req = RegistrarCobroRequest(
        clientUuid: generarClientUuid(),
        cajeroId: _cajero!.id,
        metodo: _metodo.valor,
        montoCents: _montoCents.toString(),
        moneda: _metodo.moneda,
        tasaAplicada: esBs ? t!.toStringAsFixed(6) : null,
        nota: _notaCtrl.text.isEmpty ? null : _notaCtrl.text,
      );
      final result = await api.registrarCobro(req);
      _cobroCreado = result.cobro;
      await ref.read(cierreActualProvider.notifier).cargar();
      await ref.read(cajerosCobradorProvider.notifier).cargar();
      setState(() {
        _guardando = false;
        _paso = 2;
      });
    } on DioException catch (e) {
      _toast(e.message ?? 'No pudimos registrar el cobro.');
      if (mounted) setState(() => _guardando = false);
    } catch (_) {
      _toast('No pudimos registrar el cobro.');
      if (mounted) setState(() => _guardando = false);
    }
  }

  // Paso 2: recibo
  Widget _buildPasoRecibo() {
    final c = _cajero!;
    final cobro = _cobroCreado!;
    final cierre = _cierreActual();
    final efectivo = cierre?.efectivoCents ?? 0;
    final deudaCajero = c.saldoCents - cobro.montoUsdCents;

    return Column(
      children: [
        const SizedBox(height: TavSpace.xxl),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.symmetric(horizontal: TavSpace.xl),
            children: [
              Center(
                child: Container(
                  width: 86,
                  height: 86,
                  decoration: const BoxDecoration(
                    color: TavColors.green50,
                    shape: BoxShape.circle,
                  ),
                  child: Center(
                    child: Container(
                      width: 60,
                      height: 60,
                      decoration: const BoxDecoration(
                        color: TavColors.green,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.check,
                          color: TavColors.surface, size: 30),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Center(
                child: Text('Cobro registrado',
                    style: TavText.h1.copyWith(fontSize: 22)),
              ),
              const SizedBox(height: 6),
              Center(
                child: Text(
                  'Ya está cargado en el sistema. El administrador lo verá en tu lista del día.',
                  style: TavText.body2
                      .copyWith(color: TavColors.ink3, height: 1.6),
                  textAlign: TextAlign.center,
                ),
              ),
              const SizedBox(height: 18),
              TavCard(
                child: Column(
                  children: [
                    TavKvRow(label: 'N° de registro', value: '#${cobro.folio}'),
                    TavKvRow(label: 'Cajero', value: c.nombre),
                    TavKvRow(label: 'Monto', value: formatCents(cobro.montoUsdCents)),
                    TavKvRow(label: 'Método', value: cobro.metodo.label),
                    TavKvRow(label: 'Hora', value: horaAmPm(cobro.creadoAt)),
                    TavKvRow(label: 'Deuda del cajero', value: formatCents(max(0, deudaCajero))),
                    TavKvRow(
                      label: 'Efectivo en mano',
                      value: formatCents(efectivo),
                      valueColor: TavColors.blue,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(TavSpace.md),
                decoration: BoxDecoration(
                  color: TavColors.green50,
                  border: Border.all(color: const Color(0xFFCDEBCE)),
                  borderRadius: BorderRadius.circular(TavRadius.card),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.sync,
                        color: TavColors.green600, size: 16),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text('Sincronizado con la central',
                          style: TavText.caption
                              .copyWith(color: TavColors.green600)),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(
              TavSpace.xl, 0, TavSpace.xl, TavSpace.xl),
          child: Column(
            children: [
              TavButton(
                label: 'Siguiente cajero',
                onPressed: () => context.push('/cobrador/cajeros'),
              ),
              const SizedBox(height: 4),
              TavButton(
                label: 'Volver a mi día',
                variant: TavButtonVariant.text,
                onPressed: () => context.go('/cobrador/mi-dia'),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildTopBar(String titulo) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          TavSpace.lg, TavSpace.md, TavSpace.xl, TavSpace.sm),
      child: Row(
        children: [
          GestureDetector(
            onTap: () {
              if (_paso == 2) {
                context.go('/cobrador/mi-dia');
              } else if (_paso == 1) {
                setState(() => _paso = 0);
              } else {
                context.pop();
              }
            },
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
          Expanded(child: Text(titulo, style: TavText.h2)),
        ],
      ),
    );
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

class _QuickButton extends StatelessWidget {
  const _QuickButton({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 40,
        decoration: BoxDecoration(
          color: selected ? TavColors.navy : TavColors.surface,
          border: Border.all(color: selected ? TavColors.navy : TavColors.line),
          borderRadius: BorderRadius.circular(TavRadius.field),
          boxShadow: selected
              ? [
                  const BoxShadow(
                      color: Color(0x29101828),
                      blurRadius: 8,
                      offset: Offset(0, 4))
                ]
              : null,
        ),
        child: Center(
          child: Text(label,
              style: TavText.label.copyWith(
                  fontSize: 12,
                  color: selected ? TavColors.surface : TavColors.ink)),
        ),
      ),
    );
  }
}

class _MethodSelector extends StatelessWidget {
  const _MethodSelector({required this.metodo, required this.onChanged});

  final MetodoCobro metodo;
  final ValueChanged<MetodoCobro> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: TavColors.line2,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: MetodoCobro.values.map((m) {
          final on = metodo == m;
          return Expanded(
            child: GestureDetector(
              onTap: () => onChanged(m),
              child: Container(
                height: 42,
                decoration: BoxDecoration(
                  color: on ? TavColors.surface : Colors.transparent,
                  borderRadius: BorderRadius.circular(9),
                  boxShadow: on
                      ? [
                          const BoxShadow(
                              color: Color(0x1A101828),
                              blurRadius: 4,
                              offset: Offset(0, 1))
                        ]
                      : null,
                ),
                child: Center(
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(_icono(m),
                          color: on ? TavColors.ink : TavColors.ink3, size: 16),
                      const SizedBox(width: 5),
                      Text(m.label,
                          style: TavText.label.copyWith(
                              fontSize: 11.5,
                              color: on ? TavColors.ink : TavColors.ink3)),
                    ],
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  IconData _icono(MetodoCobro m) => switch (m) {
        MetodoCobro.efectivoUsd => Icons.payments_outlined,
        MetodoCobro.bolivares => Icons.account_balance_wallet_outlined,
        MetodoCobro.pagoMovil => Icons.phone_iphone_outlined,
        MetodoCobro.usdt => Icons.currency_bitcoin,
      };
}

class _KeypadButton extends StatelessWidget {
  const _KeypadButton({
    required this.label,
    required this.onTap,
    this.child,
  });

  final String label;
  final VoidCallback onTap;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 72,
      height: 54,
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(TavRadius.field),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          highlightColor: const Color(0xFFE7EBF0),
          child: Center(
            child: child ??
                Text(label,
                    style: TavText.keypad.copyWith(color: TavColors.ink)),
          ),
        ),
      ),
    );
  }
}
