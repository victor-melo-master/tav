import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_button.dart';
import '../../components/tav_card.dart';
import '../../components/tav_chip.dart';
import '../../components/tav_field.dart';
import '../../components/tav_keypad.dart';
import '../../components/tav_money_display.dart';
import '../../components/tav_progress_bar.dart';
import '../../data/cajero_api.dart';
import '../../state/cajero_state.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_radius.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';
import '../../utils/labels.dart';

/// Flujo de nueva operación: tipo → monto → beneficiario → resumen → pago → confirmación.
///
/// Al recibir un 409 por falta de cupo, muestra el mensaje real del servidor
/// con cuánto falta y ofrece solicitar ampliación.
class NuevaOperacionScreen extends ConsumerStatefulWidget {
  const NuevaOperacionScreen({super.key});

  @override
  ConsumerState<NuevaOperacionScreen> createState() =>
      _NuevaOperacionScreenState();
}

class _NuevaOperacionScreenState extends ConsumerState<NuevaOperacionScreen> {
  int _step = 0; // 0: tipo, 1: monto, 2: beneficiario, 3: resumen, 4: pago
  String _tipo = 'usdt_bs';
  String _montoStr = ''; // en centavos como string
  String _tasaValor = '';
  String _tasaPar = 'USDT_BS';
  final _benefNombreController = TextEditingController();
  final _benefDocController = TextEditingController();
  final _benefBancoController = TextEditingController();
  final _benefCuentaController = TextEditingController();
  String _benefMetodo = 'transferencia';
  bool _loading = false;
  String? _errorCupo;
  CupoInsuficienteException? _cupoEx;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _cargarTasa();
      ref.read(resumenProvider.notifier).cargar();
    });
  }

  void _cargarTasa() {
    final tasasState = ref.read(tasasProvider);
    if (tasasState is CajeroDataLoaded<List<TasaDto>>) {
      _setTasaFromList(tasasState.data);
    } else {
      ref.read(tasasProvider.notifier).cargar();
    }
  }

  void _setTasaFromList(List<TasaDto> tasas) {
    final par = _tipo == 'usdt_bs' ? 'USDT_BS' : 'USD_BS';
    for (final t in tasas) {
      if (t.par == par) {
        setState(() {
          _tasaValor = t.valor;
          _tasaPar = par;
        });
        return;
      }
    }
  }

  int get _montoCents => int.tryParse(_montoStr) ?? 0;
  double get _tasa => double.tryParse(_tasaValor) ?? 0;
  int get _comisionCents => (_montoCents * 0.03).round();
  int get _totalCents => _montoCents + _comisionCents;
  int get _montoDestinoCents => (_montoCents * _tasa).round();

  @override
  void dispose() {
    _benefNombreController.dispose();
    _benefDocController.dispose();
    _benefBancoController.dispose();
    _benefCuentaController.dispose();
    super.dispose();
  }

  void _onDigit(int d) {
    setState(() {
      _montoStr = '$_montoStr$d';
      _errorCupo = null;
      _cupoEx = null;
    });
  }

  void _onDelete() {
    setState(() {
      if (_montoStr.isNotEmpty) {
        _montoStr = _montoStr.substring(0, _montoStr.length - 1);
      }
      _errorCupo = null;
      _cupoEx = null;
    });
  }

  void _selectTipo(String tipo) {
    setState(() {
      _tipo = tipo;
      _step = 1;
    });
    _cargarTasa();
  }

  void _continuarABenef() {
    setState(() => _step = 2);
  }

  void _continuarAResumen() {
    setState(() => _step = 3);
  }

  Future<void> _confirmarOperacion() async {
    setState(() {
      _loading = true;
      _errorCupo = null;
      _cupoEx = null;
    });

    final api = ref.read(cajeroApiProvider);
    final uuid = DateTime.now().microsecondsSinceEpoch.toString();

    try {
      final op = await api.crearOperacion(
        CrearOperacionRequest(
          clientUuid: uuid,
          tipo: _tipo,
          montoOrigenCents: _montoCents.toString(),
          monedaOrigen: _tipo == 'usdt_bs' ? 'USDT' : 'USD',
          tasaAplicada: _tasaValor,
          comisionCents: _comisionCents.toString(),
          totalCents: _totalCents.toString(),
          montoDestinoCents: _montoDestinoCents.toString(),
          monedaDestino: 'BS',
          beneficiario: BeneficiarioOperacionDto(
            nombre: _benefNombreController.text.trim(),
            documento: _benefDocController.text.trim(),
            banco: _benefBancoController.text.trim(),
            cuenta: _benefCuentaController.text.trim(),
            metodo: _benefMetodo,
          ),
        ),
      );

      setState(() {
        _loading = false;
      });
      // Navegar a la pantalla de éxito
      if (mounted) {
        context.go('/cajero/operacion/${op.id}');
      }
    } on CupoInsuficienteException catch (e) {
      setState(() {
        _cupoEx = e;
        _errorCupo = e.mensaje;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _errorCupo = 'No pudimos registrar la operación. Intenta de nuevo.';
        _loading = false;
      });
    }
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
          onPressed: () {
            if (_step > 0) {
              setState(() => _step--);
            } else {
              context.pop();
            }
          },
        ),
        title: Text(
          _tituloPaso(),
          style: TavText.h2,
        ),
        centerTitle: false,
      ),
      body: SafeArea(
        child: Column(
          children: [
            TavSteps(current: _step + 1, total: 5),
            Expanded(child: _buildPaso()),
          ],
        ),
      ),
    );
  }

  String _tituloPaso() {
    return switch (_step) {
      0 => 'Nueva operación',
      1 => '¿Cuánto vas a enviar?',
      2 => '¿Quién recibe?',
      3 => 'Revisa la operación',
      4 => 'Realiza tu pago',
      _ => '',
    };
  }

  Widget _buildPaso() {
    return switch (_step) {
      0 => _pasoTipo(),
      1 => _pasoMonto(),
      2 => _pasoBeneficiario(),
      3 => _pasoResumen(),
      4 => _pasoPago(),
      _ => const SizedBox.shrink(),
    };
  }

  // ── Paso 0: Tipo de operación ──
  Widget _pasoTipo() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(TavSpace.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '¿Qué tipo de operación quieres registrar?',
            style: TavText.body2.copyWith(color: TavColors.ink3),
          ),
          const SizedBox(height: 18),
          _TipoCard(
            titulo: 'USDT → Bolívares',
            descripcion:
                'Envías USDT (Binance / TRC20) y tu beneficiario recibe bolívares por transferencia o pago móvil.',
            tasaLabel: _tasaValor.isNotEmpty
                ? 'Tasa hoy · ${_formatTasa(_tasaValor)} Bs · entrega en 15–45 min'
                : 'Cargando tasa...',
            icon: Icons.currency_bitcoin,
            iconBg: TavColors.blue50,
            iconColor: TavColors.blue,
            chip: const TavChip(label: 'Más usada', state: TavChipState.azul),
            seleccionado: _tipo == 'usdt_bs',
            onTap: () => _selectTipo('usdt_bs'),
          ),
          const SizedBox(height: TavSpace.md),
          _TipoCard(
            titulo: 'USD efectivo → Bolívares',
            descripcion:
                'Entregas efectivo a nuestro recolector en tu ciudad y acreditamos bolívares al beneficiario.',
            tasaLabel: 'Coordinamos punto y hora',
            icon: Icons.payments_outlined,
            iconBg: TavColors.green50,
            iconColor: TavColors.green600,
            seleccionado: _tipo == 'usd_efectivo_bs',
            onTap: () => _selectTipo('usd_efectivo_bs'),
          ),
        ],
      ),
    );
  }

  // ── Paso 1: Monto ──
  Widget _pasoMonto() {
    final montoDisplay = _montoCents > 0
        ? TavMoneyDisplay(
            cents: _montoCents,
            currency: _tipo == 'usdt_bs' ? TavMoneyCurrency.usdt : TavMoneyCurrency.usd,
            style: TavText.moneyDisplay.copyWith(fontSize: 38),
          )
        : Text(
            '0',
            style: TavText.moneyDisplay.copyWith(fontSize: 38, color: TavColors.ink3),
          );

    final monedaLabel = _tipo == 'usdt_bs' ? 'USDT' : 'USD';

    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: TavSpace.xl),
            child: Column(
              children: [
                TavCard(
                  child: Center(
                    child: Column(
                      children: [
                        Text('Envías', style: TavText.caption.copyWith(color: TavColors.ink3)),
                        const SizedBox(height: 4),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.baseline,
                          children: [
                            montoDisplay,
                            const SizedBox(width: 7),
                            Text(monedaLabel, style: TavText.h2.copyWith(color: TavColors.ink3)),
                          ],
                        ),
                        const Divider(height: 28),
                        Text('Tu beneficiario recibe',
                            style: TavText.caption.copyWith(color: TavColors.ink3)),
                        const SizedBox(height: 3),
                        Text(
                          'Bs ${_formatBs(_montoDestinoCents)}',
                          style: TavText.h2.copyWith(
                            fontSize: 22,
                            color: TavColors.green600,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 11),
                TavCard(
                  child: Column(
                    children: [
                      _kvRow('Tasa aplicada', '${_formatTasa(_tasaValor)} Bs / $_tasaParLabel'),
                      _kvRow('Comisión TAV (3%)', formatCents(_comisionCents, currency: _tipo == 'usdt_bs' ? TavMoneyCurrency.usdt : TavMoneyCurrency.usd)),
                      const Divider(height: 16),
                      _kvRow('Total a pagar', formatCents(_totalCents, currency: _tipo == 'usdt_bs' ? TavMoneyCurrency.usdt : TavMoneyCurrency.usd),
                          bold: true, valueColor: TavColors.blue),
                      const Divider(height: 16),
                      _kvRowDisponible(),
                    ],
                  ),
                ),
                if (_cupoEx != null) ...[
                  const SizedBox(height: 11),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(TavSpace.lg),
                    decoration: BoxDecoration(
                      color: TavColors.red50,
                      border: Border.all(color: const Color(0xFFF3C9C6)),
                      borderRadius: BorderRadius.circular(TavRadius.card),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.lock_outline, color: TavColors.red700, size: 20),
                        const SizedBox(width: 11),
                        Expanded(
                          child: Text(
                            'Esta operación supera tu crédito disponible por '
                            '${formatCents(_cupoEx!.faltanteCents)}. '
                            'Abona para liberar cupo o pide una ampliación al administrador.',
                            style: TavText.body2.copyWith(
                              color: TavColors.red700,
                              fontSize: 12.5,
                              height: 1.55,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 10),
                  TavButton(
                    label: 'Solicitar ampliación',
                    variant: TavButtonVariant.outline,
                    onPressed: () => context.push('/cajero/ampliacion'),
                  ),
                ],
                const SizedBox(height: 10),
                Text(
                  'La tasa se congela por 15 minutos al confirmar.',
                  style: TavText.caption.copyWith(color: TavColors.ink3),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),
        TavKeypad(
          onDigit: _onDigit,
          onDelete: _onDelete,
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(TavSpace.xl, 0, TavSpace.xl, TavSpace.xl),
          child: TavButton(
            label: 'Continuar',
            onPressed: _montoCents > 0 ? _continuarABenef : null,
          ),
        ),
      ],
    );
  }

  // ── Paso 2: Beneficiario ──
  Widget _pasoBeneficiario() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(TavSpace.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TavField(
            label: 'Nombre y apellido',
            controller: _benefNombreController,
            placeholder: 'Ej. Carmen Silva',
          ),
          const SizedBox(height: TavSpace.lg),
          TavField(
            label: 'Cédula',
            controller: _benefDocController,
            placeholder: 'V-00.000.000',
          ),
          const SizedBox(height: TavSpace.lg),
          TavField(
            label: 'Banco',
            controller: _benefBancoController,
            placeholder: 'Banesco',
          ),
          const SizedBox(height: TavSpace.lg),
          TavField(
            label: 'Número de cuenta / Pago móvil',
            controller: _benefCuentaController,
            placeholder: '0134 0000 0000 0000 0000',
            keyboardType: TextInputType.number,
          ),
          const SizedBox(height: TavSpace.lg),
          Text('Método de entrega', style: TavText.label.copyWith(color: TavColors.ink2)),
          const SizedBox(height: 6),
          _MetodoSegmented(
            value: _benefMetodo,
            onChanged: (v) => setState(() => _benefMetodo = v),
          ),
          const SizedBox(height: TavSpace.lg),
          Text(
            'Verifica bien los datos. Las transferencias enviadas a una cuenta equivocada no se pueden revertir.',
            style: TavText.caption.copyWith(color: TavColors.ink3, height: 1.5),
          ),
          const SizedBox(height: TavSpace.xxl),
          TavButton(
            label: 'Guardar y continuar',
            onPressed: _beneficiarioValido() ? _continuarAResumen : null,
          ),
        ],
      ),
    );
  }

  bool _beneficiarioValido() {
    return _benefNombreController.text.trim().isNotEmpty &&
        _benefDocController.text.trim().isNotEmpty &&
        _benefBancoController.text.trim().isNotEmpty &&
        _benefCuentaController.text.trim().isNotEmpty;
  }

  // ── Paso 3: Resumen ──
  Widget _pasoResumen() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(TavSpace.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(TavSpace.lg),
            decoration: BoxDecoration(
              color: TavColors.navy,
              borderRadius: BorderRadius.circular(TavRadius.card),
            ),
            child: Center(
              child: Column(
                children: [
                  Text('Tu beneficiario recibe',
                      style: TavText.caption.copyWith(color: const Color(0xFF9EC0EC))),
                  const SizedBox(height: 5),
                  Text(
                    'Bs ${_formatBs(_montoDestinoCents)}',
                    style: TavText.moneyDisplay.copyWith(fontSize: 30, color: TavColors.surface),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    'Enviando ${formatCents(_montoCents, currency: _tipo == 'usdt_bs' ? TavMoneyCurrency.usdt : TavMoneyCurrency.usd)}',
                    style: TavText.caption.copyWith(color: const Color(0xFF9EC0EC)),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: TavSpace.lg),
          Text('Detalle', style: TavText.overline.copyWith(color: TavColors.ink3)),
          const SizedBox(height: TavSpace.sm),
          TavCard(
            child: Column(
              children: [
                _kvRow('Tipo', tipoOperacionLabel(_tipo)),
                _kvRow('Tasa aplicada', '${_formatTasa(_tasaValor)} Bs'),
                _kvRow('Comisión TAV (3%)',
                    formatCents(_comisionCents, currency: _tipo == 'usdt_bs' ? TavMoneyCurrency.usdt : TavMoneyCurrency.usd)),
                const Divider(height: 16),
                _kvRow('Total a pagar',
                    formatCents(_totalCents, currency: _tipo == 'usdt_bs' ? TavMoneyCurrency.usdt : TavMoneyCurrency.usd),
                    bold: true, valueColor: TavColors.blue),
              ],
            ),
          ),
          const SizedBox(height: TavSpace.lg),
          Text('Beneficiario', style: TavText.overline.copyWith(color: TavColors.ink3)),
          const SizedBox(height: TavSpace.sm),
          TavCard(
            child: Column(
              children: [
                _kvRow('Nombre', _benefNombreController.text),
                _kvRow('Cédula', _benefDocController.text),
                _kvRow('Banco', _benefBancoController.text),
                _kvRow('Cuenta', _benefCuentaController.text),
                _kvRow('Método', _benefMetodo),
              ],
            ),
          ),
          const SizedBox(height: TavSpace.xxl),
          TavButton(
            label: 'Confirmar operación',
            loading: _loading,
            onPressed: _loading ? null : _confirmarOperacion,
          ),
          if (_errorCupo != null && _cupoEx == null) ...[
            const SizedBox(height: TavSpace.sm),
            Text(
              _errorCupo!,
              style: TavText.body2.copyWith(color: TavColors.red),
              textAlign: TextAlign.center,
            ),
          ],
        ],
      ),
    );
  }

  // ── Paso 4: Pago ──
  Widget _pasoPago() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(TavSpace.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(TavSpace.md),
            decoration: BoxDecoration(
              color: TavColors.blue50,
              border: Border.all(color: TavColors.blue),
              borderRadius: BorderRadius.circular(TavRadius.card),
            ),
            child: Row(
              children: [
                Text('Tasa congelada', style: TavText.label.copyWith(color: TavColors.blue600)),
                const Spacer(),
                Text(
                  '${DateTime.now().hour}:${DateTime.now().minute.toString().padLeft(2, '0')}',
                  style: TavText.label.copyWith(color: TavColors.blue600),
                ),
              ],
            ),
          ),
          const SizedBox(height: TavSpace.md),
          TavCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Envía exactamente', style: TavText.caption.copyWith(color: TavColors.ink3)),
                const SizedBox(height: 3),
                Text(
                  formatCents(_totalCents, currency: _tipo == 'usdt_bs' ? TavMoneyCurrency.usdt : TavMoneyCurrency.usd),
                  style: TavText.moneyDisplay.copyWith(fontSize: 26),
                ),
                const SizedBox(height: 14),
                const Divider(height: 0),
                const SizedBox(height: 6),
                Text('Red · TRC20 (Tron)', style: TavText.caption.copyWith(color: TavColors.ink3)),
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: TavSpace.md, vertical: 10),
                  decoration: BoxDecoration(
                    color: TavColors.bg,
                    borderRadius: BorderRadius.circular(TavRadius.field),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'TQm4vP...8jK2xL9d',
                        style: TavText.mono.copyWith(fontSize: 12.5),
                      ),
                      const Icon(Icons.copy_outlined, color: TavColors.blue, size: 18),
                    ],
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Enviar por otra red puede causar la pérdida de los fondos.',
                  style: TavText.caption.copyWith(color: TavColors.ink3, height: 1.5),
                ),
              ],
            ),
          ),
          const SizedBox(height: TavSpace.lg),
          Text('Comprobante', style: TavText.overline.copyWith(color: TavColors.ink3)),
          const SizedBox(height: TavSpace.sm),
          GestureDetector(
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(TavSpace.xxl),
              decoration: BoxDecoration(
                color: TavColors.bg,
                border: Border.all(color: TavColors.line, style: BorderStyle.solid),
                borderRadius: BorderRadius.circular(TavRadius.card),
              ),
              child: Column(
                children: [
                  const Icon(Icons.upload_outlined, color: TavColors.ink3, size: 32),
                  const SizedBox(height: 8),
                  Text('Sube tu comprobante', style: TavText.label),
                  const SizedBox(height: 3),
                  Text(
                    'Captura de pantalla o hash de la transacción',
                    style: TavText.caption.copyWith(color: TavColors.ink3),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: TavSpace.xxl),
          TavButton(
            label: 'Ya realicé el pago',
            onPressed: () => context.go('/cajero/inicio'),
          ),
        ],
      ),
    );
  }

  // ── Helpers ──
  Widget _kvRow(String label, String value, {bool bold = false, Color? valueColor}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TavText.body2.copyWith(
              color: bold ? TavColors.ink : TavColors.ink3,
              fontWeight: bold ? FontWeight.w600 : FontWeight.w400,
              fontSize: bold ? 15 : 13.5,
            ),
          ),
          Text(
            value,
            style: TavText.body2.copyWith(
              color: valueColor ?? (bold ? TavColors.ink : TavColors.ink),
              fontWeight: bold ? FontWeight.w600 : FontWeight.w400,
              fontSize: bold ? 15 : 13.5,
            ),
          ),
        ],
      ),
    );
  }

  Widget _kvRowDisponible() {
    final resumenState = ref.watch(resumenProvider);
    int disponible = 0;
    if (resumenState is CajeroDataLoaded<ResumenDto>) {
      disponible = resumenState.data.disponibleCents;
    }
    final suficiente = disponible >= _totalCents;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text('Crédito disponible', style: TavText.body2.copyWith(color: TavColors.ink3, fontSize: 13.5)),
          Text(
            formatCents(disponible),
            style: TavText.body2.copyWith(
              color: suficiente ? TavColors.green600 : TavColors.red700,
              fontSize: 13.5,
            ),
          ),
        ],
      ),
    );
  }

  String get _tasaParLabel => _tasaPar == 'USDT_BS' ? 'USDT' : 'USD';

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

class _TipoCard extends StatelessWidget {
  const _TipoCard({
    required this.titulo,
    required this.descripcion,
    required this.tasaLabel,
    required this.icon,
    required this.iconBg,
    required this.iconColor,
    this.chip,
    this.seleccionado = false,
    required this.onTap,
  });

  final String titulo;
  final String descripcion;
  final String tasaLabel;
  final IconData icon;
  final Color iconBg;
  final Color iconColor;
  final Widget? chip;
  final bool seleccionado;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: TavCard(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: iconBg,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(icon, color: iconColor, size: 24),
            ),
            const SizedBox(width: 13),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(titulo, style: TavText.h2.copyWith(fontSize: 15)),
                      ),
                      if (chip != null) chip!,
                    ],
                  ),
                  const SizedBox(height: 5),
                  Text(
                    descripcion,
                    style: TavText.body2.copyWith(color: TavColors.ink3, height: 1.5),
                  ),
                  const SizedBox(height: 9),
                  Text(
                    tasaLabel,
                    style: TavText.caption.copyWith(color: TavColors.ink3),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MetodoSegmented extends StatelessWidget {
  const _MetodoSegmented({required this.value, required this.onChanged});

  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final opciones = [
      ('transferencia', 'Transferencia'),
      ('movil', 'Pago móvil'),
      ('efectivo', 'Efectivo'),
    ];
    return Container(
      decoration: BoxDecoration(
        color: TavColors.bg,
        borderRadius: BorderRadius.circular(TavRadius.field),
      ),
      child: Row(
        children: opciones.map((o) {
          final isOn = value == o.$1;
          return Expanded(
            child: GestureDetector(
              onTap: () => onChanged(o.$1),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 10),
                decoration: BoxDecoration(
                  color: isOn ? TavColors.surface : Colors.transparent,
                  borderRadius: BorderRadius.circular(TavRadius.field),
                  boxShadow: isOn
                      ? [const BoxShadow(color: Color(0x1A101828), blurRadius: 4, offset: Offset(0, 1))]
                      : null,
                ),
                child: Text(
                  o.$2,
                  style: TavText.label.copyWith(
                    color: isOn ? TavColors.ink : TavColors.ink3,
                    fontSize: 13,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
