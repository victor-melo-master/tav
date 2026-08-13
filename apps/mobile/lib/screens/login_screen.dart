import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../components/tav_button.dart';
import '../components/tav_field.dart';
import '../state/auth_state.dart';
import '../theme/tav_colors.dart';
import '../theme/tav_space.dart';
import '../theme/tav_text.dart';

/// Pantalla de login con teléfono y contraseña.
///
/// Es el primer ingreso. La API valida teléfono + contraseña con argon2.
/// Después del login, si no hay PIN establecido, va a /pin-setup.
/// Si hay PIN, va al shell del rol correspondiente.
///
/// El prototipo no tiene esta pantalla explícitamente (va directo a PIN),
/// pero el plan la pide y la API la requiere: las cuentas las crea el admin,
/// el usuario entra primero con contraseña y luego establece su PIN.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _telefonoController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _telefonoController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    final telefono = _telefonoController.text.trim();
    final password = _passwordController.text;

    if (telefono.isEmpty || password.isEmpty) {
      setState(() => _error = 'Ingresa tu teléfono y contraseña.');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    await ref.read(authProvider.notifier).login(telefono, password);

    if (!mounted) return;
    setState(() => _loading = false);

    final state = ref.read(authProvider);
    if (state is AuthError) {
      if (state.message == 'PIN_BLOQUEADO') {
        context.go('/pin-bloqueado');
      } else {
        setState(() => _error = state.message);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: TavColors.bg,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: TavSpace.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 52),
              _buildLogo(),
              const SizedBox(height: TavSpace.xxl),
              Text(
                'Tu dinero,\ndonde lo necesitas.',
                style: TavText.display.copyWith(
                  fontSize: 29,
                  height: 1.24,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: TavSpace.md),
              Text(
                'Cambia USDT y dólares a bolívares con la tasa del día.',
                style: TavText.body.copyWith(color: TavColors.ink3),
              ),
              const SizedBox(height: TavSpace.xxxl),
              TavField(
                label: 'Número de teléfono',
                controller: _telefonoController,
                placeholder: '414 855 2210',
                keyboardType: TextInputType.phone,
                prefix: const Text('🇻🇪 +58  ', style: TextStyle(fontSize: 15)),
              ),
              const SizedBox(height: TavSpace.md),
              TavField(
                label: 'Contraseña',
                controller: _passwordController,
                obscureText: true,
                placeholder: '••••••••',
                onSubmitted: (_) => _login(),
              ),
              if (_error != null) ...[
                const SizedBox(height: TavSpace.md),
                Text(_error!, style: TavText.caption.copyWith(color: TavColors.red)),
              ],
              const SizedBox(height: TavSpace.xxl),
              TavButton(
                label: 'Entrar',
                onPressed: _loading ? null : _login,
              ),
              const SizedBox(height: TavSpace.lg),
              Text(
                'Al continuar aceptas los Términos y la Política de privacidad.',
                style: TavText.caption.copyWith(color: TavColors.ink3),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLogo() {
    return SizedBox(
      width: 58,
      height: 58,
      child: CustomPaint(painter: _HexLogoPainter()),
    );
  }
}

/// Hexágono de nodos con planta al centro — isotipo de TAV.
class _HexLogoPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final cx = w / 2;
    final cy = h / 2;

    // Hexágono
    final hexPath = Path();
    final points = [
      Offset(cx, 8),
      Offset(w - 8, cy - 10),
      Offset(w - 8, cy + 10),
      Offset(cx, h - 8),
      Offset(8, cy + 10),
      Offset(8, cy - 10),
    ];
    hexPath.addPolygon(points, true);
    canvas.drawPath(
      hexPath,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3.6
        ..color = const Color(0xFF4E9BFF),
    );

    // Nodos
    for (final p in points) {
      canvas.drawCircle(p, 4, Paint()..color = const Color(0xFF4E9BFF));
    }

    // Planta (línea central)
    final plantPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4.6
      ..strokeCap = StrokeCap.round
      ..color = const Color(0xFF6FCB4A);
    canvas.drawLine(Offset(cx, h - 16), Offset(cx, 18), plantPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
