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
/// El pagador escribe tres cosas al marcar una operación como pagada:
/// - tasaEjecucion: la tasa real de ese pago (240, 244, 250...). No se
///   precarga con la cotizada: si se precarga nadie la cambia y el dato
///   pierde valor.
/// - formaPago: pago móvil, transferencia, efectivo.
/// - nombreCliente: el nombre del cliente que recibió.
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
  bool _enviando = false;
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

  Future<void> _pagar() async {
    final item = _item;
    if (item == null) return;

    final tasa = _tasaCtrl.text.trim();
    final forma = _formaPagoCtrl.text.trim();
    final nombre = _nombreCtrl.text.trim();

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

    setState(() => _enviando = true);
    try {
      final api = ref.read(pagadorApiProvider);
      final res = await api.pagar(EjecutarPagoRequest(
        clientUuid: _clientUuid!,
        operacionId: item.id,
        montoCents: item.montoDestinoCents.toString(),
        tasaEjecucion: tasa.replaceAll(',', '.'),
        formaPago: forma,
        nombreCliente: nombre,
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
