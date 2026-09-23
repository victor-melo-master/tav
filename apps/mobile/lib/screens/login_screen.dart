import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../components/tav_button.dart';
import '../components/tav_field.dart';
import '../state/auth_state.dart';
import '../theme/tav_colors.dart';
import '../theme/tav_radius.dart';
import '../theme/tav_space.dart';
import '../theme/tav_text.dart';

/// Pantalla de login con correo y contraseña.
///
/// Es el primer ingreso. La API valida correo + contraseña con argon2.
/// Después del login, si no hay PIN establecido, va a /pin-setup.
/// Si hay PIN, va al shell del rol correspondiente.
///
/// La cabecera replica s-welcome del prototipo: bloque navy con gradiente,
/// esquinas inferiores redondeadas 34px, logo SVG + titular en blanco.
/// El formulario va debajo sobre el fondo claro.
/// El selector de país replica s-reg-phone: dos cajas separadas en fila
/// con 9px de separación — selector de 110px fijo + campo del número.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text;

    if (email.isEmpty || password.isEmpty) {
      setState(() => _error = 'Ingresa tu correo y contraseña.');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    await ref.read(authProvider.notifier).login(email, password);

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
      body: Column(
        children: [
          _buildCabecera(),
          Expanded(
            child: SafeArea(
              top: false,
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: TavSpace.xl),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 28),
                    _buildCampoEmail(),
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
                      Text(
                        _error!,
                        style: TavText.caption.copyWith(color: TavColors.red),
                      ),
                    ],
                    const SizedBox(height: TavSpace.xxl),
                    TavButton(
                      label: 'Entrar',
                      onPressed: _loading ? null : _login,
                      loading: _loading,
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
          ),
        ],
      ),
    );
  }

  /// Cabecera navy con gradiente y esquinas inferiores redondeadas 34px.
  /// Replica s-welcome del prototipo.
  Widget _buildCabecera() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color(0xFF0B1B33), // --navy
            Color(0xFF16345F),
            Color(0xFF1B4E86),
          ],
          stops: [0.0, 0.6, 1.0],
        ),
        borderRadius: BorderRadius.only(
          bottomLeft: Radius.circular(34),
          bottomRight: Radius.circular(34),
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 30, 24, 34),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Logo SVG — 58px, arriba del titular.
              SvgPicture.asset(
                'assets/logo_tav.svg',
                width: 58,
                height: 58,
              ),
              const SizedBox(height: 24),
              Text(
                'Tu dinero,\ndonde lo necesitas.',
                style: TavText.display.copyWith(
                  fontSize: 29,
                  height: 1.24,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'Cambia dólares a guyaneses con el precio fijado para ti.',
                style: TavText.body.copyWith(
                  color: const Color(0xFFA9C6EB),
                  height: 1.6,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Campo de correo para el login.
  Widget _buildCampoEmail() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Correo electrónico',
          style: TavText.label.copyWith(color: TavColors.ink2),
        ),
        const SizedBox(height: 6),
        SizedBox(
          height: 50,
          child: TextField(
            controller: _emailController,
            keyboardType: TextInputType.emailAddress,
            autocorrect: false,
            textCapitalization: TextCapitalization.none,
            style: TavText.body,
            decoration: InputDecoration(
              hintText: 'tu@correo.com',
              hintStyle: TavText.body.copyWith(color: TavColors.ink3),
              contentPadding: const EdgeInsets.symmetric(
                horizontal: TavSpace.md,
              ),
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
            ),
            onSubmitted: (_) => _login(),
          ),
        ),
      ],
    );
  }
}
