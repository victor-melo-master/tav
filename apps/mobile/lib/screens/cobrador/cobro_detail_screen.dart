import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_button.dart';
import '../../components/tav_card.dart';
import '../../components/tav_chip.dart';
import '../../components/tav_kv_row.dart';
import '../../components/tav_load_state.dart';
import '../../components/tav_money_display.dart';
import '../../data/cobrador_api.dart';
import '../../state/cobrador_state.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';
import '../../utils/cobrador_labels.dart';

/// Detalle de un cobro con anulación.
///
/// Resuelve el cobro desde el cierre actual (GET /cobrador/cierre-actual).
/// Los cobros de cierres anteriores requieren endpoint PENDIENTE DE DEFINIR.
///
/// Muestra los datos del cobro, el respaldo y un botón para anular con motivo
/// mínimo de 10 caracteres.
class CobroDetailScreen extends ConsumerStatefulWidget {
  const CobroDetailScreen({super.key, required this.cobroId});

  final String cobroId;

  @override
  ConsumerState<CobroDetailScreen> createState() => _CobroDetailScreenState();
}

class _CobroDetailScreenState extends ConsumerState<CobroDetailScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _cargar());
  }

  void _cargar() {
    ref.read(cierreActualProvider.notifier).cargar();
    ref.read(cajerosCobradorProvider.notifier).cargar();
  }

  CobroDto? _resolverCobro(CobradorDataState state) {
    if (state is! CobradorDataLoaded<CierreDto>) return null;
    try {
      return state.data.cobros.firstWhere((c) => c.id == widget.cobroId);
    } catch (_) {
      return null;
    }
  }

  String _nombreCajero() {
    final state = ref.watch(cajerosCobradorProvider);
    final cobro = _resolverCobro(ref.watch(cierreActualProvider));
    if (cobro == null || state is! CobradorDataLoaded<List<CajeroCobradorDto>>) {
      return 'Cajero';
    }
    try {
      return state.data.firstWhere((c) => c.id == cobro.cajeroId).nombre;
    } catch (_) {
      return 'Cajero';
    }
  }

  @override
  Widget build(BuildContext context) {
    final cierreState = ref.watch(cierreActualProvider);
    final cobro = _resolverCobro(cierreState);

    return Scaffold(
      backgroundColor: TavColors.bg,
      body: SafeArea(
        child: Column(
          children: [
            _buildTopBar('#${cobro?.folio ?? 'COB'}'),
            Expanded(
              child: TavLoadState(
                isLoading: cierreState is CobradorDataLoading,
                error: cierreState is CobradorDataError
                    ? cierreState.message
                    : (cobro == null && cierreState is! CobradorDataLoading
                        ? 'No encontramos este cobro. Si es antiguo, '
                            'el detalle individual aún no está disponible.'
                        : null),
                onRetry: _cargar,
                child: cobro == null
                    ? const SizedBox.shrink()
                    : _buildContenido(cobro),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopBar(String titulo) {
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
          Expanded(
            child: Text(titulo,
                style: TavText.h2, maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
        ],
      ),
    );
  }

  Widget _buildContenido(CobroDto cobro) {
    final nombreCajero = _nombreCajero();
    final currency = cobro.moneda == 'BS' ? TavMoneyCurrency.bsd : TavMoneyCurrency.usd;
    final cajerosState = ref.watch(cajerosCobradorProvider);
    String zonaText = 'Sin zona';
    if (cajerosState is CobradorDataLoaded<List<CajeroCobradorDto>>) {
      final c = cajerosState.data.firstWhere(
        (c) => c.id == cobro.cajeroId,
        orElse: () => const CajeroCobradorDto(
          id: '',
          nombre: '',
          zona: '',
          saldoCents: 0,
          limiteCents: 0,
          dias: 0,
          pct: 0,
          bloqueado: false,
          semaforo: 'verde',
          motivo: '',
          disponibleCents: 0,
          diasSinConectarse: null,
          atendidoPor: null,
        ),
      );
      zonaText = c.zona ?? 'Sin zona';
    }

    return RefreshIndicator(
      color: TavColors.blue,
      onRefresh: () async => _cargar(),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(
            TavSpace.xl, TavSpace.sm, TavSpace.xl, TavSpace.xxl),
        children: [
          TavCard(
            child: Center(
              child: Column(
                children: [
                  TavChip(
                    label: cobro.anulado ? 'Anulado' : 'Cargado al sistema',
                    state: cobro.anulado ? TavChipState.rojo : TavChipState.verde,
                  ),
                  const SizedBox(height: 10),
                  TavMoneyDisplay(
                    cents: cobro.montoUsdCents,
                    color: cobro.anulado ? TavColors.ink4 : TavColors.ink,
                    style: TavText.moneyDisplay.copyWith(fontSize: 30),
                    fitted: true,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${cobro.metodo.label}${cobro.moneda == 'BS' ? ' · ${formatCents(cobro.montoCents, currency: currency)}' : ''}',
                    style: TavText.body2.copyWith(color: TavColors.ink3),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: TavSpace.lg),
          Text('Detalle',
              style: TavText.overline.copyWith(color: TavColors.ink3)),
          const SizedBox(height: TavSpace.sm),
          TavCard(
            child: Column(
              children: [
                TavKvRow(label: 'Cajero', value: nombreCajero),
                TavKvRow(label: 'Hora', value: horaAmPm(cobro.creadoAt)),
                TavKvRow(label: 'Zona', value: zonaText),
                const TavKvRow(label: 'Cobrador', value: 'Tú'),
                TavKvRow(
                  label: 'Sincronizado',
                  value: cobro.sincronizadoAt != null
                      ? 'Sí · ${horaAmPm(cobro.sincronizadoAt!)}'
                      : 'Pendiente',
                  valueColor: cobro.sincronizadoAt != null
                      ? TavColors.green600
                      : TavColors.gold700,
                  divider: true,
                ),
                if (!cobro.anulado) ...[
                  TavKvRow(
                    label: 'Deuda antes',
                    value: formatCents(cajerosState is CobradorDataLoaded<List<CajeroCobradorDto>>
                        ? _deudaAntes(cobro, cajerosState.data)
                        : 0),
                  ),
                  TavKvRow(
                    label: 'Deuda después',
                    value: formatCents(cajerosState is CobradorDataLoaded<List<CajeroCobradorDto>>
                        ? _deudaDespues(cobro, cajerosState.data)
                        : 0),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: TavSpace.lg),
          Text('Respaldo',
              style: TavText.overline.copyWith(color: TavColors.ink3)),
          const SizedBox(height: TavSpace.sm),
          TavCard(
            child: Row(
              children: [
                Container(
                  width: 42,
                  height: 52,
                  decoration: BoxDecoration(
                    color: const Color(0xFFEDF1F6),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(Icons.camera_alt_outlined,
                      color: TavColors.ink4, size: 20),
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'recibo_${cobro.folio.toLowerCase().replaceAll('-', '_')}.jpg',
                        style: TavText.body
                            .copyWith(fontSize: 13.5, fontWeight: FontWeight.w600),
                      ),
                      // PENDIENTE DE DEFINIR: adjuntos no expuestos aún.
                      Text(
                        'Subir comprobante · PENDIENTE DE DEFINIR',
                        style: TavText.caption.copyWith(color: TavColors.ink3),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: TavSpace.lg),
          TavButton(
            label: 'Compartir recibo',
            variant: TavButtonVariant.outline,
            icon: const Icon(Icons.share_outlined, size: 20),
            onPressed: () {},
          ),
          const SizedBox(height: 10),
          TavButton(
            label: 'Anular este cobro',
            variant: TavButtonVariant.text,
            icon: Icon(Icons.delete_outline,
                color: cobro.anulado ? TavColors.ink4 : TavColors.red700,
                size: 20),
            onPressed: cobro.anulado
                ? null
                : () => context.push('/cobrador/cobro/${cobro.id}/anular'),
          ),
          const SizedBox(height: 12),
          Text(
            'Los cobros no se borran. Una anulación queda en la lista con su motivo y el administrador la ve.',
            style: TavText.caption
                .copyWith(color: TavColors.ink3, height: 1.5),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  int _deudaAntes(CobroDto cobro, List<CajeroCobradorDto> cajeros) {
    final cajero = cajeros.where((c) => c.id == cobro.cajeroId).firstOrNull;
    if (cajero == null) return 0;
    return cajero.saldoCents + cobro.montoUsdCents;
  }

  int _deudaDespues(CobroDto cobro, List<CajeroCobradorDto> cajeros) {
    final cajero = cajeros.where((c) => c.id == cobro.cajeroId).firstOrNull;
    if (cajero == null) return 0;
    return cajero.saldoCents;
  }
}
