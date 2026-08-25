import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_button.dart';
import '../../components/tav_card.dart';
import '../../components/tav_chip.dart';
import '../../components/tav_money_display.dart';
import '../../data/cajero_api.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';
import '../../utils/labels.dart';

/// Detalle de una operación con la línea de tiempo de estados.
class OperacionDetailScreen extends ConsumerStatefulWidget {
  const OperacionDetailScreen({super.key, required this.operacionId});

  final String operacionId;

  @override
  ConsumerState<OperacionDetailScreen> createState() =>
      _OperacionDetailScreenState();
}

class _OperacionDetailScreenState extends ConsumerState<OperacionDetailScreen> {
  OperacionDto? _operacion;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _cargar());
  }

  Future<void> _cargar() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final api = ref.read(cajeroApiProvider);
      final pagina = await api.operaciones(limit: 100);
      final op = pagina.items.where((o) => o.id == widget.operacionId).firstOrNull;
      if (op != null) {
        setState(() {
          _operacion = op;
          _loading = false;
        });
      } else {
        setState(() {
          _error = 'No encontramos esta operación.';
          _loading = false;
        });
      }
    } catch (e) {
      setState(() {
        _error = 'No pudimos cargar la operación.';
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
          onPressed: () => context.pop(),
        ),
        title: Text(
          _operacion != null ? 'Operación #${_operacion!.folio}' : 'Operación',
          style: TavText.h2,
        ),
        centerTitle: false,
      ),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator(color: TavColors.blue))
            : _error != null
                ? Center(
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
                  )
                : _buildContenido(),
      ),
    );
  }

  Widget _buildContenido() {
    final op = _operacion!;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(TavSpace.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Resumen
          TavCard(
            child: Center(
              child: Column(
                children: [
                  TavChip(
                    label: op.estado.estadoLabel,
                    state: _chipState(op.estado),
                  ),
                  const SizedBox(height: 10),
                  TavMoneyDisplay(
                    cents: op.montoDestinoCents,
                    currency: TavMoneyCurrency.bsd,
                    style: TavText.moneyDisplay.copyWith(fontSize: 30),
                    fitted: true,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Enviaste ${formatCents(op.montoOrigenCents, currency: op.monedaOrigen == 'USDT' ? TavMoneyCurrency.usdt : TavMoneyCurrency.usd)}',
                    style: TavText.body2.copyWith(color: TavColors.ink3),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: TavSpace.lg),
          // Timeline
          Text('Seguimiento', style: TavText.overline.copyWith(color: TavColors.ink3)),
          const SizedBox(height: TavSpace.sm),
          TavCard(child: _buildTimeline(op)),
          const SizedBox(height: TavSpace.lg),
          // Datos
          Text('Datos de la operación', style: TavText.overline.copyWith(color: TavColors.ink3)),
          const SizedBox(height: TavSpace.sm),
          TavCard(
            child: Column(
              children: [
                _kvRow('Tipo', tipoOperacionLabel(op.tipo)),
                _kvRow('Tasa aplicada', '${_formatTasa(op.tasaAplicada)} Bs'),
                _kvRow('Fecha y hora', _fechaHora(op.creadaAt)),
                const Divider(height: 16),
                _kvRow('Beneficiario', op.beneficiario.nombre),
                _kvRow('Cuenta destino', '${op.beneficiario.banco} · ${op.beneficiario.cuenta}'),
              ],
            ),
          ),
          if (op.anuladaAt != null) ...[
            const SizedBox(height: TavSpace.lg),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(TavSpace.lg),
              decoration: BoxDecoration(
                color: TavColors.red50,
                border: Border.all(color: const Color(0xFFF3C9C6)),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Operación anulada', style: TavText.h2.copyWith(fontSize: 14, color: TavColors.red700)),
                  const SizedBox(height: 5),
                  if (op.motivoAnulacion != null)
                    Text(
                      op.motivoAnulacion!,
                      style: TavText.body2.copyWith(color: TavColors.red700, fontSize: 12.5),
                    ),
                ],
              ),
            ),
          ],
          const SizedBox(height: TavSpace.xxl),
          TavButton(
            label: 'Volver al inicio',
            variant: TavButtonVariant.text,
            onPressed: () => context.go('/cajero/inicio'),
          ),
        ],
      ),
    );
  }

  Widget _buildTimeline(OperacionDto op) {
    final pasos = <_TimelineStep>[];

    // Siempre: registrada
    pasos.add(_TimelineStep(
      titulo: 'Operación registrada',
      subtitulo: _fechaHora(op.creadaAt),
      estado: _TimelineEstado.completado,
    ));

    // Comprobante
    if (op.comprobanteUrl != null) {
      pasos.add(const _TimelineStep(
        titulo: 'Comprobante recibido',
        subtitulo: 'Verificado',
        estado: _TimelineEstado.completado,
      ));
    }

    // Estado actual
    if (op.estado == 'en_verificacion' || op.estado == 'en_proceso') {
      pasos.add(const _TimelineStep(
        titulo: 'Verificando pago',
        subtitulo: 'En curso · el operador está validando',
        estado: _TimelineEstado.actual,
      ));
      pasos.add(const _TimelineStep(
        titulo: 'Dinero entregado',
        subtitulo: 'Pendiente',
        estado: _TimelineEstado.pendiente,
      ));
    } else if (op.estado == 'completada') {
      pasos.add(const _TimelineStep(
        titulo: 'Pago verificado',
        subtitulo: 'Confirmado',
        estado: _TimelineEstado.completado,
      ));
      pasos.add(const _TimelineStep(
        titulo: 'Dinero entregado',
        subtitulo: 'Completado',
        estado: _TimelineEstado.completado,
      ));
    } else if (op.estado == 'observada') {
      pasos.add(const _TimelineStep(
        titulo: 'Operación observada',
        subtitulo: 'Requiere revisión',
        estado: _TimelineEstado.actual,
      ));
    } else if (op.estado == 'rechazada') {
      pasos.add(const _TimelineStep(
        titulo: 'Operación rechazada',
        subtitulo: 'No se completó',
        estado: _TimelineEstado.rechazado,
      ));
    } else if (op.estado == 'anulada') {
      pasos.add(_TimelineStep(
        titulo: 'Operación anulada',
        subtitulo: op.motivoAnulacion ?? 'Anulada',
        estado: _TimelineEstado.rechazado,
      ));
    }

    return Column(
      children: pasos.map((p) {
        final isLast = pasos.indexOf(p) == pasos.length - 1;
        return _TimelineNode(step: p, isLast: isLast);
      }).toList(),
    );
  }

  TavChipState _chipState(String estado) => switch (estado) {
        'en_verificacion' => TavChipState.azul,
        'en_proceso' => TavChipState.azul,
        'completada' => TavChipState.verde,
        'observada' => TavChipState.ambar,
        'rechazada' => TavChipState.rojo,
        'anulada' => TavChipState.gris,
        _ => TavChipState.gris,
      };

  Widget _kvRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TavText.body2.copyWith(color: TavColors.ink3, fontSize: 13.5)),
          Flexible(
            child: Text(
              value,
              style: TavText.body2.copyWith(fontWeight: FontWeight.w600, fontSize: 13.5),
              textAlign: TextAlign.right,
            ),
          ),
        ],
      ),
    );
  }

  String _fechaHora(DateTime d) {
    const meses = [
      'ene', 'feb', 'mar', 'abr', 'may', 'jun',
      'jul', 'ago', 'sep', 'oct', 'nov', 'dic'
    ];
    final h = d.hour.toString().padLeft(2, '0');
    final m = d.minute.toString().padLeft(2, '0');
    return '${d.day} ${meses[d.month - 1]} · $h:$m';
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
}

enum _TimelineEstado { completado, actual, pendiente, rechazado }

class _TimelineStep {
  const _TimelineStep({
    required this.titulo,
    required this.subtitulo,
    required this.estado,
  });
  final String titulo;
  final String subtitulo;
  final _TimelineEstado estado;
}

class _TimelineNode extends StatelessWidget {
  const _TimelineNode({required this.step, required this.isLast});

  final _TimelineStep step;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final (color, icon) = switch (step.estado) {
      _TimelineEstado.completado => (TavColors.green600, Icons.check),
      _TimelineEstado.actual => (TavColors.blue, Icons.circle),
      _TimelineEstado.pendiente => (TavColors.ink4, Icons.circle_outlined),
      _TimelineEstado.rechazado => (TavColors.red700, Icons.close),
    };

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Punto + línea
        Column(
          children: [
            Container(
              width: 24,
              height: 24,
              decoration: BoxDecoration(
                color: step.estado == _TimelineEstado.completado || step.estado == _TimelineEstado.actual
                    ? color
                    : Colors.transparent,
                border: Border.all(color: color, width: 2),
                shape: BoxShape.circle,
              ),
              child: step.estado == _TimelineEstado.actual
                  ? Center(
                      child: Container(
                        width: 8,
                        height: 8,
                        decoration: const BoxDecoration(color: TavColors.surface, shape: BoxShape.circle),
                      ),
                    )
                  : step.estado == _TimelineEstado.completado || step.estado == _TimelineEstado.rechazado
                      ? Icon(icon, color: TavColors.surface, size: 14)
                      : null,
            ),
            if (!isLast)
              Container(
                width: 2,
                height: 32,
                color: step.estado == _TimelineEstado.completado ? TavColors.green600 : TavColors.line,
              ),
          ],
        ),
        const SizedBox(width: 12),
        // Texto
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  step.titulo,
                  style: TavText.body.copyWith(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: step.estado == _TimelineEstado.pendiente ? TavColors.ink3 : TavColors.ink,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  step.subtitulo,
                  style: TavText.caption.copyWith(
                    color: TavColors.ink3,
                    fontSize: 11.5,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
