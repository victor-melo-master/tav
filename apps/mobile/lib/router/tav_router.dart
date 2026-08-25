import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../screens/cajero/abono_screen.dart';
import '../screens/cajero/ampliacion_screen.dart';
import '../screens/cajero/beneficiarios_screen.dart';
import '../screens/cajero/estado_cuenta_screen.dart';
import '../screens/cajero/historial_screen.dart';
import '../screens/cajero/inicio_screen.dart';
import '../screens/cajero/notificaciones_screen.dart';
import '../screens/cajero/nueva_operacion_screen.dart';
import '../screens/cajero/operacion_detail_screen.dart';
import '../screens/cajero/perfil_screen.dart';
import '../screens/cajero/seguridad_screen.dart';
import '../screens/cajero/soporte_screen.dart';
import '../screens/cajero/tasas_screen.dart';
import '../screens/login_screen.dart';
import '../screens/pin_bloqueado_screen.dart';
import '../screens/pin_login_screen.dart';
import '../screens/pin_setup_screen.dart';
import '../screens/placeholder_screen.dart';
import '../screens/shells.dart';
import '../state/auth_state.dart';
import 'router_notifier.dart';

/// Proveedor del router.
///
/// El redirect implementa cuatro reglas en orden, evaluadas contra el estado
/// de autenticación. Cada regla es excluyente: la primera que coincide gana.
///
/// 1. No autenticado → /login
/// 2. Autenticado y sin PIN establecido → /pin-setup
/// 3. Autenticado, con PIN, y no desbloqueado → /pin-login
/// 4. Autenticado y desbloqueado → si está en una ruta de autenticación
///    (/login, /pin-setup, /pin-login), va al shell de su rol.
///
/// `desbloqueado` indica que el usuario probó su identidad en esta ejecución
/// de la app (login con contraseña o loginPin). Un arranque en frío con
/// tokens guardados deja desbloqueado=false: hay sesión pero hay que
/// validar el PIN antes de entrar al shell.
///
/// Usa refreshListenable con RouterNotifier para re-evaluar
/// redirects cuando cambia authProvider (login, logout, PIN).
final tavRouterProvider = Provider<GoRouter>((ref) {
  final routerNotifier = ref.read(routerNotifierProvider);

  return GoRouter(
    initialLocation: '/login',
    refreshListenable: routerNotifier,
    redirect: (context, state) {
      final authState = routerNotifier.authState;
      final location = state.matchedLocation;

      // Mientras carga o está en estado inicial, no redirigir.
      if (authState is AuthLoading || authState is AuthInitial) {
        return null;
      }

      // Rutas de autenticación: login, pin-setup, pin-login, pin-bloqueado.
      final isAuthRoute = location == '/login' ||
          location == '/pin-setup' ||
          location == '/pin-login' ||
          location == '/pin-bloqueado';

      // Regla 1: No autenticado → /login
      if (authState is AuthUnauthenticated || authState is AuthError) {
        return isAuthRoute ? null : '/login';
      }

      if (authState is AuthAuthenticated) {
        final pinEstablecido = authState.pinEstablecido;
        final desbloqueado = authState.desbloqueado;
        final rol = authState.usuario.rol;

        // Regla 2: Autenticado y sin PIN establecido → /pin-setup
        if (!pinEstablecido) {
          return location == '/pin-setup' ? null : '/pin-setup';
        }

        // Regla 3: Autenticado, con PIN, y no desbloqueado → /pin-login
        if (!desbloqueado) {
          return location == '/pin-login' ? null : '/pin-login';
        }

        // Regla 4: Autenticado y desbloqueado → si está en una ruta de
        // autenticación, va al shell de su rol.
        if (isAuthRoute) {
          return _shellRoute(rol);
        }
      }

      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/pin-setup',
        builder: (context, state) => const PinSetupScreen(),
      ),
      GoRoute(
        path: '/pin-login',
        builder: (context, state) => const PinLoginScreen(),
      ),
      GoRoute(
        path: '/pin-bloqueado',
        builder: (context, state) => const PinBloqueadoScreen(),
      ),
      // Shell del cajero — 4 destinos del bottom nav
      ShellRoute(
        builder: (context, state, child) {
          final index = _cajeroIndex(state.matchedLocation);
          return CajeroShell(currentIndex: index, child: child);
        },
        routes: [
          GoRoute(
            path: '/cajero/inicio',
            builder: (context, state) => const CajeroInicioScreen(),
          ),
          GoRoute(
            path: '/cajero/operaciones',
            builder: (context, state) => const HistorialScreen(),
          ),
          GoRoute(
            path: '/cajero/cuenta',
            builder: (context, state) => const EstadoCuentaScreen(),
          ),
          GoRoute(
            path: '/cajero/perfil',
            builder: (context, state) => const PerfilScreen(),
          ),
        ],
      ),
      // Rutas del cajero fuera del shell (pantallas a pantalla completa)
      GoRoute(
        path: '/cajero/operacion/tipo',
        builder: (context, state) => const NuevaOperacionScreen(),
      ),
      GoRoute(
        path: '/cajero/operacion/:id',
        builder: (context, state) => OperacionDetailScreen(
          operacionId: state.pathParameters['id']!,
        ),
      ),
      GoRoute(
        path: '/cajero/abono',
        builder: (context, state) => const AbonoScreen(),
      ),
      GoRoute(
        path: '/cajero/ampliacion',
        builder: (context, state) => const AmpliacionScreen(),
      ),
      GoRoute(
        path: '/cajero/tasas',
        builder: (context, state) => const TasasScreen(),
      ),
      GoRoute(
        path: '/cajero/notificaciones',
        builder: (context, state) => const NotificacionesScreen(),
      ),
      GoRoute(
        path: '/cajero/beneficiarios',
        builder: (context, state) => const BeneficiariosScreen(),
      ),
      GoRoute(
        path: '/cajero/seguridad',
        builder: (context, state) => const SeguridadScreen(),
      ),
      GoRoute(
        path: '/cajero/soporte',
        builder: (context, state) => const SoporteScreen(),
      ),
      // Shell del cobrador — 4 destinos
      ShellRoute(
        builder: (context, state, child) {
          final index = _cobradorIndex(state.matchedLocation);
          return CobradorShell(currentIndex: index, child: child);
        },
        routes: [
          GoRoute(
            path: '/cobrador/mi-dia',
            builder: (context, state) =>
                const PlaceholderScreen(title: 'Mi día'),
          ),
          GoRoute(
            path: '/cobrador/cajeros',
            builder: (context, state) =>
                const PlaceholderScreen(title: 'Cajeros'),
          ),
          GoRoute(
            path: '/cobrador/cuadre',
            builder: (context, state) =>
                const PlaceholderScreen(title: 'Cuadre'),
          ),
          GoRoute(
            path: '/cobrador/perfil',
            builder: (context, state) =>
                const PlaceholderScreen(title: 'Perfil'),
          ),
        ],
      ),
    ],
  );
});

String _shellRoute(String rol) {
  return switch (rol) {
    'cajero' => '/cajero/inicio',
    'cobrador' => '/cobrador/mi-dia',
    'admin' => '/cajero/inicio', // PENDIENTE DE DEFINIR: shell de admin
    _ => '/cajero/inicio',
  };
}

int _cajeroIndex(String location) {
  if (location.startsWith('/cajero/operaciones')) return 1;
  if (location.startsWith('/cajero/cuenta')) return 2;
  if (location.startsWith('/cajero/perfil')) return 3;
  return 0; // inicio
}

int _cobradorIndex(String location) {
  if (location.startsWith('/cobrador/cajeros')) return 1;
  if (location.startsWith('/cobrador/cuadre')) return 2;
  if (location.startsWith('/cobrador/perfil')) return 3;
  return 0; // mi-dia
}
