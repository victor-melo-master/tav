import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
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
  const AuthAuthenticated({required this.usuario});

  final UsuarioDto usuario;
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
  /// Si hay tokens, llama a /auth/me para validar la sesión.
  ///
  /// Guarda contra respuestas tardías: si el usuario loguea o sale antes de
  /// que /auth/me responda, no se pisa el estado.
  Future<void> checkSession() async {
    final token = await storage.getAccessToken();
    final userId = await storage.getUserId();
    final role = await storage.getUserRole();
    final name = await storage.getUserName();

    if (token == null || userId == null || role == null || name == null) {
      state = const AuthUnauthenticated();
      return;
    }

    // Si el estado ya dejó de ser AuthInitial (el usuario logueó antes
    // de que esta llamada terminara), no pisar el estado.
    if (state is! AuthInitial) {
      if (kDebugMode) {
        debugPrint('[AuthState] checkSession descartada: el estado ya cambió '
            'a ${state.runtimeType}');
      }
      return;
    }

    try {
      final response = await dio.get('/auth/me');
      // Doble guard: si el usuario logueó mientras /auth/me estaba en vuelo,
      // no sobrescribir.
      if (state is! AuthInitial) {
        if (kDebugMode) {
          debugPrint('[AuthState] checkSession descartada tras /auth/me: '
              'el estado ya cambió a ${state.runtimeType}');
        }
        return;
      }
      final usuarioData = response.data as Map<String, dynamic>;
      state = AuthAuthenticated(
        usuario: UsuarioDto(
          id: usuarioData['id'] as String,
          email: usuarioData['email'] as String,
          telefono: usuarioData['telefono'] as String?,
          nombre: usuarioData['nombre'] as String,
          rol: usuarioData['rol'] as String,
        ),
      );
    } catch (e) {
      // Si /auth/me falla, limpiar sesión y mandar a login — pero solo si
      // el estado no cambió mientras tanto.
      if (state is! AuthInitial) {
        if (kDebugMode) {
          debugPrint('[AuthState] checkSession error descartado: el estado '
              'ya cambió a ${state.runtimeType}');
        }
        return;
      }
      if (kDebugMode) debugPrint('[AuthState] Error calling /auth/me: $e');
      await storage.clearAll();
      state = const AuthUnauthenticated();
    }
  }

  /// Login con correo + contraseña.
  Future<void> login(String email, String password) async {
    state = const AuthLoading();
    try {
      final response = await dio.post(
        '/auth/login',
        data: LoginRequest(email: email.trim().toLowerCase(), password: password).toJson(),
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

      state = AuthAuthenticated(usuario: loginResp.usuario);
    } on DioException catch (e) {
      // err.message ya viene traducido por ErrorInterceptor.
      state = AuthError(
        e.message ?? 'No pudimos conectar. Revisa tu conexión.',
      );
    } catch (e) {
      state = const AuthError('Ocurrió un error inesperado.');
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
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  final dio = ref.read(dioProvider);
  final storage = ref.read(tokenStorageProvider);
  return AuthNotifier(dio: dio, storage: storage);
});
