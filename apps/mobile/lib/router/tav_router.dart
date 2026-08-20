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
/// El enrutado depende del estado de autenticación:
/// - No autenticado → /login
/// - Autenticado sin PIN → /pin-setup
/// - Autenticado con PIN → /pin-login (reingreso)
/// - PIN verificado → shell del rol (cajero o cobrador)
///
/// El rol se lee del JWT: cajero va al shell del cajero,
/// cobrador al del cobrador.
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

      // Rutas públicas
      final isPublicRoute = location == '/login' || location == '/pin-bloqueado';

      if (authState is AuthLoading || authState is AuthInitial) {
        return null; // No redirigir mientras carga
      }

      if (authState is AuthUnauthenticated || authState is AuthError) {
        return isPublicRoute ? null : '/login';
      }

      if (authState is AuthAuthenticated) {
        final pinEstablecido = authState.pinEstablecido;
        final rol = authState.usuario.rol;

        // Si está en login, redirigir según PIN
        if (location == '/login') {
          return pinEstablecido ? '/pin-login' : '/pin-setup';
        }

        // Si está en pin-setup pero ya tiene PIN, ir a pin-login
        if (location == '/pin-setup' && pinEstablecido) {
          return '/pin-login';
        }

        // Si está en pin-login pero no tiene PIN, ir a pin-setup
        if (location == '/pin-login' && !pinEstablecido) {
          return '/pin-setup';
        }

        // Si está en una ruta pública, ir al shell del rol
        if (isPublicRoute) {
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
