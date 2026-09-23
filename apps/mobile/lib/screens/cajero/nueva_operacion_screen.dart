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
import '../../utils/labels.dart';

/// Flujo de nueva operación: destino → monto → beneficiario → resumen → pago → confirmación.
///
/// Fase 9: el cajero escoge un corredor (destino + forma de entrega) y ve
/// una sola tasa, la cotizada. El desglose es de tres líneas: lo que envía
/// en GYD, la tasa aplicada, y lo que recibe el beneficiario en la moneda
/// del destino. Ninguna comisión visible. Si no hay corredores ofrecibles,
/// un estado vacío que lo explica.
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
  String get _monedaOrigen => 'USDT'; // Fase 9: el cajero envía USDT
  String get _tipo => 'usdt_${_corredor?.moneda.toLowerCase() ?? 'bs'}';

  final _benefNombreController = TextEditingController();
  final _benefDocController = TextEditingController();
  final _benefBancoController = TextEditingController();
  final _benefCuentaController = TextEditingController();
  final _pegarController = TextEditingController();
  String _benefMetodo = 'transferencia';
  bool _guardarBeneficiario = false;
  String? _avisoReconocimiento;
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
    _benefDocController.dispose();
    _benefBancoController.dispose();
    _benefCuentaController.dispose();
    _pegarController.dispose();
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
            documento: _benefDocController.text.trim(),
            banco: _benefBancoController.text.trim(),
            cuenta: _benefCuentaController.text.trim(),
            metodo: _benefMetodo,
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
            'El administrador aún no ha publicado tasas para ningún corredor. '
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
            currency: TavMoneyCurrency.usdt,
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
                      _kvRow('Precio aplicado', 'G\$ ${_formatTasa(_precioGyd)} / USD'),
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

  // ── Paso 2: Beneficiario (pegado rápido) ──
  Widget _pasoBeneficiario() {
    final opsState = ref.watch(operacionesProvider);
    final recientes = _extraerRecientes(opsState);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(TavSpace.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 1. Método de entrega primero — determina qué campos siguen.
          Text('Método de entrega', style: TavText.label.copyWith(color: TavColors.ink2)),
          const SizedBox(height: 6),
          _MetodoSegmented(
            value: _benefMetodo,
            onChanged: (v) => setState(() => _benefMetodo = v),
          ),
          const SizedBox(height: TavSpace.lg),

          // 2. Campo grande de pegado desde el portapapeles.
          Text('Pega aquí los datos del destinatario',
              style: TavText.label.copyWith(color: TavColors.ink2)),
          const SizedBox(height: 6),
          _buildCampoPegado(),
          const SizedBox(height: TavSpace.lg),

          // 3. Cuentas recientes (si las hay).
          if (recientes.isNotEmpty) ...[
            Text('Cuentas recientes',
                style: TavText.overline.copyWith(color: TavColors.ink3)),
            const SizedBox(height: TavSpace.sm),
            ...recientes.map((r) => _buildRecentRow(r)),
            const SizedBox(height: TavSpace.lg),
          ],

          // 4. Campos rellenos y editables para verificar.
          Text('Verifica los datos', style: TavText.overline.copyWith(color: TavColors.ink3)),
          const SizedBox(height: TavSpace.sm),
          TavField(
            label: 'Nombre y apellido',
            controller: _benefNombreController,
            placeholder: 'Ej. Carmen Silva',
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: TavSpace.lg),
          TavField(
            label: 'Cédula',
            controller: _benefDocController,
            placeholder: 'V-00.000.000',
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: TavSpace.lg),
          TavField(
            label: 'Banco',
            controller: _benefBancoController,
            placeholder: 'Banesco',
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: TavSpace.lg),
          TavField(
            label: _benefMetodo == 'efectivo' ? 'Referencia / nota' : 'Número de cuenta / Pago móvil',
            controller: _benefCuentaController,
            placeholder: '0134 0000 0000 0000 0000',
            keyboardType: TextInputType.number,
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: TavSpace.lg),

          // 5. Checkbox guardar para próximas operaciones.
          InkWell(
            onTap: () => setState(() => _guardarBeneficiario = !_guardarBeneficiario),
            child: Row(
              children: [
                SizedBox(
                  width: 24,
                  height: 24,
                  child: Checkbox(
                    value: _guardarBeneficiario,
                    onChanged: (v) => setState(() => _guardarBeneficiario = v ?? false),
                    activeColor: TavColors.blue,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(6),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Guardar para próximas operaciones',
                    style: TavText.body2.copyWith(color: TavColors.ink2),
                  ),
                ),
              ],
            ),
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

  /// Campo grande de pegado con un solo botón "Pegar datos".
  /// Al tocar, lee el portapapeles, reconoce y rellena en un paso.
  Widget _buildCampoPegado() {
    return Column(
      children: [
        SizedBox(
          height: 80,
          child: TextField(
            controller: _pegarController,
            maxLines: 3,
            style: TavText.body.copyWith(fontSize: 13),
            decoration: InputDecoration(
              hintText: 'Pega aquí el mensaje de WhatsApp con los datos del destinatario…',
              hintStyle: TavText.body.copyWith(color: TavColors.ink3, fontSize: 13),
              filled: true,
              fillColor: TavColors.surface,
              contentPadding: const EdgeInsets.all(TavSpace.md),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(TavRadius.field),
                borderSide: const BorderSide(color: TavColors.line),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(TavRadius.field),
                borderSide: const BorderSide(color: TavColors.line),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(TavRadius.field),
                borderSide: const BorderSide(color: TavColors.blue),
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: TavButton(
            label: 'Pegar datos',
            variant: TavButtonVariant.outline,
            small: true,
            icon: const Icon(Icons.content_paste_outlined, size: 16),
            onPressed: _pegarDatos,
          ),
        ),
        if (_avisoReconocimiento != null) ...[
          const SizedBox(height: 8),
          Text(
            _avisoReconocimiento!,
            style: TavText.caption.copyWith(color: TavColors.gold700),
          ),
        ],
      ],
    );
  }

  /// Un solo paso: lee el portapapeles, reconoce y rellena los campos.
  Future<void> _pegarDatos() async {
    final data = await Clipboard.getData('text/plain');
    if (data?.text != null && data!.text!.isNotEmpty) {
      _pegarController.text = data.text!;
    }
    _reconocerPegado();
  }

  /// Reconoce nombre, cédula, banco y número de cuenta del texto pegado.
  ///
  /// PATRONES QUE DETECTA (afinar cuando el cliente pase ejemplos reales):
  ///
  /// 1. CÉDULA — Letra V/E/J/G/C (mayúscula o minúscula) seguida de
  ///    números con puntos, guiones o espacios opcionales.
  ///    Acepta: V-12.345.678, V12345678, v-12.345.678, J-001.234.567
  ///    También acepta cédula sin letra: 12.345.678, 12345678
  ///    (asume V si no hay letra).
  ///
  /// 2. BANCO — Lista de ~35 bancos venezolanos por nombre o sigla.
  ///    Acepta con o sin prefijo "Banco:": Banesco, BDV, Mercantil, etc.
  ///    Normaliza a Title Case al rellenar.
  ///
  /// 3. CUENTA — 12 a 20 dígitos consecutivos, o separados por espacios/guiones.
  ///    Acepta: 0134 0000 0000 0000 0000, 01340000000000000000
  ///    También acepta teléfono como pago móvil: 0414-1234567
  ///
  /// 4. NOMBRE — La primera línea con texto alfabético (no números, no banco,
  ///    no cédula) que tenga al menos 2 palabras. Acepta acentos y ñ.
  ///    Si no encuentra una línea "limpia", toma la primera línea con texto.
  ///
  /// TOLERANCIA:
  /// - Funciona con o sin saltos de línea.
  /// - Funciona con etiquetas ("Banco:", "Cédula:", "Cuenta:") o sin ellas.
  /// - No distingue mayúsculas de minúsculas.
  /// - Si no reconoce un campo, lo deja vacío para que el cajero lo complete.
  void _reconocerPegado() {
    final texto = _pegarController.text.trim();
    if (texto.isEmpty) return;

    String? nombre;
    String? cedula;
    String? banco;
    String? cuenta;
    int camposDetectados = 0;

    // ── 1. CÉDULA ──
    // Formato con letra: V-12.345.678, V12345678, v 12.345.678, etc.
    final cedulaConLetra = RegExp(
      r'\b[VEJGCvejgc][-.\s]?(\d{1,3}[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}\b',
    );
    // Formato sin letra: 12.345.678, 12345678 (8 dígitos con o sin separadores).
    final cedulaSinLetra = RegExp(r'\b\d{1,2}[.\s]?\d{3}[.\s]?\d{3,4}\b');

    var cedulaMatch = cedulaConLetra.firstMatch(texto);
    if (cedulaMatch != null) {
      cedula = cedulaMatch.group(0)!.toUpperCase();
      camposDetectados++;
    } else {
      cedulaMatch = cedulaSinLetra.firstMatch(texto);
      if (cedulaMatch != null) {
        // Asumir V si no hay letra.
        cedula = 'V-${cedulaMatch.group(0)}';
        camposDetectados++;
      }
    }

    // ── 2. BANCO ──
    // Lista de bancos venezolanos por nombre o sigla.
    final bancosConocidos = [
      'banesco', 'banco provincial', 'bbva', 'mercantil', 'banco de venezuela',
      'bdv', 'banco nacional de crédito', 'bnc', 'banesco banco universal',
      'banco caroní', 'banco exterior', 'banco mercantil',
      'banco del tesoro', 'banco bicentenario', 'banco venezolano de crédito',
      'bvc', 'banco activo', 'bancaribe', 'banplus', 'bancamiga',
      'banco fondo común', 'bfc', '100% banco', 'cien por ciento banco',
      'del sur', 'banco del sur', 'bansur', 'banco plaza',
      'banco venezolano', 'credit card center', 'ccc',
      'banco internacional de desarrollo', 'bid',
      'banco de la mujer', 'banco exportador de comercio',
    ];
    final textoLower = texto.toLowerCase();
    for (final b in bancosConocidos) {
      if (textoLower.contains(b)) {
        banco = b.split(' ').map((w) {
          if (w == '100%') return '100%';
          if (w == 'bbva') return 'BBVA';
          if (w == 'bnc') return 'BNC';
          if (w == 'bdv') return 'BDV';
          if (w == 'bvc') return 'BVC';
          if (w == 'bfc') return 'BFC';
          if (w == 'ccc') return 'CCC';
          if (w == 'bid') return 'BID';
          return w[0].toUpperCase() + w.substring(1);
        }).join(' ');
        camposDetectados++;
        break;
      }
    }

    // ── 3. CUENTA ──
    // 12-20 dígitos consecutivos o separados por espacios/guiones.
    final cuentaRe = RegExp(r'\b\d{4}[\s-]?\d{4}[\s-]?\d{2,4}[\s-]?\d{2,4}[\s-]?\d{0,4}\b');
    final cuentaMatch = cuentaRe.firstMatch(texto);
    if (cuentaMatch != null) {
      cuenta = cuentaMatch.group(0)!.replaceAll(RegExp(r'[\s-]'), '');
      camposDetectados++;
    } else {
      // 12+ dígitos consecutivos.
      final largoRe = RegExp(r'\b\d{12,20}\b');
      final largoMatch = largoRe.firstMatch(texto);
      if (largoMatch != null) {
        cuenta = largoMatch.group(0);
        camposDetectados++;
      } else {
        // Pago móvil: teléfono 04XX-XXXXXXX (11 dígitos).
        final pagoMovilRe = RegExp(r'\b0\d{3}[-.\s]?\d{7}\b');
        final pmMatch = pagoMovilRe.firstMatch(texto);
        if (pmMatch != null) {
          cuenta = pmMatch.group(0)!.replaceAll(RegExp(r'[-.\s]'), '');
          camposDetectados++;
        }
      }
    }

    // ── 4. NOMBRE ──
    // Primera línea con texto alfabético (no números, no banco, no cédula)
    // que tenga al menos 2 palabras. Acepta acentos y ñ.
    final lineas = texto.split('\n').map((l) => l.trim()).where((l) => l.isNotEmpty).toList();
    for (final linea in lineas) {
      // Quitar etiquetas tipo "Nombre:", "Beneficiario:" del inicio.
      final limpia = linea.replaceFirst(RegExp(r'^[a-zA-ZáéíóúñÁÉÍÓÚÑ]+:\s*'), '');
      if (cedulaConLetra.hasMatch(limpia) || cedulaSinLetra.hasMatch(limpia)) continue;
      if (cuentaRe.hasMatch(limpia)) continue;
      if (RegExp(r'^\d{12,20}$').hasMatch(limpia)) continue;
      final lineaLower = limpia.toLowerCase();
      if (bancosConocidos.any((b) => lineaLower.contains(b))) continue;
      if (RegExp(r'^[\d\s.-]+$').hasMatch(limpia)) continue;
      if (limpia.length < 3) continue;
      // Línea con palabras alfabéticas y al menos un espacio.
      if (RegExp(r'^[a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+$').hasMatch(limpia) && limpia.contains(' ')) {
        nombre = limpia;
        break;
      }
    }
    // Fallback: primera línea con texto no numérico.
    if (nombre == null) {
      for (final linea in lineas) {
        final limpia = linea.replaceFirst(RegExp(r'^[a-zA-ZáéíóúñÁÉÍÓÚÑ]+:\s*'), '');
        if (!RegExp(r'^[\d\s.-]+$').hasMatch(limpia) && limpia.length >= 3) {
          nombre = limpia;
          break;
        }
      }
    }
    if (nombre != null) camposDetectados++;

    // ── RELLENAR Y AVISAR ──
    setState(() {
      if (nombre != null) _benefNombreController.text = nombre;
      if (cedula != null) _benefDocController.text = cedula;
      if (banco != null) _benefBancoController.text = banco;
      if (cuenta != null) _benefCuentaController.text = cuenta;
      // Aviso discreto si no se detectaron todos los campos.
      if (camposDetectados < 4 && camposDetectados > 0) {
        _avisoReconocimiento = 'Revisa los datos, no pudimos leer todo.';
      } else if (camposDetectados == 0) {
        _avisoReconocimiento = 'No pudimos reconocer los datos. Ingrésalos manualmente.';
      } else {
        _avisoReconocimiento = null;
      }
    });
  }

  /// Extrae destinatarios únicos de las operaciones recientes para mostrarlos.
  List<BeneficiarioOperacionDto> _extraerRecientes(CajeroDataState state) {
    if (state is! CajeroDataLoaded) return [];
    final data = state.data as ({List<OperacionDto> items, int total, bool hasMore});
    final vistos = <String>{};
    final resultado = <BeneficiarioOperacionDto>[];
    for (final op in data.items) {
      final key = '${op.beneficiario.nombre}|${op.beneficiario.cuenta}';
      if (vistos.add(key)) {
        resultado.add(op.beneficiario);
      }
      if (resultado.length >= 3) break;
    }
    return resultado;
  }

  Widget _buildRecentRow(BeneficiarioOperacionDto r) {
    final iniciales = inicialesNombre(r.nombre);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: GestureDetector(
        onTap: () {
          setState(() {
            _benefNombreController.text = r.nombre;
            _benefDocController.text = r.documento;
            _benefBancoController.text = r.banco;
            _benefCuentaController.text = r.cuenta;
            _benefMetodo = r.metodo;
          });
        },
        child: TavCard(
          elevation: TavCardElevation.flat,
          padding: const EdgeInsets.symmetric(horizontal: TavSpace.md, vertical: 10),
          child: Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: TavColors.navy,
                  borderRadius: BorderRadius.circular(11),
                ),
                child: Center(
                  child: Text(
                    iniciales,
                    style: TavText.label.copyWith(color: TavColors.surface, fontSize: 12),
                  ),
                ),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(r.nombre, style: TavText.label.copyWith(fontSize: 13)),
                    Text(
                      '${r.banco} · ${r.cuenta}',
                      style: TavText.caption.copyWith(color: TavColors.ink3),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const Icon(Icons.north_west_outlined, color: TavColors.ink3, size: 18),
            ],
          ),
        ),
      ),
    );
  }

  /// Mínimo para despachar: nombre + cuenta. No exige cédula ni banco.
  bool _beneficiarioValido() {
    return _benefNombreController.text.trim().isNotEmpty &&
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
                    'Enviando ${formatCents(_montoCents, currency: TavMoneyCurrency.usdt)}',
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
                _kvRow('Precio', 'G\$ ${_formatTasa(_precioGyd)} / USD'),
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
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    formatCents(_montoCents, currency: TavMoneyCurrency.usdt),
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
                    'Precio · G\$ ${_formatTasaStatic(corredor.precioGyd)} / USD',
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

  String _formatTasaStatic(String valor) {
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
