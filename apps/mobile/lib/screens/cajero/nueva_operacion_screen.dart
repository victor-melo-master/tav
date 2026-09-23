import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_button.dart';
import '../../components/tav_card.dart';
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

/// Flujo de nueva operación: destino → monto → beneficiario → resumen → pago → confirmación.
///
/// Fase 9: el cajero escoge un corredor (destino + forma de entrega) y ve
/// un solo precio, el negociado para él. El desglose es de tres líneas: lo
/// que envía en GYD, el precio aplicado, y lo que recibe el beneficiario en
/// la moneda del destino. Ninguna comisión visible. Si no hay corredores
/// ofrecibles, un estado vacío que lo explica.
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
  int _step = 0; // 0: destino, 1: monto, 2: beneficiario, 3: resumen, 4: pago
  CorredorDto? _corredor;
  String _montoStr = ''; // en centavos como string

  // El precio del servicio elegido (GYD por dólar), fijado por el admin para
  // este cajero. Es string decimal. La deuda la calcula el servidor.
  String get _precioGyd => _corredor?.precioGyd ?? '';
  String get _monedaOrigen => 'USD'; // Fase 9: el cajero envía dólares
  String get _tipo => 'usdt_${_corredor?.moneda.toLowerCase() ?? 'bs'}';

  final _benefNombreController = TextEditingController();
  final _benefDatosController = TextEditingController();
  bool _loading = false;
  String? _errorCupo;
  CupoInsuficienteException? _cupoEx;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(corredoresProvider.notifier).cargar();
      ref.read(resumenProvider.notifier).cargar();
    });
  }

  int get _montoCents => int.tryParse(_montoStr) ?? 0;

  /// Precio escalado a 8 decimales como entero, para multiplicar sin double.
  ///
  /// "1.3359375" → 133593750 (1.3359375 × 10^8).
  /// "285.4"     → 28540000000 (285.4 × 10^8).
  /// Si el precio tiene más de 8 decimales, se trunca a 8.
  int get _precioEscalado {
    final s = _precioGyd;
    if (s.isEmpty) return 0;
    final dot = s.indexOf('.');
    if (dot < 0) return int.parse(s) * 100000000;
    final enteros = s.substring(0, dot);
    var decimales = s.substring(dot + 1);
    if (decimales.length > 8) decimales = decimales.substring(0, 8);
    while (decimales.length < 8) {
      decimales += '0';
    }
    return int.parse('$enteros$decimales');
  }

  // La comisión va implícita dentro del precio (docs/01-reglas-de-negocio.md).
  // El cajero no paga cargo aparte: debe exactamente lo que envía × el precio.
  // El servidor calcula la deuda; el cliente solo la muestra.

  /// Deuda en GYD centavos = round_half_up(montoUsdCents × precioGyd).
  ///
  /// Aritmética entera pura, sin double. Coincide con lo que calcula el
  /// servidor con Decimal + ROUND_HALF_UP, porque ambos escalan a 8
  /// decimales y redondean half-up. 100 USD a 240 = 10000 × 240 = 2.400.000
  /// cents = 24.000 GYD.
  int get _deudaGydCents {
    final producto = _montoCents * _precioEscalado;
    return (producto + 50000000) ~/ 100000000;
  }

  @override
  void dispose() {
    _benefNombreController.dispose();
    _benefDatosController.dispose();
    super.dispose();
  }

  void _onDigit(int d) {
    // Límite de 9 dígitos enteros: máximo $999.999.999,99.
    if (_montoStr.length >= 9) return;
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

  void _selectCorredor(CorredorDto c) {
    setState(() {
      _corredor = c;
      _step = 1;
    });
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
          monedaOrigen: _monedaOrigen,
          beneficiario: BeneficiarioOperacionDto(
            nombre: _benefNombreController.text.trim(),
            datos: _benefDatosController.text,
          ),
          corredorId: _corredor!.id,
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
      2 => '¿A dónde va el dinero?',
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

  // ── Paso 0: Destino (corredor) ──
  Widget _pasoTipo() {
    final corredoresState = ref.watch(corredoresProvider);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(TavSpace.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '¿A dónde va el dinero?',
            style: TavText.body2.copyWith(color: TavColors.ink3),
          ),
          const SizedBox(height: 18),
          if (corredoresState is CajeroDataLoading) ...[
            const Center(child: CircularProgressIndicator()),
          ] else if (corredoresState is CajeroDataError) ...[
            Text(
              corredoresState.message,
              style: TavText.body2.copyWith(color: TavColors.red),
            ),
          ] else if (corredoresState is CajeroDataLoaded<List<CorredorDto>>) ...[
            if (corredoresState.data.isEmpty) ...[
              _estadoVacioCorredores(),
            ] else ...[
              ...corredoresState.data.map((c) => _CorredorCard(
                    corredor: c,
                    seleccionado: _corredor?.id == c.id,
                    onTap: () => _selectCorredor(c),
                  )),
            ],
          ],
        ],
      ),
    );
  }

  Widget _estadoVacioCorredores() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(TavSpace.xxl),
      decoration: BoxDecoration(
        color: TavColors.surface,
        border: Border.all(color: TavColors.line),
        borderRadius: BorderRadius.circular(TavRadius.card),
      ),
      child: Column(
        children: [
          const Icon(Icons.public_off, size: 48, color: TavColors.ink3),
          const SizedBox(height: TavSpace.md),
          Text(
            'No hay destinos disponibles',
            style: TavText.h2,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: TavSpace.sm),
          Text(
            'El administrador aún no ha fijado precios para ningún corredor. '
            'Vuelve más tarde o avísale.',
            style: TavText.body2.copyWith(color: TavColors.ink3),
            textAlign: TextAlign.center,
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
            currency: TavMoneyCurrency.usd,
            style: TavText.moneyDisplay.copyWith(fontSize: 38),
            fitted: true,
          )
        : Text(
            '0',
            style: TavText.moneyDisplay.copyWith(fontSize: 38, color: TavColors.ink3),
          );

    final monedaLabel = _monedaOrigen;

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
                          textBaseline: TextBaseline.alphabetic,
                          children: [
                            Flexible(child: montoDisplay),
                            const SizedBox(width: 7),
                            Text(monedaLabel, style: TavText.h2.copyWith(color: TavColors.ink3)),
                          ],
                        ),
                        const Divider(height: 28),
                        Text('Debes',
                            style: TavText.caption.copyWith(color: TavColors.ink3)),
                        const SizedBox(height: 3),
                        Text(
                          'G\$ ${_formatMonto(_deudaGydCents)}',
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
                      _kvRow('Precio aplicado', 'G\$ ${_formatPrecio(_precioGyd)} / USD'),
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
                  'El precio se congela por 15 minutos al confirmar.',
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
            label: 'Nombre del beneficiario',
            hint: 'Nombre y apellido que identifica la operación',
            controller: _benefNombreController,
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: TavSpace.lg),
          TextField(
            controller: _benefDatosController,
            maxLines: 6,
            decoration: InputDecoration(
              labelText: 'Datos para el pago',
              hintText: 'Pega aquí los datos tal como te los enviaron',
              alignLabelWithHint: true,
              border: const OutlineInputBorder(),
              suffixIcon: IconButton(
                icon: const Icon(Icons.paste),
                onPressed: _pegarDatos,
              ),
            ),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: TavSpace.lg),
          Text(
            'Verifica bien los datos. Las transferencias enviadas a una cuenta equivocada no se pueden revertir.',
            style: TavText.caption.copyWith(color: TavColors.ink3, height: 1.5),
          ),
          const SizedBox(height: TavSpace.xxl),
          TavButton(
            label: 'Continuar',
            onPressed: _beneficiarioValido() ? _continuarAResumen : null,
          ),
        ],
      ),
    );
  }

  /// Pega el contenido del portapapeles en el campo de datos del beneficiario.
  Future<void> _pegarDatos() async {
    final data = await Clipboard.getData('text/plain');
    if (data?.text != null && data!.text!.isNotEmpty) {
      _benefDatosController.text = data.text!;
      setState(() {});
    }
  }

  /// Mínimo para continuar: nombre + datos de pago.
  bool _beneficiarioValido() {
    return _benefNombreController.text.trim().isNotEmpty &&
        _benefDatosController.text.trim().isNotEmpty;
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
                  Text('Debes',
                      style: TavText.caption.copyWith(color: const Color(0xFF9EC0EC))),
                  const SizedBox(height: 5),
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      'G\$ ${_formatMonto(_deudaGydCents)}',
                      style: TavText.moneyDisplay.copyWith(fontSize: 30, color: TavColors.surface),
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    'Enviando ${formatCents(_montoCents, currency: TavMoneyCurrency.usd)}',
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
                _kvRow('Destino', _corredor?.paisNombre ?? '—'),
                _kvRow('Entrega', _corredor?.formaEntregaNombre ?? '—'),
                _kvRow('Precio', 'G\$ ${_formatPrecio(_precioGyd)} / USD'),
              ],
            ),
          ),
          const SizedBox(height: TavSpace.lg),
          Text('Beneficiario', style: TavText.overline.copyWith(color: TavColors.ink3)),
          const SizedBox(height: TavSpace.sm),
          TavCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _kvRow('Nombre', _benefNombreController.text),
                const SizedBox(height: TavSpace.sm),
                Text('Datos para el pago', style: TavText.caption.copyWith(color: TavColors.ink3)),
                const SizedBox(height: TavSpace.xs),
                Text(
                  _benefDatosController.text,
                  style: TavText.body2,
                ),
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
                Text('Precio congelado', style: TavText.label.copyWith(color: TavColors.blue600)),
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
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    formatCents(_montoCents, currency: TavMoneyCurrency.usd),
                    style: TavText.moneyDisplay.copyWith(fontSize: 26),
                  ),
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
    final suficiente = disponible >= _deudaGydCents;
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

  String _formatPrecio(String valor) {
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

  String _formatMonto(int cents) {
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

class _CorredorCard extends StatelessWidget {
  const _CorredorCard({
    required this.corredor,
    required this.seleccionado,
    required this.onTap,
  });

  final CorredorDto corredor;
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
                color: TavColors.blue50,
                borderRadius: BorderRadius.circular(14),
              ),
              child: const Icon(Icons.public, color: TavColors.blue, size: 24),
            ),
            const SizedBox(width: 13),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${corredor.paisNombre} · ${corredor.monedaNombre}',
                    style: TavText.h2.copyWith(fontSize: 15),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    corredor.formaEntregaNombre,
                    style: TavText.body2.copyWith(color: TavColors.ink3, height: 1.5),
                  ),
                  const SizedBox(height: 9),
                  Text(
                    'Precio · G\$ ${_formatPrecioStatic(corredor.precioGyd)} / USD',
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

  String _formatPrecioStatic(String valor) {
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


