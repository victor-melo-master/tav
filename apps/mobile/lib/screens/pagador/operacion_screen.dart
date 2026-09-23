import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../components/tav_button.dart';
import '../../components/tav_card.dart';
import '../../components/tav_field.dart';
import '../../components/tav_money_display.dart';
import '../../data/pagador_api.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';
import '../../utils/uuid_gen.dart';

/// Pantalla de ejecución de pago del pagador.
///
/// El pagador ve el pedido (monto en dólares, datos del beneficiario) y
/// anota cuántos bolívares entregó, a qué tasa y de qué forma. La captura
/// del pago es obligatoria.
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
  final _nombreCtrl = TextEditingController();
  final _montoDestinoCtrl = TextEditingController();
  String _formaPago = 'pago_movil';
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
    if (nombre.isEmpty) {
      _toast('Falta el nombre del cliente que recibió');
      return;
    }
    if (_comprobantePagoUrl == null) {
      _toast('Falta la captura del pago');
      return;
    }

    final confirmado = await _confirmarSiHayDescuadre(item, montoDestino, tasa);
    if (!confirmado) return;

    final montoDestinoBs = _parseBolivares(montoDestino);
    final montoDestinoCents = (montoDestinoBs * 100).round();

    setState(() => _enviando = true);
    try {
      final api = ref.read(pagadorApiProvider);
      final res = await api.pagar(EjecutarPagoRequest(
        clientUuid: _clientUuid!,
        operacionId: item.id,
        montoCents: montoDestinoCents.toString(),
        montoDestinoCents: montoDestinoCents.toString(),
        tasaEjecucion: tasa.replaceAll(',', '.'),
        formaPago: _formaPago,
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
          // Resumen del pedido
          TavCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.folio, style: TavText.h2),
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
              ],
            ),
          ),
          const SizedBox(height: TavSpace.md),

          // Datos del beneficiario
          Text('Datos del beneficiario', style: TavText.body.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: TavSpace.xs),
          TavCard(
            child: Column(
              children: [
                _filaCopiable('Nombre', item.beneficiario['nombre']?.toString() ?? '—'),
                _filaCopiable('Documento', item.beneficiario['documento']?.toString() ?? '—'),
                _filaCopiable('Banco', item.beneficiario['banco']?.toString() ?? '—'),
                _filaCopiable('Cuenta', item.beneficiario['cuenta']?.toString() ?? '—'),
                _filaCopiable('Método', item.beneficiario['metodo']?.toString() ?? '—'),
              ],
            ),
          ),
          const SizedBox(height: TavSpace.md),

          // Bolívares entregados
          TavField(
            label: 'Bolívares entregados',
            hint: 'Cuánto recibió el beneficiario',
            controller: _montoDestinoCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
          ),
          const SizedBox(height: TavSpace.md),

          // Tasa de ejecución
          TavField(
            label: 'Tasa de ejecución',
            hint: 'A cómo se ejecutó el cambio (240, 244, 250...)',
            controller: _tasaCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
          ),
          const SizedBox(height: TavSpace.md),

          // Forma de pago
          DropdownButtonFormField<String>(
            initialValue: _formaPago,
            decoration: const InputDecoration(
              labelText: 'Forma de pago',
              border: OutlineInputBorder(),
            ),
            items: const [
              DropdownMenuItem(value: 'pago_movil', child: Text('Pago móvil')),
              DropdownMenuItem(value: 'transferencia', child: Text('Transferencia')),
              DropdownMenuItem(value: 'efectivo', child: Text('Efectivo')),
            ],
            onChanged: (v) {
              if (v != null) setState(() => _formaPago = v);
            },
          ),
          const SizedBox(height: TavSpace.md),

          // Nombre del cliente que recibió
          TavField(
            label: 'Nombre del cliente que recibió',
            hint: 'Nombre y apellido de quien recibió',
            controller: _nombreCtrl,
          ),
          const SizedBox(height: TavSpace.md),

          // Captura del pago — obligatoria
          Text('Captura del pago', style: TavText.body.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: TavSpace.xs),
          Text(
            'Imagen (JPG, PNG, GIF, WEBP) o PDF, máximo 5 MB.',
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

  Widget _filaCopiable(String label, String value) {
    return InkWell(
      onTap: () {
        Clipboard.setData(ClipboardData(text: value));
        _toast('$label copiado');
      },
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: TavText.caption.copyWith(color: TavColors.ink3)),
                  const SizedBox(height: 2),
                  Text(value, style: TavText.body),
                ],
              ),
            ),
            const Icon(Icons.copy, size: 18, color: TavColors.ink3),
          ],
        ),
      ),
    );
  }

  double _parseBolivares(String texto) {
    return double.tryParse(texto.replaceAll('.', '').replaceAll(',', '.')) ?? 0;
  }

  Future<bool> _confirmarSiHayDescuadre(
    ItemColaPagadorDto item,
    String montoDestino,
    String tasa,
  ) async {
    final tasaNum = double.tryParse(tasa.replaceAll(',', '.'));
    if (tasaNum == null || tasaNum <= 0) return true;

    final entregadoBs = _parseBolivares(montoDestino);
    if (entregadoBs <= 0) return true;

    final montoUsd = item.montoOrigenCents / 100.0;
    final esperadoBs = montoUsd * tasaNum;
    if (esperadoBs <= 0) return true;

    final diferencia = (entregadoBs - esperadoBs).abs() / esperadoBs;
    if (diferencia <= 0.02) return true;

    final formatter = NumberFormat.currency(
      locale: 'es_VE',
      symbol: '',
      decimalDigits: 2,
    );

    return await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Revisa los números'),
            content: Text(
              'Según la tasa y el monto enviado, el beneficiario debería haber recibido aproximadamente Bs ${formatter.format(esperadoBs)}.\n\n'
              'Tú anotaste Bs ${formatter.format(entregadoBs)}.\n\n'
              'La diferencia es mayor al 2% — puede deberse a una comisión o redondeo. ¿Quieres continuar?',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: const Text('Corregir'),
              ),
              TextButton(
                onPressed: () => Navigator.of(context).pop(true),
                child: const Text('Continuar'),
              ),
            ],
          ),
        ) ??
        false;
  }
}
