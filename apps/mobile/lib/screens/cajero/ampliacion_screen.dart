import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_button.dart';
import '../../components/tav_card.dart';
import '../../components/tav_field.dart';
import '../../components/tav_money_display.dart';
import '../../data/cajero_api.dart';
import '../../state/cajero_state.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_radius.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';

/// Solicitud de ampliación de cupo: monto y motivo.
/// POST /cajero/ampliaciones.
class AmpliacionScreen extends ConsumerStatefulWidget {
  const AmpliacionScreen({super.key});

  @override
  ConsumerState<AmpliacionScreen> createState() => _AmpliacionScreenState();
}

class _AmpliacionScreenState extends ConsumerState<AmpliacionScreen> {
  final _montoController = TextEditingController();
  final _motivoController = TextEditingController();
  bool _loading = false;
  bool _enviada = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(resumenProvider.notifier).cargar();
    });
  }

  @override
  void dispose() {
    _montoController.dispose();
    _motivoController.dispose();
    super.dispose();
  }

  bool get _formValido {
    final monto = int.tryParse(_montoController.text.replaceAll(RegExp(r'[^\d]'), ''));
    return monto != null && monto > 0 && _motivoController.text.trim().length >= 3;
  }

  Future<void> _enviar() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    final montoCents = int.parse(_montoController.text.replaceAll(RegExp(r'[^\d]'), '')) * 100;
    final api = ref.read(cajeroApiProvider);

    try {
      await api.solicitarAmpliacion(
        SolicitarAmpliacionRequest(
          montoCents: montoCents.toString(),
          motivo: _motivoController.text.trim(),
        ),
      );
      setState(() {
        _enviada = true;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'No pudimos enviar la solicitud. Intenta de nuevo.';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_enviada) return _buildExito();
    return _buildForm();
  }

  Widget _buildForm() {
    final resumenState = ref.watch(resumenProvider);
    int limite = 0, deuda = 0, disponible = 0;

    if (resumenState is CajeroDataLoaded<ResumenDto>) {
      limite = resumenState.data.limiteCents;
      deuda = resumenState.data.saldoCents;
      disponible = resumenState.data.disponibleCents;
    }

    return Scaffold(
      backgroundColor: TavColors.bg,
      appBar: AppBar(
        backgroundColor: TavColors.surface,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: TavColors.ink),
          onPressed: () => context.pop(),
        ),
        title: Text('Ampliar mi cupo', style: TavText.h2),
        centerTitle: false,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(TavSpace.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TavCard(
                child: Column(
                  children: [
                    _kvRow('Límite actual', formatCents(limite)),
                    _kvRow('Deuda', formatCents(deuda)),
                    const Divider(height: 16),
                    _kvRow('Disponible', formatCents(disponible), valueColor: TavColors.green600),
                  ],
                ),
              ),
              const SizedBox(height: TavSpace.lg),
              TavField(
                label: '¿Cuánto necesitas para esta operación?',
                controller: _montoController,
                placeholder: '1.500',
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: TavSpace.lg),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('¿Para qué es?', style: TavText.label.copyWith(color: TavColors.ink2)),
                  const SizedBox(height: 6),
                  TextFormField(
                    controller: _motivoController,
                    maxLines: 3,
                    decoration: InputDecoration(
                      hintText: 'Ej. un cliente me pidió despachar \$1.500 hoy y lo abona mañana',
                      hintStyle: TavText.body.copyWith(color: TavColors.ink3),
                      filled: true,
                      fillColor: TavColors.surface,
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
                      contentPadding: const EdgeInsets.all(TavSpace.md),
                    ),
                    style: TavText.body,
                  ),
                ],
              ),
              const SizedBox(height: TavSpace.lg),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(TavSpace.lg),
                decoration: BoxDecoration(
                  color: TavColors.gold50,
                  border: Border.all(color: const Color(0xFFF0DFBB)),
                  borderRadius: BorderRadius.circular(TavRadius.card),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.info_outline, color: TavColors.gold700, size: 20),
                    const SizedBox(width: 11),
                    Expanded(
                      child: Text(
                        'La ampliación es para una sola operación. Al usarla se cierra y tu cupo vuelve a ${formatCents(limite)}. Mientras esté activa, tu semáforo se calcula sobre el cupo ampliado.',
                        style: TavText.body2.copyWith(color: TavColors.gold700, height: 1.55, fontSize: 12.5),
                      ),
                    ),
                  ],
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: TavSpace.md),
                Text(_error!, style: TavText.body2.copyWith(color: TavColors.red), textAlign: TextAlign.center),
              ],
              const SizedBox(height: TavSpace.xxl),
              TavButton(
                label: 'Enviar solicitud',
                loading: _loading,
                onPressed: _formValido && !_loading ? _enviar : null,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildExito() {
    return Scaffold(
      backgroundColor: TavColors.bg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(TavSpace.xl),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 80,
                height: 80,
                decoration: const BoxDecoration(
                  color: TavColors.gold50,
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.schedule_outlined, color: TavColors.gold700, size: 32),
              ),
              const SizedBox(height: 18),
              Text('Solicitud enviada', style: TavText.h1.copyWith(fontSize: 22)),
              const SizedBox(height: 8),
              Text(
                'El administrador la está revisando. Te avisamos apenas responda.',
                style: TavText.body2.copyWith(color: TavColors.ink3, height: 1.6),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              TavCard(
                child: Column(
                  children: [
                    _kvRow('Cupo solicitado', _montoController.text.isNotEmpty
                        ? '\$${_montoController.text}'
                        : '—'),
                    _kvRow('Vigencia', 'Una sola operación'),
                    const Divider(height: 16),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Estado', style: TavText.body2.copyWith(color: TavColors.ink3, fontSize: 13.5)),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: TavColors.gold50,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            '● Esperando al admin',
                            style: TavText.label.copyWith(color: TavColors.gold700, fontSize: 11.5),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              TavButton(
                label: 'Volver al inicio',
                onPressed: () => context.go('/cajero/inicio'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _kvRow(String label, String value, {Color? valueColor}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TavText.body2.copyWith(color: TavColors.ink3, fontSize: 13.5)),
          Text(
            value,
            style: TavText.body2.copyWith(
              color: valueColor ?? TavColors.ink,
              fontWeight: FontWeight.w600,
              fontSize: 13.5,
            ),
          ),
        ],
      ),
    );
  }
}
