import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../components/tav_button.dart';
import '../../components/tav_card.dart';
import '../../components/tav_chip.dart';
import '../../components/tav_kv_row.dart';
import '../../components/tav_load_state.dart';
import '../../components/tav_money_display.dart';
import '../../components/tav_progress_bar.dart';
import '../../data/cobrador_api.dart';
import '../../state/auth_state.dart';
import '../../state/cobrador_state.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_radius.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';
import '../../utils/cobrador_labels.dart';

/// Detalle del cajero visto por el cobrador.
///
/// Muestra deuda, límite, semáforo, contacto y ubicación. Botones para
/// registrar cobro, marcar "lo estoy atendiendo" con POST /cobrador/atenciones,
/// y enviar aviso manual con POST /cobrador/avisos.
///
/// No muestra el historial de operaciones del cajero: al cobrador solo le
/// importa cuánto debe.
///
class CajeroDetailScreen extends ConsumerStatefulWidget {
  const CajeroDetailScreen({super.key, required this.cajeroId});

  final String cajeroId;

  @override
  ConsumerState<CajeroDetailScreen> createState() =>
      _CajeroDetailScreenState();
}

class _CajeroDetailScreenState extends ConsumerState<CajeroDetailScreen> {
  bool _atencionLoading = false;
  bool _avisoLoading = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _cargar());
  }

  void _cargar() {
    ref.read(cajerosCobradorProvider.notifier).cargar();
  }

  CajeroCobradorDto? _resolverCajero(CobradorDataState state) {
    if (state is! CobradorDataLoaded<List<CajeroCobradorDto>>) return null;
    try {
      return state.data.firstWhere((c) => c.id == widget.cajeroId);
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final cajerosState = ref.watch(cajerosCobradorProvider);
    final cajero = _resolverCajero(cajerosState);

    return Scaffold(
      backgroundColor: TavColors.bg,
      body: SafeArea(
        child: Column(
          children: [
            _buildTopBar(cajero?.nombre ?? 'Cajero'),
            Expanded(
              child: TavLoadState(
                isLoading: cajerosState is CobradorDataLoading,
                error: cajerosState is CobradorDataError
                    ? cajerosState.message
                    : (cajero == null && cajerosState is! CobradorDataLoading
                        ? 'No encontramos este cajero.'
                        : null),
                onRetry: _cargar,
                child: cajero == null
                    ? const SizedBox.shrink()
                    : _buildContenido(cajero),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopBar(String nombre) {
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
              child: const Icon(Icons.arrow_back, color: TavColors.ink, size: 20),
            ),
          ),
          const SizedBox(width: TavSpace.md),
          Expanded(
            child: Text(nombre, style: TavText.h2, maxLines: 1,
                overflow: TextOverflow.ellipsis),
          ),
        ],
      ),
    );
  }

  Widget _buildContenido(CajeroCobradorDto c) {
    final authState = ref.watch(authProvider);
    final miId =
        authState is AuthAuthenticated ? authState.usuario.id : '';
    final loAtiendoYo =
        c.atendidoPor != null && c.atendidoPor!.cobradorId == miId;
    final otroLoAtiende =
        c.atendidoPor != null && c.atendidoPor!.cobradorId != miId;
    final pct = (c.pct * 100).round();
    final semColor = semaforoColor(c.semaforo);
    final chip = semaforoChipState(c.semaforo);

    return RefreshIndicator(
      color: TavColors.blue,
      onRefresh: () async => _cargar(),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(
            TavSpace.xl, TavSpace.sm, TavSpace.xl, TavSpace.xxl),
        children: [
          // Tarjeta navy de deuda
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment(0.0, -1.0),
                end: Alignment(0.9, 1.0),
                colors: [TavColors.navy, Color(0xFF1B4272)],
              ),
              borderRadius: BorderRadius.circular(TavRadius.card),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text('Debe',
                          style: TavText.caption
                              .copyWith(color: const Color(0xFF9EC0EC))),
                    ),
                    TavChip(label: '● ${c.motivo}', state: chip),
                  ],
                ),
                const SizedBox(height: 5),
                TavMoneyDisplay(
                  cents: c.saldoCents,
                  color: TavColors.surface,
                  style: TavText.moneyDisplay.copyWith(fontSize: 32),
                  fitted: true,
                ),
                const SizedBox(height: 2),
                Text(
                  'de un límite de ${formatCents(c.limiteCents)}',
                  style: TavText.caption.copyWith(color: const Color(0xFF9EC0EC)),
                ),
                const SizedBox(height: 14),
                TavProgressBar(
                  progress: c.pct.clamp(0.0, 1.0),
                  color: semColor,
                  height: 7,
                ),
                const SizedBox(height: 7),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '$pct% del límite consumido',
                      style: TavText.caption
                          .copyWith(color: const Color(0xFF9EC0EC)),
                    ),
                    Text(
                      '${c.dias} día${c.dias == 1 ? '' : 's'}',
                      style: TavText.caption
                          .copyWith(color: const Color(0xFF9EC0EC)),
                    ),
                  ],
                ),
              ],
            ),
          ),

          // Bandera de atención
          if (c.atendidoPor != null) ...[
            const SizedBox(height: TavSpace.md),
            _buildBanderaAtencion(loAtiendoYo, otroLoAtiende, c),
          ],

          // Botón registrar cobro
          const SizedBox(height: TavSpace.md),
          TavButton(
            label: 'Registrar cobro',
            variant: TavButtonVariant.green,
            icon: const Icon(Icons.payments, size: 20),
            onPressed: () =>
                context.push('/cobrador/cajero/${c.id}/cobro'),
          ),

          // Botón atención
          const SizedBox(height: 10),
          TavButton(
            label: loAtiendoYo
                ? 'Ya no lo estoy atendiendo'
                : (otroLoAtiende ? 'Atenderlo yo' : 'Marcar que lo estoy atendiendo'),
            variant: TavButtonVariant.outline,
            icon: const Icon(Icons.push_pin_outlined, size: 20),
            loading: _atencionLoading,
            onPressed: _atencionLoading
                ? null
                : () => _toggleAtencion(c, loAtiendoYo),
          ),

          // Botones de contacto
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: TavButton(
                  label: 'Llamar',
                  variant: TavButtonVariant.outline,
                  small: true,
                  onPressed: c.telefono != null && c.telefono!.isNotEmpty
                      ? () => _llamar(c.telefono!)
                      : null,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TavButton(
                  label: 'WhatsApp',
                  variant: TavButtonVariant.outline,
                  small: true,
                  onPressed: _waNumero(c.telefono) != null
                      ? () => _abrirWhatsApp(c.telefono!)
                      : null,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TavButton(
                  label: 'Avisar',
                  variant: TavButtonVariant.outline,
                  small: true,
                  loading: _avisoLoading,
                  onPressed: _avisoLoading ? null : () => _enviarAviso(c),
                ),
              ),
            ],
          ),

          // Ubicación
          const SizedBox(height: TavSpace.lg),
          Text('Ubicación',
              style: TavText.overline.copyWith(color: TavColors.ink3)),
          const SizedBox(height: TavSpace.sm),
          TavCard(
            child: Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: TavColors.blue50,
                    borderRadius: BorderRadius.circular(TavRadius.field),
                  ),
                  child: const Icon(Icons.place_outlined,
                      color: TavColors.blue, size: 20),
                ),
                const SizedBox(width: TavSpace.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        c.zona ?? 'Sin zona',
                        style: TavText.body.copyWith(
                            fontSize: 13.5, fontWeight: FontWeight.w600),
                      ),
                      // PENDIENTE DE DEFINIR: dirección detallada no viene en la API.
                      Text(
                        'Zona asignada al cajero',
                        style: TavText.caption.copyWith(color: TavColors.ink3),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Datos
          const SizedBox(height: TavSpace.lg),
          Text('Datos', style: TavText.overline.copyWith(color: TavColors.ink3)),
          const SizedBox(height: TavSpace.sm),
          TavCard(
            child: Column(
              children: [
                TavKvRow(
                  label: 'Límite de crédito',
                  value: formatCents(c.limiteCents),
                ),
                TavKvRow(
                  label: 'Disponible',
                  value: formatCents(c.disponibleCents),
                  valueColor: TavColors.green600,
                  divider: true,
                ),
                TavKvRow(
                  label: 'Días de deuda',
                  value: '${c.dias} día${c.dias == 1 ? '' : 's'}',
                ),
                TavKvRow(
                  label: 'Última conexión',
                  value: _ultimaConexion(c.diasSinConectarse),
                ),
                // PENDIENTE DE DEFINIR: cédula y teléfono no vienen en la API.
              ],
            ),
          ),

          // Nota de privacidad
          const SizedBox(height: TavSpace.md),
          Container(
            padding: const EdgeInsets.all(TavSpace.lg),
            decoration: BoxDecoration(
              color: const Color(0xFFFAFBFC),
              border: Border.all(color: TavColors.line),
              borderRadius: BorderRadius.circular(TavRadius.card),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.shield_outlined,
                    color: TavColors.ink4, size: 20),
                const SizedBox(width: 11),
                Expanded(
                  child: Text(
                    'No ves sus operaciones ni con quién trabaja. Solo cuánto debe '
                    'y desde cuándo — eso es todo lo que necesitas para cobrarle.',
                    style: TavText.caption.copyWith(
                        color: TavColors.ink3, height: 1.55, fontSize: 12),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBanderaAtencion(
      bool loAtiendoYo, bool otroLoAtiende, CajeroCobradorDto c) {
    final (color, bg, border, texto) = loAtiendoYo
        ? (
            TavColors.green600,
            TavColors.green50,
            const Color(0xFFCDEBCE),
            'Lo estás atendiendo. Los demás cobradores lo ven así.',
          )
        : (
            TavColors.gold700,
            TavColors.gold50,
            const Color(0xFFF0DFBB),
            '${c.atendidoPor!.nombre} lo está atendiendo.',
          );
    return Container(
      padding: const EdgeInsets.all(TavSpace.md),
      decoration: BoxDecoration(
        color: bg,
        border: Border.all(color: border),
        borderRadius: BorderRadius.circular(TavRadius.card),
      ),
      child: Row(
        children: [
          Icon(Icons.person_outline, color: color, size: 16),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              texto,
              style: TavText.caption.copyWith(color: color, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }

  String _ultimaConexion(int? diasSin) {
    if (diasSin == null) return 'Sin datos';
    if (diasSin == 0) return 'Hoy';
    if (diasSin == 1) return 'Ayer';
    return 'Hace $diasSin días';
  }

  Future<void> _toggleAtencion(CajeroCobradorDto c, bool loAtiendoYo) async {
    setState(() => _atencionLoading = true);
    try {
      final api = ref.read(cobradorApiProvider);
      if (loAtiendoYo) {
        await api.liberarAtencion(c.id);
        _toast('Ya no aparece como atendido');
      } else {
        await api.marcarAtencion(CrearAtencionRequest(cajeroId: c.id));
        _toast('Marcado · los demás cobradores lo ven');
      }
      await ref.read(cajerosCobradorProvider.notifier).cargar();
    } on DioException catch (e) {
      _toast(e.message ?? 'No pudimos actualizar la atención.');
    } catch (_) {
      _toast('No pudimos actualizar la atención.');
    } finally {
      if (mounted) setState(() => _atencionLoading = false);
    }
  }

  Future<void> _enviarAviso(CajeroCobradorDto c) async {
    setState(() => _avisoLoading = true);
    try {
      final api = ref.read(cobradorApiProvider);
      await api.enviarAviso(CrearAvisoRequest(
        cajeroId: c.id,
        titulo: 'Recordatorio de pago',
        cuerpo:
            'Recuerda abonar para mantener tu semáforo en verde. Deuda actual: '
            '${formatCents(c.saldoCents)}.',
      ));
      _toast('Aviso de cobro enviado a ${c.nombre}');
    } on DioException catch (e) {
      _toast(e.message ?? 'No pudimos enviar el aviso.');
    } catch (_) {
      _toast('No pudimos enviar el aviso.');
    } finally {
      if (mounted) setState(() => _avisoLoading = false);
    }
  }

  String? _waNumero(String? telefono) {
    if (telefono == null || telefono.isEmpty) return null;
    var digits = telefono.replaceAll(RegExp(r'[^0-9]'), '');
    if (digits.isEmpty) return null;
    if (digits.startsWith('0')) {
      digits = '58${digits.substring(1)}';
    } else if (digits.startsWith('58')) {
      // ya internacional
    } else if (!digits.startsWith('1')) {
      digits = '58$digits';
    }
    return digits;
  }

  Future<void> _llamar(String telefono) async {
    final uri = Uri.parse('tel:$telefono');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    } else {
      _toast('No se pudo abrir el marcador.');
    }
  }

  Future<void> _abrirWhatsApp(String telefono) async {
    final numero = _waNumero(telefono);
    if (numero == null) {
      _toast('El número de WhatsApp no es válido.');
      return;
    }
    final uri = Uri.parse('https://wa.me/$numero');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else {
      _toast('No se pudo abrir WhatsApp.');
    }
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: TavColors.navy,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
      ),
    );
  }
}
