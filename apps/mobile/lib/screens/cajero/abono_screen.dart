import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_button.dart';
import '../../components/tav_card.dart';
import '../../components/tav_keypad.dart';
import '../../components/tav_money_display.dart';
import '../../data/cajero_api.dart';
import '../../state/cajero_state.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_radius.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';

/// Abono a deuda: monto con teclado numérico, selección de método de pago,
/// y confirmación.
class AbonoScreen extends ConsumerStatefulWidget {
  const AbonoScreen({super.key});

  @override
  ConsumerState<AbonoScreen> createState() => _AbonoScreenState();
}

class _AbonoScreenState extends ConsumerState<AbonoScreen> {
  String _montoStr = ''; // en centavos
  String _metodo = 'usdt'; // usdt | efectivo | transfer
  bool _otroMonto = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(resumenProvider.notifier).cargar();
    });
  }

  int get _montoCents => int.tryParse(_montoStr) ?? 0;
  int get _deudaCents {
    final state = ref.read(resumenProvider);
    if (state is CajeroDataLoaded<ResumenDto>) return state.data.saldoCents;
    return 0;
  }

  void _onDigit(int d) {
    setState(() => _montoStr = '$_montoStr$d');
  }

  void _onDelete() {
    setState(() {
      if (_montoStr.isNotEmpty) {
        _montoStr = _montoStr.substring(0, _montoStr.length - 1);
      }
    });
  }

  void _setQuickAmount(int amount) {
    setState(() {
      _montoStr = amount.toString();
      _otroMonto = false;
    });
  }

  void _setOtro() {
    setState(() {
      _otroMonto = true;
      _montoStr = '';
    });
  }

  @override
  Widget build(BuildContext context) {
    final resumenState = ref.watch(resumenProvider);

    return Scaffold(
      backgroundColor: TavColors.bg,
      appBar: AppBar(
        backgroundColor: TavColors.surface,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: TavColors.ink),
          onPressed: () => context.pop(),
        ),
        title: Text('Abonar a mi deuda', style: TavText.h2),
        centerTitle: false,
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(TavSpace.xl),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildResumen(resumenState),
                    const SizedBox(height: TavSpace.lg),
                    _buildQuickAmounts(),
                    if (_otroMonto) ...[
                      const SizedBox(height: TavSpace.lg),
                      Text('Ingresa el monto', style: TavText.label.copyWith(color: TavColors.ink2)),
                      const SizedBox(height: TavSpace.sm),
                    ],
                    const SizedBox(height: TavSpace.lg),
                    Text('¿Cómo vas a pagar?', style: TavText.overline.copyWith(color: TavColors.ink3)),
                    const SizedBox(height: TavSpace.sm),
                    _buildMetodos(),
                    const SizedBox(height: TavSpace.md),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(TavSpace.lg),
                      decoration: BoxDecoration(
                        color: TavColors.green50,
                        border: Border.all(color: const Color(0xFFCDE9CF)),
                        borderRadius: BorderRadius.circular(TavRadius.card),
                      ),
                      child: Text(
                        'Tras el abono tu semáforo vuelve a verde y el contador de días se reinicia.',
                        style: TavText.body2.copyWith(color: const Color(0xFF256B2A), height: 1.55),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (_otroMonto)
              TavKeypad(onDigit: _onDigit, onDelete: _onDelete),
            Padding(
              padding: const EdgeInsets.fromLTRB(TavSpace.xl, 0, TavSpace.xl, TavSpace.xl),
              child: TavButton(
                label: 'Continuar al pago',
                variant: TavButtonVariant.green,
                onPressed: _montoCents > 0 ? _continuar : null,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildResumen(CajeroDataState state) {
    int deuda = 0;
    if (state is CajeroDataLoaded<ResumenDto>) deuda = state.data.saldoCents;
    final loading = state is CajeroDataLoading;

    return TavCard(
      child: Center(
        child: Column(
          children: [
            Text('Deuda actual', style: TavText.caption.copyWith(color: TavColors.ink3)),
            const SizedBox(height: 4),
            if (loading)
              const SizedBox(
                width: 24, height: 24,
                child: CircularProgressIndicator(strokeWidth: 2, color: TavColors.blue),
              )
            else
              TavMoneyDisplay(
                cents: deuda,
                style: TavText.moneyDisplay.copyWith(fontSize: 28),
              ),
            const Divider(height: 28),
            Text('Monto a abonar', style: TavText.caption.copyWith(color: TavColors.ink3)),
            const SizedBox(height: 4),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.baseline,
              children: [
                Text('\$', style: TavText.moneyDisplay.copyWith(fontSize: 24, color: TavColors.blue)),
                const SizedBox(width: 3),
                Text(
                  _montoCents > 0 ? formatCents(_montoCents).replaceAll('\$', '') : '0,00',
                  style: TavText.moneyDisplay.copyWith(fontSize: 32, color: TavColors.blue),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              'Quedarías debiendo ${formatCents((_deudaCents - _montoCents).clamp(0, _deudaCents))}',
              style: TavText.caption.copyWith(color: TavColors.ink3),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildQuickAmounts() {
    final quickAmounts = [
      (30000, '\$300'),
      (60000, '\$600'),
      (-1, 'Todo'),
    ];

    return Row(
      children: [
        ...quickAmounts.map((q) {
          final isOn = !_otroMonto && (
            (q.$1 == -1 && _montoStr == _deudaCents.toString() && _deudaCents > 0) ||
            (q.$1 > 0 && _montoStr == q.$1.toString())
          );
          return Expanded(
            child: Padding(
              padding: EdgeInsets.only(right: q != quickAmounts.last ? 8 : 0),
              child: GestureDetector(
                onTap: () {
                  if (q.$1 == -1) {
                    _setQuickAmount(_deudaCents);
                  } else {
                    _setQuickAmount(q.$1);
                  }
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(
                    color: isOn ? TavColors.blue : TavColors.surface,
                    border: Border.all(color: isOn ? TavColors.blue : TavColors.line),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    q.$2,
                    style: TavText.label.copyWith(
                      color: isOn ? TavColors.surface : TavColors.ink2,
                      fontSize: 13,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
            ),
          );
        }),
        const SizedBox(width: 8),
        Expanded(
          child: GestureDetector(
            onTap: _setOtro,
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                color: _otroMonto ? TavColors.blue : TavColors.surface,
                border: Border.all(color: _otroMonto ? TavColors.blue : TavColors.line),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                'Otro',
                style: TavText.label.copyWith(
                  color: _otroMonto ? TavColors.surface : TavColors.ink2,
                  fontSize: 13,
                ),
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildMetodos() {
    final metodos = [
      ('usdt', 'USDT (TRC20)', 'Acreditación inmediata', Icons.currency_bitcoin),
      ('efectivo', 'Efectivo al recolector', 'Coordinamos visita', Icons.payments_outlined),
      ('transfer', 'Transferencia bancaria', 'Sujeta a verificación', Icons.receipt_long_outlined),
    ];

    return TavCard(
      padding: const EdgeInsets.symmetric(horizontal: TavSpace.lg, vertical: 0),
      child: Column(
        children: metodos.map((m) {
          final isOn = _metodo == m.$1;
          final idx = metodos.indexOf(m);
          return _MetodoRow(
            titulo: m.$2,
            subtitulo: m.$3,
            icon: m.$4,
            seleccionado: isOn,
            onTap: () => setState(() => _metodo = m.$1),
            showDivider: idx < metodos.length - 1,
          );
        }).toList(),
      ),
    );
  }

  void _continuar() {
    // PENDIENTE DE DEFINIR: el endpoint de abono (cobro) no está
    // implementado en la API del cajero todavía. Por ahora navegamos
    // de vuelta al inicio tras mostrar un mensaje.
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Abono de ${formatCents(_montoCents)} registrado (demo)'),
        backgroundColor: TavColors.green600,
      ),
    );
    context.go('/cajero/cuenta');
  }
}

class _MetodoRow extends StatelessWidget {
  const _MetodoRow({
    required this.titulo,
    required this.subtitulo,
    required this.icon,
    required this.seleccionado,
    required this.onTap,
    required this.showDivider,
  });

  final String titulo;
  final String subtitulo;
  final IconData icon;
  final bool seleccionado;
  final VoidCallback onTap;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 13),
            child: Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: TavColors.blue50,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(icon, color: TavColors.blue, size: 20),
                ),
                const SizedBox(width: TavSpace.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(titulo, style: TavText.body.copyWith(fontSize: 14, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 2),
                      Text(subtitulo, style: TavText.caption.copyWith(color: TavColors.ink3)),
                    ],
                  ),
                ),
                Container(
                  width: 20,
                  height: 20,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: seleccionado ? TavColors.blue : Colors.transparent,
                    border: Border.all(
                      color: seleccionado ? TavColors.blue : TavColors.line,
                      width: 2,
                    ),
                  ),
                  child: seleccionado
                      ? const Icon(Icons.check, color: TavColors.surface, size: 12)
                      : null,
                ),
              ],
            ),
          ),
          if (showDivider) const Divider(height: 0, color: TavColors.line2),
        ],
      ),
    );
  }
}
