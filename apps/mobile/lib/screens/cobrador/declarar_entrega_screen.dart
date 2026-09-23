import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_button.dart';
import '../../components/tav_card.dart';
import '../../components/tav_field.dart';
import '../../components/tav_kv_row.dart';
import '../../components/tav_money_display.dart';
import '../../data/cobrador_api.dart';
import '../../state/cobrador_state.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_radius.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';

/// Pantalla para declarar la entrega y cerrar el día.
///
/// El cobrador confirma el efectivo que entrega y una nota. El efectivo se
/// deriva del cierre actual (suma de cobros en efectivo). La API no acepta
/// aún el campo "entregadoA" (PENDIENTE DE DEFINIR), así que se muestra en
/// la interfaz pero no se envía.
class DeclararEntregaScreen extends ConsumerStatefulWidget {
  const DeclararEntregaScreen({super.key, required this.cierreId});

  final String cierreId;

  @override
  ConsumerState<DeclararEntregaScreen> createState() =>
      _DeclararEntregaScreenState();
}

class _DeclararEntregaScreenState extends ConsumerState<DeclararEntregaScreen> {
  final _notaCtrl = TextEditingController();
  final _entregadoA = 'Caja Central · Valencia';
  bool _enviando = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _cargar());
  }

  void _cargar() {
    ref.read(cierreActualProvider.notifier).cargar();
  }

  CierreDto? _cierreActual() {
    final state = ref.watch(cierreActualProvider);
    if (state is CobradorDataLoaded<CierreDto>) {
      // Coincide con el cierre id recibido.
      return state.data.id == widget.cierreId ? state.data : null;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final cierre = _cierreActual();
    final efectivo = cierre?.efectivoCents ?? 0;
    final total = cierre?.totalRegistradoCents ?? 0;
    final digital = cierre?.digitalCalculadoCents ?? 0;

    return Scaffold(
      backgroundColor: TavColors.bg,
      body: SafeArea(
        child: Column(
          children: [
            _buildTopBar(),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: TavSpace.xl),
                children: [
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
                          Text('Efectivo que vas a entregar',
                              style: TavText.caption
                                  .copyWith(color: const Color(0xFF9EC0EC))),
                          const SizedBox(height: 6),
                          TavMoneyDisplay(
                            cents: efectivo,
                            color: TavColors.surface,
                            style: TavText.moneyDisplay.copyWith(fontSize: 36),
                            fitted: true,
                          ),
                          const SizedBox(height: 3),
                          Text(
                            'de ${cierre?.cobrosActivos.length ?? 0} cobros registrados hoy',
                            style: TavText.caption
                                .copyWith(color: const Color(0xFF9EC0EC)),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TavCard(
                    child: Column(
                      children: [
                        TavKvRow(
                            label: 'Total registrado', value: formatCents(total)),
                        TavKvRow(
                            label: 'Digital (ya en cuentas)',
                            value: formatCents(digital)),
                        TavKvRow(
                          label: 'Efectivo a entregar',
                          value: formatCents(efectivo),
                          valueColor: TavColors.blue,
                          divider: true,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // PENDIENTE DE DEFINIR: entregadoA no está en EnviarCierreDto.
                  TavField(
                    label: '¿A quién le entregas?',
                    controller: TextEditingController(text: _entregadoA),
                    enabled: false,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'PENDIENTE DE DEFINIR: la API aún no permite elegir destinatario.',
                    style: TavText.caption.copyWith(color: TavColors.ink3),
                  ),

                  const SizedBox(height: TavSpace.md),
                  TavField(
                    label: 'Nota para el administrador (opcional)',
                    placeholder: 'Ej. Pedro Loyo no pagó, quedó para mañana',
                    controller: _notaCtrl,
                    keyboardType: TextInputType.multiline,
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
                            'Después de cerrar no puedes registrar más cobros del día de hoy '
                            'ni modificar la lista. Si falta algún cajero, regístralo antes.',
                            style: TavText.caption.copyWith(
                                color: const Color(0xFF7E570D), height: 1.55),
                          ),
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
              child: TavButton(
                label: 'Confirmar y enviar al admin',
                variant: TavButtonVariant.dark,
                loading: _enviando,
                onPressed: _enviando ? null : _confirmar,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopBar() {
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
          Expanded(child: Text('Declarar entrega', style: TavText.h2)),
        ],
      ),
    );
  }

  Future<void> _confirmar() async {
    final cierre = _cierreActual();
    if (cierre == null || cierre.id == null) {
      _toast('No hay un cierre para enviar.');
      return;
    }
    setState(() => _enviando = true);
    try {
      final api = ref.read(cobradorApiProvider);
      final req = EnviarCierreRequest(
        efectivoDeclaradoCents: cierre.efectivoCents.toString(),
        notaCobrador: _notaCtrl.text.isEmpty ? null : _notaCtrl.text,
      );
      await api.enviarCierre(cierre.id!, req);
      await ref.read(cierreActualProvider.notifier).cargar();
      if (mounted) {
        setState(() => _enviando = false);
        context.pushReplacement(
            '/cobrador/cierre/${cierre.id}/enviado');
      }
    } on DioException catch (e) {
      _toast(e.message ?? 'No pudimos enviar el cierre.');
      if (mounted) setState(() => _enviando = false);
    } catch (_) {
      _toast('No pudimos enviar el cierre.');
      if (mounted) setState(() => _enviando = false);
    }
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
