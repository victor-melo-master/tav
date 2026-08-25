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
  const AuthAuthenticated({
    required this.usuario,
    required this.pinEstablecido,
    required this.desbloqueado,
  });

  final UsuarioDto usuario;
  final bool pinEstablecido;

  /// True cuando el usuario probó su identidad en esta ejecución de la app.
  /// - Login con contraseña → true (acaba de probar su identidad).
  /// - checkSession (arranque en frío con tokens guardados) → false:
  ///   tiene sesión pero debe validar el PIN.
  /// - loginPin exitoso → true.
  /// - setPin exitoso → true, porque venía de un login con contraseña.
  final bool desbloqueado;
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
  /// Si hay tokens, llama a /auth/me para obtener pinEstablecido del servidor.
  ///
  /// Guarda contra respuestas tardías: si el usuario loguea o sale antes de
  /// que /auth/me responda, no se pisa el estado. Esto previene el bucle
  /// pin-setup → pin-login → pin-setup que ocurría cuando checkSession
  /// llegaba tarde con pinEstablecido=false y el router mandaba atrás.
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
      final pinEstablecido = (usuarioData['pinEstablecido'] as bool?) ?? false;
      state = AuthAuthenticated(
        usuario: UsuarioDto(
          id: usuarioData['id'] as String,
          telefono: usuarioData['telefono'] as String,
          nombre: usuarioData['nombre'] as String,
          rol: usuarioData['rol'] as String,
          pinEstablecido: pinEstablecido,
        ),
        pinEstablecido: pinEstablecido,
        desbloqueado: false, // Arranque en frío: tiene sesión pero debe validar PIN.
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

      state = AuthAuthenticated(
        usuario: loginResp.usuario,
        pinEstablecido: loginResp.usuario.pinEstablecido,
        desbloqueado: true, // Login con contraseña: acaba de probar su identidad.
      );
    } on DioException catch (e) {
      final code = e.response?.data?['code'] as String?;
      if (code == 'PIN_BLOQUEADO') {
        state = const AuthError('PIN_BLOQUEADO');
      } else {
        // err.message ya viene traducido por ErrorInterceptor.
        state = AuthError(
          e.message ?? 'No pudimos conectar. Revisa tu conexión.',
        );
      }
    } catch (e) {
      state = const AuthError('Ocurrió un error inesperado.');
    }
  }

  /// Reingreso con PIN (login-pin): usa refresh token + PIN para obtener nuevos tokens.
  Future<void> loginPin(String pin) async {
    state = const AuthLoading();
    try {
      final refreshToken = await storage.getRefreshToken();
      if (refreshToken == null) {
        state = const AuthError('No hay sesión guardada. Ingresa con tu contraseña.');
        return;
      }

      final response = await dio.post(
        '/auth/login-pin',
        data: LoginPinRequest(refreshToken: refreshToken, pin: pin).toJson(),
      );

      final loginPinResp = LoginPinResponse.fromJson(
        response.data as Map<String, dynamic>,
      );

      await storage.saveTokens(
        accessToken: loginPinResp.accessToken,
        refreshToken: loginPinResp.refreshToken,
      );

      // Tras loginPin exitoso, obtener datos actualizados del usuario.
      // pinEstablecido viene como booleano explícito en la respuesta.
      final meResponse = await dio.get('/auth/me');
      final usuarioData = meResponse.data as Map<String, dynamic>;
      final pinEstablecido = (usuarioData['pinEstablecido'] as bool?) ?? true;

      await storage.saveSession(
        userId: usuarioData['id'] as String,
        role: usuarioData['rol'] as String,
        name: usuarioData['nombre'] as String,
      );

      state = AuthAuthenticated(
        usuario: UsuarioDto(
          id: usuarioData['id'] as String,
          telefono: usuarioData['telefono'] as String,
          nombre: usuarioData['nombre'] as String,
          rol: usuarioData['rol'] as String,
          pinEstablecido: pinEstablecido,
        ),
        pinEstablecido: pinEstablecido,
        desbloqueado: true, // PIN validado: probó su identidad.
      );
    } on DioException catch (e) {
      // err.message ya viene traducido por ErrorInterceptor.
      state = AuthError(
        e.message ?? 'No pudimos conectar. Revisa tu conexión.',
      );
    } catch (e) {
      state = const AuthError('Ocurrió un error inesperado.');
    }
  }

  /// Establecer PIN de 4 dígitos en el servidor.
  Future<bool> setPin(String pin) async {
    try {
      await dio.post(
        '/auth/pin',
        data: SetPinRequest(pin: pin).toJson(),
      );
      // Tras setPin exitoso, actualizar estado para reflejar pinEstablecido=true.
      // desbloqueado se mantiene true: venía de un login con contraseña.
      final prev = state as AuthAuthenticated;
      state = AuthAuthenticated(
        usuario: prev.usuario,
        pinEstablecido: true,
        desbloqueado: prev.desbloqueado,
      );
      return true;
    } on DioException catch (e) {
      final statusCode = e.response?.statusCode;
      final serverCode = e.response?.data?['code'] as String?;
      final serverMessage = e.response?.data?['message'] as String?;
      if (kDebugMode) {
        debugPrint('[AuthState] setPin error: status=$statusCode code=$serverCode message=$serverMessage');
      }
      // El ErrorInterceptor ya traduce serverMessage, así que el estado AuthError
      // tendrá el mensaje real del servidor.
      state = AuthError(
        serverMessage ?? e.message ?? 'No pudimos guardar el PIN.',
      );
      return false;
    } catch (e) {
      if (kDebugMode) debugPrint('[AuthState] setPin error: $e');
      state = const AuthError('Ocurrió un error inesperado al guardar el PIN.');
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
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  final dio = ref.read(dioProvider);
  final storage = ref.read(tokenStorageProvider);
  return AuthNotifier(dio: dio, storage: storage);
});
