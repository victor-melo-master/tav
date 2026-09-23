import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_button.dart';
import '../../components/tav_card.dart';
import '../../components/tav_field.dart';
import '../../data/pagador_api.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';
import '../../utils/labels.dart';
import '../../utils/uuid_gen.dart';

/// Pantalla de ejecución de pago del pagador.
///
/// El pagador escribe al marcar una operación como pagada:
/// - montoDestinoCents: los bolívares (o la moneda destino) que recibió el
///   beneficiario. Llena el campo que el paso 3 dejó en 0.
/// - tasaEjecucion: la tasa real de ese pago (240, 244, 250...). No se
///   precarga con la cotizada: si se precarga nadie la cambia y el dato
///   pierde valor.
/// - formaPago: pago móvil, transferencia, efectivo.
/// - nombreCliente: el nombre del cliente que recibió.
/// - comprobantePagoUrl: la captura del pago (imagen o PDF, máx 5 MB).
///   Obligatoria. Se sube antes de pagar.
///
/// La caja de la que sale la plata la determina el corredor, no la forma
/// de pago. El pagador no elige la caja.
class PagadorOperacionScreen extends ConsumerStatefulWidget {
  const PagadorOperacionScreen({super.key, required this.operacionId});

  final String operacionId;

  @override
  ConsumerState<PagadorOperacionScreen> createState() =>
      _PagadorOperacionScreenState();
}

class _PagadorOperacionScreenState extends ConsumerState<PagadorOperacionScreen> {
  ItemColaPagadorDto? _item;
  String? _error;
  bool _cargando = true;

  // Campos del formulario de pago.
  final _tasaCtrl = TextEditingController();
  final _formaPagoCtrl = TextEditingController(text: 'pago_movil');
  final _nombreCtrl = TextEditingController();
  final _montoDestinoCtrl = TextEditingController();
  bool _enviando = false;
  bool _subiendo = false;
  String? _comprobantePagoUrl;
  String? _comprobanteNombre;
  String? _clientUuid; // se genera al montar; no cambia entre reintentos

  @override
  void initState() {
    super.initState();
    _clientUuid = generarClientUuid();
    _cargar();
  }

  @override
  void dispose() {
    _tasaCtrl.dispose();
    _formaPagoCtrl.dispose();
    _nombreCtrl.dispose();
    _montoDestinoCtrl.dispose();
    super.dispose();
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
      final item = cola.where((i) => i.id == widget.operacionId).firstOrNull;
      if (item == null) {
        // Ya no está en la cola: probablemente ya pagada.
        setState(() {
          _cargando = false;
          _error = 'Esta operación ya no está pendiente.';
        });
        return;
      }
      setState(() {
        _item = item;
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

  Future<void> _seleccionarComprobante() async {
    try {
      final files = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'],
      );
      if (files.isEmpty) return;
      final file = files.first;
      final size = file.lengthSync() ?? await file.length();
      if (size != null && size > 5 * 1024 * 1024) {
        _toast('El archivo no puede pesar más de 5 MB');
        return;
      }

      setState(() => _subiendo = true);
      final api = ref.read(pagadorApiProvider);
      final url = await api.subirComprobante(file.path!, file.name);
      if (!mounted) return;
      setState(() {
        _comprobantePagoUrl = url;
        _comprobanteNombre = file.name;
        _subiendo = false;
      });
    } catch (e) {
      if (!mounted) return;
      _toast('No se pudo subir el comprobante: $e');
      setState(() => _subiendo = false);
    }
  }

  Future<void> _pagar() async {
    final item = _item;
    if (item == null) return;

    final tasa = _tasaCtrl.text.trim();
    final forma = _formaPagoCtrl.text.trim();
    final nombre = _nombreCtrl.text.trim();
    final montoDestino = _montoDestinoCtrl.text.trim();

    if (montoDestino.isEmpty) {
      _toast('Falta cuánto recibió el beneficiario (bolívares)');
      return;
    }
    if (tasa.isEmpty) {
      _toast('Falta la tasa de ejecución');
      return;
    }
    if (forma.isEmpty) {
      _toast('Falta la forma de pago');
      return;
    }
    if (nombre.isEmpty) {
      _toast('Falta el nombre del cliente que recibió');
      return;
    }
    if (_comprobantePagoUrl == null) {
      _toast('Falta la captura del pago');
      return;
    }

    setState(() => _enviando = true);
    try {
      final api = ref.read(pagadorApiProvider);
      final res = await api.pagar(EjecutarPagoRequest(
        clientUuid: _clientUuid!,
        operacionId: item.id,
        montoCents: item.montoDestinoCents.toString(),
        montoDestinoCents: montoDestino,
        tasaEjecucion: tasa.replaceAll(',', '.'),
        formaPago: forma,
        nombreCliente: nombre,
        comprobantePagoUrl: _comprobantePagoUrl!,
      ));
      if (!mounted) return;
      if (res.yaExistia) {
        _toast('El pago ya estaba registrado');
      } else {
        _toast('Pago registrado');
      }
      context.pop();
    } catch (e) {
      if (!mounted) return;
      _toast('No se pudo registrar el pago: $e');
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  void _toast(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), behavior: SnackBarBehavior.floating),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: TavColors.bg,
      appBar: AppBar(
        title: const Text('Ejecutar pago'),
        backgroundColor: TavColors.surface,
        foregroundColor: TavColors.ink,
        elevation: 0,
      ),
      body: _cargando
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(TavSpace.lg),
                    child: Text(_error!, style: TavText.body, textAlign: TextAlign.center),
                  ),
                )
              : _formulario(),
    );
  }

  Widget _formulario() {
    final item = _item!;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(TavSpace.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Resumen de la operación
          TavCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.folio, style: TavText.h2),
                const SizedBox(height: TavSpace.xs),
                Text(
                  simboloMoneda(item.monedaDestino) +
                      (item.montoDestinoCents / 100).toStringAsFixed(2),
                  style: TavText.h2.copyWith(
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
                const SizedBox(height: TavSpace.xs),
                Text(
                  '${item.corredor.paisNombre} · ${item.corredor.monedaNombre} · ${item.corredor.formaEntregaNombre}',
                  style: TavText.caption.copyWith(color: TavColors.ink3),
                ),
                const SizedBox(height: TavSpace.xs),
                Text(
                  'Beneficiario: ${(item.beneficiario['nombre'] as String?) ?? '—'}',
                  style: TavText.caption.copyWith(color: TavColors.ink2),
                ),
              ],
            ),
          ),
          const SizedBox(height: TavSpace.md),

          // Bolívares entregados — lo que el pagador anota
          TavField(
            label: 'Bolívares entregados',
            hint: 'Cuánto recibió el beneficiario',
            controller: _montoDestinoCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
          ),
          const SizedBox(height: TavSpace.sm),
          Text(
            'Los bolívares que anotas llenan el monto destino de la operación.',
            style: TavText.caption.copyWith(color: TavColors.ink3),
          ),
          const SizedBox(height: TavSpace.md),

          // Tasa de ejecución — NO se precarga con la cotizada
          TavField(
            label: 'Tasa de ejecución',
            hint: 'A cómo se ejecutó el cambio (240, 244, 250...)',
            controller: _tasaCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
          ),
          const SizedBox(height: TavSpace.sm),
          Text(
            'No se precarga con la tasa cotizada: si se precarga nadie la cambia.',
            style: TavText.caption.copyWith(color: TavColors.ink3),
          ),
          const SizedBox(height: TavSpace.md),

          // Forma de pago
          TavField(
            label: 'Forma de pago',
            hint: 'pago_movil, transferencia, efectivo',
            controller: _formaPagoCtrl,
          ),
          const SizedBox(height: TavSpace.sm),
          Text(
            'La caja la determina el corredor, no la forma de pago.',
            style: TavText.caption.copyWith(color: TavColors.ink3),
          ),
          const SizedBox(height: TavSpace.md),

          // Nombre del cliente que recibió
          TavField(
            label: 'Nombre del cliente que recibió',
            hint: 'María González',
            controller: _nombreCtrl,
          ),
          const SizedBox(height: TavSpace.md),

          // Captura del pago — obligatoria
          Text('Captura del pago', style: TavText.body.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: TavSpace.xs),
          Text(
            'Imagen (JPG, PNG, GIF, WEBP) o PDF, máximo 5 MB. Obligatoria.',
            style: TavText.caption.copyWith(color: TavColors.ink3),
          ),
          const SizedBox(height: TavSpace.sm),
          if (_comprobanteNombre != null)
            Padding(
              padding: const EdgeInsets.only(bottom: TavSpace.sm),
              child: Row(
                children: [
                  const Icon(Icons.check_circle, color: TavColors.green600, size: 18),
                  const SizedBox(width: TavSpace.xs),
                  Expanded(
                    child: Text(
                      _comprobanteNombre!,
                      style: TavText.caption.copyWith(color: TavColors.ink2),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: _subiendo ? null : _seleccionarComprobante,
              icon: _subiendo
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.attach_file, size: 18),
              label: Text(_subiendo ? 'Subiendo…' : 'Subir captura'),
            ),
          ),
          const SizedBox(height: TavSpace.lg),

          // Botón
          SizedBox(
            width: double.infinity,
            child: TavButton(
              label: _enviando ? 'Registrando…' : 'Registrar pago',
              onPressed: _enviando ? null : _pagar,
              loading: _enviando,
            ),
          ),
        ],
      ),
    );
  }
}
