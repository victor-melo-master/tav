import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_button.dart';
import '../../components/tav_card.dart';
import '../../components/tav_chip.dart';
import '../../components/tav_list_row.dart';
import '../../components/tav_load_state.dart';
import '../../components/tav_money_display.dart';
import '../../components/tav_progress_bar.dart';
import '../../data/cajero_api.dart';
import '../../state/auth_state.dart';
import '../../state/cajero_state.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_radius.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';
import '../../utils/labels.dart';

/// Pantalla de inicio del cajero.
///
/// Muestra: crédito disponible (no deuda), deuda y porcentaje usado,
/// semáforo de dos ejes, barra de progreso, tarjeta roja de bloqueo
/// cuando disponible llega a cero, tasa del día, accesos rápidos y
/// últimas operaciones.
///
/// Datos de GET /cajero/resumen + GET /tasas/vigentes + GET /cajero/operaciones.
class CajeroInicioScreen extends ConsumerStatefulWidget {
  const CajeroInicioScreen({super.key});

  @override
  ConsumerState<CajeroInicioScreen> createState() =>
      _CajeroInicioScreenState();
}

class _CajeroInicioScreenState extends ConsumerState<CajeroInicioScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(resumenProvider.notifier).cargar();
      ref.read(tasasProvider.notifier).cargar();
      ref.read(operacionesProvider.notifier).cargar();
    });
  }

  void _recargar() {
    ref.read(resumenProvider.notifier).cargar();
    ref.read(tasasProvider.notifier).cargar();
    ref.read(operacionesProvider.notifier).cargar();
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final nombre = authState is AuthAuthenticated
        ? authState.usuario.nombre
        : '';
    final resumenState = ref.watch(resumenProvider);
    final tasasState = ref.watch(tasasProvider);
    final opsState = ref.watch(operacionesProvider);

    return Scaffold(
      backgroundColor: TavColors.bg,
      body: SafeArea(
        child: RefreshIndicator(
          color: TavColors.blue,
          onRefresh: () async => _recargar(),
          child: CustomScrollView(
            slivers: [
              SliverToBoxAdapter(child: _buildTopBar(nombre)),
              SliverToBoxAdapter(
                child: TavLoadState(
                  isLoading: resumenState is CajeroDataLoading,
                  error: resumenState is CajeroDataError
                      ? resumenState.message
                      : null,
                  onRetry: _recargar,
                  child: _buildResumen(resumenState),
                ),
              ),
              SliverToBoxAdapter(child: _buildTasa(tasasState)),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(
                      TavSpace.xl, TavSpace.md, TavSpace.xl, TavSpace.sm),
                  child: TavButton(
                    label: 'Nueva operación',
                    variant: TavButtonVariant.primary,
                    icon: const Icon(Icons.add, size: 20),
                    onPressed: () => context.push('/cajero/operacion/tipo'),
                  ),
                ),
              ),
              SliverToBoxAdapter(child: _buildAccesos(context)),
              SliverToBoxAdapter(child: _buildUltimasOps(opsState)),
              const SliverToBoxAdapter(child: SizedBox(height: TavSpace.xxl)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTopBar(String nombre) {
    final iniciales = inicialesNombre(nombre);
    final saludo = _saludo();
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          TavSpace.xl, TavSpace.md, TavSpace.xl, TavSpace.sm),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => context.push('/cajero/perfil'),
            child: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: TavColors.navy,
                borderRadius: BorderRadius.circular(13),
              ),
              child: Center(
                child: Text(
                  iniciales,
                  style: TavText.label.copyWith(
                    color: TavColors.surface,
                    fontSize: 14,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: TavSpace.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(saludo, style: TavText.caption.copyWith(color: TavColors.ink3)),
                Text(nombre, style: TavText.h2.copyWith(fontSize: 15)),
              ],
            ),
          ),
          GestureDetector(
            onTap: () => context.push('/cajero/notificaciones'),
            child: const Icon(
              Icons.notifications_outlined,
              color: TavColors.ink2,
              size: 24,
            ),
          ),
        ],
      ),
    );
  }

  String _saludo() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
  }

  Widget _buildResumen(CajeroDataState state) {
    if (state is! CajeroDataLoaded<ResumenDto>) return const SizedBox.shrink();
    final r = state.data;
    final sem = r.semaforo;
    final pctUsado = r.limiteCents > 0
        ? (r.saldoCents / r.limiteCents).clamp(0.0, 1.0)
        : 0.0;
    final bloqueado = sem.bloqueado;
    // Color único del semáforo, derivado del estado que calcula el servidor.
    final semColor = _colorSemaforo(sem.estado);
    // Texto de días: "Día N de 7" dentro del límite, "Vencida hace N días" si supera.
    final diasTexto = sem.dias > 7
        ? 'Vencida hace ${sem.dias - 7} días'
        : 'Día ${sem.dias} de 7';

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: TavSpace.xl),
      child: Column(
        children: [
          // Tarjeta navy de crédito disponible
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
                      child: Text(
                        'Crédito disponible para operar',
                        style: TavText.caption.copyWith(color: const Color(0xFF9EC0EC)),
                      ),
                    ),
                    if (sem.dias > 0)
                      TavChip(
                        label: '● ${sem.dias} días',
                        state: _chipStateSemaforo(sem.estado),
                      ),
                  ],
                ),
                const SizedBox(height: 6),
                TavMoneyDisplay(
                  cents: r.disponibleCents,
                  color: TavColors.surface,
                  style: TavText.moneyDisplay.copyWith(fontSize: 33),
                  fitted: true,
                ),
                const SizedBox(height: 2),
                Text(
                  'de un límite de ${formatCents(r.limiteCents)}',
                  style: TavText.caption.copyWith(color: const Color(0xFF9EC0EC)),
                ),
                const SizedBox(height: 16),
                TavProgressBar(
                  progress: pctUsado,
                  color: semColor,
                  height: 7,
                ),
                const SizedBox(height: 7),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Debes ${formatCents(r.saldoCents)} · ${(pctUsado * 100).toInt()}% usado',
                        style: TavText.caption.copyWith(
                          color: const Color(0xFF9EC0EC),
                          fontSize: 11,
                        ),
                      ),
                    ),
                    if (sem.dias > 0)
                      Text(
                        diasTexto,
                        style: TavText.caption.copyWith(
                          color: const Color(0xFF9EC0EC),
                          fontSize: 11,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 16),
              ],
            ),
          ),

          // Tarjeta roja de bloqueo
          if (bloqueado) ...[
            const SizedBox(height: TavSpace.md),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(TavSpace.lg),
              decoration: BoxDecoration(
                color: TavColors.red50,
                border: Border.all(color: const Color(0xFFF3C9C6)),
                borderRadius: BorderRadius.circular(TavRadius.card),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.lock_outline, color: TavColors.red700, size: 20),
                      const SizedBox(width: 11),
                      Expanded(
                        child: Text(
                          'Sin crédito disponible',
                          style: TavText.h2.copyWith(
                            fontSize: 14,
                            color: TavColors.red700,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 5),
                  Padding(
                    padding: const EdgeInsets.only(left: 31),
                    child: Text(
                      'Llegaste a tu límite de ${formatCents(r.limiteCents)}. '
                      'No puedes registrar operaciones nuevas hasta que abones '
                      'o el administrador te amplíe el cupo.',
                      style: TavText.body2.copyWith(
                        color: TavColors.red700,
                        fontSize: 12.5,
                        height: 1.55,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TavButton(
                    label: 'Solicitar ampliación',
                    variant: TavButtonVariant.outline,
                    small: true,
                    onPressed: () => context.push('/cajero/ampliacion'),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildTasa(CajeroDataState state) {
    TasaDto? usdtBs;
    if (state is CajeroDataLoaded<List<TasaDto>>) {
      for (final t in state.data) {
        if (t.par == 'USDT_BS') {
          usdtBs = t;
          break;
        }
      }
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(
          TavSpace.xl, TavSpace.md, TavSpace.xl, TavSpace.sm),
      child: TavCard(
        onTap: () => context.push('/cajero/tasas'),
        child: Row(
          children: [
            // Icono de moneda genérica (no Bitcoin).
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: TavColors.green50,
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.monetization_on_outlined,
                  color: TavColors.green600, size: 20),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Tasa de hoy · USDT → Bs',
                    style: TavText.caption.copyWith(color: TavColors.ink3),
                  ),
                  if (usdtBs != null)
                    // "Bs" pegado al número, no suelto a la derecha.
                    RichText(
                      text: TextSpan(
                        children: [
                          TextSpan(
                            text: _formatTasa(usdtBs.valor),
                            style: TavText.h2.copyWith(
                              fontSize: 18,
                              color: TavColors.ink,
                            ),
                          ),
                          TextSpan(
                            text: ' Bs',
                            style: TavText.caption.copyWith(
                              fontSize: 12,
                              color: TavColors.ink3,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    )
                  else
                    Text(
                      state is CajeroDataLoading ? '...' : '—',
                      style: TavText.h2.copyWith(fontSize: 18, color: TavColors.ink3),
                    ),
                ],
              ),
            ),
            // Columna derecha: variación y "hace X min".
            if (usdtBs != null)
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  // PENDIENTE DE DEFINIR: el servidor no expone la variación
                  // porcentual de la tasa. Cuando /tasas/vigentes incluya el
                  // cambio respecto a la tasa anterior, mostrar aquí un chip
                  // verde "↑ 0,8%" o rojo "↓ 0,3%" según el signo.
                  Text(
                    _haceTexto(usdtBs.vigenteDesde),
                    style: TavText.caption.copyWith(
                      color: TavColors.ink3,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  /// "hace X min" / "hace X h" / "hace X d" desde la fecha dada.
  String _haceTexto(DateTime desde) {
    final diff = DateTime.now().difference(desde);
    if (diff.inMinutes < 1) return 'ahora';
    if (diff.inMinutes < 60) return 'hace ${diff.inMinutes} min';
    if (diff.inHours < 24) return 'hace ${diff.inHours} h';
    return 'hace ${diff.inDays} d';
  }

  Widget _buildAccesos(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          TavSpace.xl, TavSpace.md, TavSpace.xl, TavSpace.sm),
      child: Row(
        children: [
          Expanded(
            child: _AccesoRapido(
              icon: Icons.group_outlined,
              label: 'Beneficiarios',
              onTap: () => context.push('/cajero/beneficiarios'),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _AccesoRapido(
              icon: Icons.receipt_long_outlined,
              label: 'Estado de cuenta',
              onTap: () => context.go('/cajero/cuenta'),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _AccesoRapido(
              icon: Icons.support_agent_outlined,
              label: 'Soporte',
              onTap: () => context.push('/cajero/soporte'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildUltimasOps(CajeroDataState state) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
              TavSpace.xl, TavSpace.lg, TavSpace.xl, TavSpace.sm),
          child: Row(
            children: [
              Text('Últimas operaciones', style: TavText.overline.copyWith(color: TavColors.ink3)),
              const Spacer(),
              GestureDetector(
                onTap: () => context.push('/cajero/operaciones'),
                child: Text(
                  'Ver todas',
                  style: TavText.caption.copyWith(color: TavColors.blue),
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: TavSpace.xl),
          child: TavLoadState(
            isLoading: state is CajeroDataLoading,
            error: state is CajeroDataError
                ? state.message
                : null,
            onRetry: _recargar,
            emptyCheck: () {
              if (state is CajeroDataLoaded) {
                final data = state.data as ({List items, int total, bool hasMore});
                return data.items.isEmpty;
              }
              return false;
            },
            emptyMessage: 'Aún no tienes operaciones.',
            child: _buildOpsList(state),
          ),
        ),
      ],
    );
  }

  Widget _buildOpsList(CajeroDataState state) {
    if (state is! CajeroDataLoaded) return const SizedBox.shrink();
    final data = state.data as ({List<OperacionDto> items, int total, bool hasMore});
    final items = data.items.take(3).toList();

    return TavCard(
      padding: const EdgeInsets.symmetric(horizontal: TavSpace.lg, vertical: 0),
      child: Column(
        children: items.map((op) {
          final estadoChip = _chipEstadoOperacion(op.estado);
          return TavListRow(
            title: op.beneficiario.nombre,
            subtitle: '${tipoOperacionLabel(op.tipo)} · ${_fechaCorta(op.creadaAt)}',
            trailingTitle: formatCents(op.totalCents),
            trailingSubtitle: estadoChip.label,
            avatar: Icon(
              _iconoEstado(op.estado),
              color: estadoChip.color,
              size: 18,
            ),
            avatarColor: estadoChip.bgColor,
            onTap: () => context.push('/cajero/operacion/${op.id}'),
            showDivider: items.indexOf(op) < items.length - 1,
          );
        }).toList(),
      ),
    );
  }

  TavChipState _chipStateSemaforo(String estado) => switch (estado) {
        'verde' => TavChipState.verde,
        'ambar' => TavChipState.ambar,
        'rojo' => TavChipState.rojo,
        _ => TavChipState.gris,
      };

  /// Color único del semáforo derivado del estado que calcula el servidor.
  /// Se aplica al chip, a la barra de progreso y a cualquier otro indicador.
  Color _colorSemaforo(String estado) => switch (estado) {
        'verde' => TavColors.green600,
        'ambar' => TavColors.gold,
        'rojo' => TavColors.red,
        _ => TavColors.ink3,
      };

  ({TavChipState state, String label, Color color, Color bgColor})
      _chipEstadoOperacion(String estado) {
    return switch (estado) {
      'en_verificacion' => (
          state: TavChipState.azul,
          label: 'En verificación',
          color: TavColors.blue,
          bgColor: TavColors.blue50,
        ),
      'en_proceso' => (
          state: TavChipState.azul,
          label: 'En proceso',
          color: TavColors.blue,
          bgColor: TavColors.blue50,
        ),
      'completada' => (
          state: TavChipState.verde,
          label: 'Completada',
          color: TavColors.green600,
          bgColor: TavColors.green50,
        ),
      'observada' => (
          state: TavChipState.ambar,
          label: 'Observada',
          color: TavColors.gold700,
          bgColor: TavColors.gold50,
        ),
      'rechazada' => (
          state: TavChipState.rojo,
          label: 'Rechazada',
          color: TavColors.red700,
          bgColor: TavColors.red50,
        ),
      'anulada' => (
          state: TavChipState.gris,
          label: 'Anulada',
          color: TavColors.ink3,
          bgColor: const Color(0xFFF1F3F6),
        ),
      _ => (
          state: TavChipState.gris,
          label: estado,
          color: TavColors.ink3,
          bgColor: const Color(0xFFF1F3F6),
        ),
    };
  }

  IconData _iconoEstado(String estado) => switch (estado) {
        'completada' => Icons.check_outlined,
        'en_proceso' => Icons.schedule_outlined,
        'en_verificacion' => Icons.hourglass_top_outlined,
        'observada' => Icons.warning_amber_outlined,
        'rechazada' => Icons.close_outlined,
        'anulada' => Icons.block_outlined,
        _ => Icons.circle_outlined,
      };

  String _formatTasa(String valor) {
    final d = double.tryParse(valor);
    if (d == null) return valor;
    final s = d.toStringAsFixed(2);
    // Formato es_VE: coma decimal, punto miles
    final parts = s.split('.');
    final entero = parts[0].replaceAllMapped(
      RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
      (m) => '${m[1]}.',
    );
    return '$entero,${parts[1]}';
  }

  String _fechaCorta(DateTime d) {
    const meses = [
      'ene', 'feb', 'mar', 'abr', 'may', 'jun',
      'jul', 'ago', 'sep', 'oct', 'nov', 'dic'
    ];
    return '${d.day} ${meses[d.month - 1]}';
  }
}

class _AccesoRapido extends StatelessWidget {
  const _AccesoRapido({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: TavCard(
        elevation: TavCardElevation.flat,
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
        child: Column(
          children: [
            Icon(icon, color: TavColors.blue, size: 22),
            const SizedBox(height: 6),
            Text(
              label,
              style: TavText.label.copyWith(fontSize: 12),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
