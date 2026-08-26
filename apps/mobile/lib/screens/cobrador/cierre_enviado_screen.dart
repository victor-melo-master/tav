import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_button.dart';
import '../../components/tav_card.dart';
import '../../components/tav_chip.dart';
import '../../components/tav_kv_row.dart';
import '../../components/tav_money_display.dart';
import '../../data/cobrador_api.dart';
import '../../state/cobrador_state.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';
import '../../utils/cobrador_labels.dart';

/// Pantalla de confirmación de cierre enviado.
///
/// Se muestra después de POST /cobrador/cierres/:id/enviar. El cierre queda
/// en estado "enviado" y el administrador lo verifica.
class CierreEnviadoScreen extends ConsumerStatefulWidget {
  const CierreEnviadoScreen({super.key, required this.cierreId});

  final String cierreId;

  @override
  ConsumerState<CierreEnviadoScreen> createState() =>
      _CierreEnviadoScreenState();
}

class _CierreEnviadoScreenState extends ConsumerState<CierreEnviadoScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _cargar());
  }

  void _cargar() {
    ref.read(cierreActualProvider.notifier).cargar();
  }

  CierreDto? _resolverCierre() {
    final state = ref.watch(cierreActualProvider);
    if (state is CobradorDataLoaded<CierreDto> &&
        state.data.id == widget.cierreId) {
      return state.data;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final cierre = _resolverCierre();
    return Scaffold(
      backgroundColor: TavColors.bg,
      body: SafeArea(
        child: Column(
          children: [
            _buildTopBar(cierre?.fecha ?? DateTime.now()),
            Expanded(
              child: cierre == null
                  ? const Center(
                      child: CircularProgressIndicator(color: TavColors.blue))
                  : _buildContenido(cierre),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopBar(DateTime fecha) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          TavSpace.lg, TavSpace.md, TavSpace.xl, TavSpace.sm),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => context.go('/cobrador/mi-dia'),
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
            child: Text('Cierre del ${fecha.day} de ${_mes(fecha.month)}',
                style: TavText.h2),
          ),
        ],
      ),
    );
  }

  String _mes(int m) => const [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
      ][m - 1];

  Widget _buildContenido(CierreDto c) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(
          TavSpace.xl, TavSpace.sm, TavSpace.xl, TavSpace.xxl),
      children: [
        TavCard(
          child: Center(
            child: Column(
              children: [
                Container(
                  width: 70,
                  height: 70,
                  decoration: const BoxDecoration(
                    color: TavColors.gold50,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.schedule,
                      color: TavColors.gold, size: 30),
                ),
                const SizedBox(height: 14),
                Text('Lista enviada',
                    style: TavText.h1.copyWith(fontSize: 20)),
                const SizedBox(height: 6),
                Text(
                  'El administrador está verificando tu entrega.',
                  style: TavText.body2.copyWith(color: TavColors.ink3),
                ),
                const SizedBox(height: 14),
                const TavChip(
                    label: '● En verificación', state: TavChipState.azul),
              ],
            ),
          ),
        ),
        const SizedBox(height: TavSpace.lg),
        Text('Seguimiento',
            style: TavText.overline.copyWith(color: TavColors.ink3)),
        const SizedBox(height: TavSpace.sm),
        TavCard(
          child: Column(
            children: [
              _TimelineStep(
                titulo: 'Cobros registrados',
                subtitulo:
                    '${c.cobros.length} registros · ${formatCents(c.totalRegistradoCents)}',
                completado: true,
              ),
              _TimelineStep(
                titulo: 'Lista cerrada y enviada',
                subtitulo:
                    'Hoy · ${c.enviadoAt != null ? horaAmPm(c.enviadoAt!) : ''}',
                completado: true,
              ),
              const _TimelineStep(
                titulo: 'Verificación del administrador',
                subtitulo: 'Compara el efectivo entregado contra lo declarado',
                completado: false,
                actual: true,
              ),
              const _TimelineStep(
                titulo: 'Cierre conforme',
                subtitulo: 'Pendiente',
                completado: false,
              ),
            ],
          ),
        ),
        const SizedBox(height: TavSpace.lg),
        TavCard(
          child: Column(
            children: [
              TavKvRow(
                  label: 'Declarado en efectivo',
                  value: formatCents(c.efectivoDeclaradoCents)),
              TavKvRow(
                  label: 'Digital', value: formatCents(c.digitalCents)),
              const TavKvRow(label: 'Entregado a', value: 'Caja Central · Valencia'),
            ],
          ),
        ),
        const SizedBox(height: TavSpace.lg),
        TavButton(
          label: 'Descargar lista en PDF',
          variant: TavButtonVariant.outline,
          icon: const Icon(Icons.description_outlined, size: 20),
          onPressed: () {},
        ),
        const SizedBox(height: 4),
        TavButton(
          label: 'Volver a mi día',
          variant: TavButtonVariant.text,
          onPressed: () => context.go('/cobrador/mi-dia'),
        ),
      ],
    );
  }
}

class _TimelineStep extends StatelessWidget {
  const _TimelineStep({
    required this.titulo,
    required this.subtitulo,
    required this.completado,
    this.actual = false,
  });

  final String titulo;
  final String subtitulo;
  final bool completado;
  final bool actual;

  @override
  Widget build(BuildContext context) {
    final color = completado
        ? TavColors.green600
        : actual
            ? TavColors.blue
            : TavColors.ink4;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 24,
            height: 24,
            decoration: BoxDecoration(
              color: completado || actual ? color : Colors.transparent,
              border: Border.all(color: color, width: 2),
              shape: BoxShape.circle,
            ),
            child: completado
                ? const Icon(Icons.check, color: TavColors.surface, size: 14)
                : actual
                    ? Center(
                        child: Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(
                            color: TavColors.surface,
                            shape: BoxShape.circle,
                          ),
                        ),
                      )
                    : null,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  titulo,
                  style: TavText.body.copyWith(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: actual || completado ? TavColors.ink : TavColors.ink3,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitulo,
                  style: TavText.caption.copyWith(color: TavColors.ink3),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
