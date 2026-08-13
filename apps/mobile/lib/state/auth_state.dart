import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/auth_api.dart';
import '../data/dio_client.dart';
import '../data/token_storage.dart';

/// Proveedor del almacenamiento seguro de tokens.
final tokenStorageProvider = Provider<TokenStorage>((ref) {
  return TokenStorage();
});

/// Proveedor del cliente Dio configurado con interceptor de refresh.
final dioProvider = Provider<Dio>((ref) {
  final storage = ref.read(tokenStorageProvider);
  return createDio(storage);
});

/// Estado de autenticación de la app.
sealed class AuthState {
  const AuthState();
}

class AuthInitial extends AuthState {
  const AuthInitial();
}

class AuthLoading extends AuthState {
  const AuthLoading();
}

class AuthAuthenticated extends AuthState {
  const AuthAuthenticated({
    required this.usuario,
    required this.pinEstablecido,
  });

  final UsuarioDto usuario;
  final bool pinEstablecido;
}

class AuthUnauthenticated extends AuthState {
  const AuthUnauthenticated();
}

class AuthError extends AuthState {
  const AuthError(this.message);
  final String message;
}

/// Notifier de autenticación con Riverpod.
class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier({required this.dio, required this.storage})
      : super(const AuthInitial());

  final Dio dio;
  final TokenStorage storage;

  /// Al arrancar la app, comprueba si hay sesión guardada.
  Future<void> checkSession() async {
    final token = await storage.getAccessToken();
    final userId = await storage.getUserId();
    final role = await storage.getUserRole();
    final name = await storage.getUserName();

    if (token != null && userId != null && role != null && name != null) {
      final pin = await storage.getPin();
      state = AuthAuthenticated(
        usuario: UsuarioDto(
          id: userId,
          telefono: '',
          nombre: name,
          rol: role,
          pinEstablecido: pin != null,
        ),
        pinEstablecido: pin != null,
      );
    } else {
      state = const AuthUnauthenticated();
    }
  }

  /// Login con teléfono + contraseña.
  Future<void> login(String telefono, String password) async {
    state = const AuthLoading();
    try {
      final response = await dio.post(
        '/auth/login',
        data: LoginRequest(telefono: telefono, password: password).toJson(),
      );

      final loginResp = LoginResponse.fromJson(
        response.data as Map<String, dynamic>,
      );

      await storage.saveTokens(
        accessToken: loginResp.accessToken,
        refreshToken: loginResp.refreshToken,
      );
      await storage.saveSession(
        userId: loginResp.usuario.id,
        role: loginResp.usuario.rol,
        name: loginResp.usuario.nombre,
      );

      final pin = await storage.getPin();
      state = AuthAuthenticated(
        usuario: loginResp.usuario,
        pinEstablecido: pin != null,
      );
    } on DioException catch (e) {
      final code = e.response?.data?['code'] as String?;
      if (code == 'PIN_BLOQUEADO') {
        state = const AuthError('PIN_BLOQUEADO');
      } else {
        state = AuthError(
          e.response?.data?['message'] as String? ??
              'No pudimos conectar. Revisa tu conexión.',
        );
      }
    } catch (e) {
      state = const AuthError('Ocurrió un error inesperado.');
    }
  }

  /// Establecer PIN de 4 dígitos.
  Future<bool> setPin(String pin) async {
    try {
      await dio.post(
        '/auth/pin',
        data: SetPinRequest(pin: pin).toJson(),
      );
      await storage.savePin(pin);
      state = AuthAuthenticated(
        usuario: (state as AuthAuthenticated).usuario,
        pinEstablecido: true,
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Logout: limpia todo y vuelve a unauthenticated.
  Future<void> logout() async {
    try {
      await dio.post('/auth/logout');
    } catch (_) {
      // No importa si falla: limpiamos localmente de todas formas.
    }
    await storage.clearAll();
    state = const AuthUnauthenticated();
  }

  /// Marca que el PIN ya fue establecido (tras crearlo localmente).
  void markPinEstablecido() {
    if (state is AuthAuthenticated) {
      state = AuthAuthenticated(
        usuario: (state as AuthAuthenticated).usuario,
        pinEstablecido: true,
      );
    }
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  final dio = ref.read(dioProvider);
  final storage = ref.read(tokenStorageProvider);
  return AuthNotifier(dio: dio, storage: storage);
});
