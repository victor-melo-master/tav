import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../config/app_config.dart';
import 'auth_api.dart';
import 'token_storage.dart';

/// Crea el cliente Dio con el interceptor de refresh de token y el
/// interceptor de errores legibles.
///
/// Cuando una petición recibe 401, el interceptor de auth:
/// 1. Toma el refresh token del almacenamiento seguro.
/// 2. Llama a POST /auth/refresh para conseguir un nuevo access token.
/// 3. Reintenta la petición original con el nuevo token.
/// 4. Si el refresh falla, limpia los tokens y deja que el 401 llegue
///    para que la app vuelva al login.
///
/// El interceptor de errores traduce los fallos de red a mensajes legibles
/// en español para que nunca llegue un mensaje vacío a la interfaz.
Dio createDio(TokenStorage tokenStorage) {
  final dio = Dio(BaseOptions(
    baseUrl: AppConfig.apiBaseUrl,
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 15),
    sendTimeout: const Duration(seconds: 10),
    headers: {'Content-Type': 'application/json'},
  ));

  dio.interceptors.add(AuthInterceptor(tokenStorage: tokenStorage, dio: dio));
  dio.interceptors.add(ErrorInterceptor());

  return dio;
}

/// Traduce los fallos de red de Dio a mensajes legibles en español.
///
/// En modo debug imprime el error completo con la URL real a la que
/// intentó conectar — indispensable para diagnosticar problemas de
/// conectividad en dispositivo físico.
class ErrorInterceptor extends Interceptor {
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (kDebugMode) {
      final url = err.requestOptions.uri.toString();
      debugPrint('[DioError] ${err.type.name} → $url');
      if (err.response != null) {
        debugPrint('[DioError] status=${err.response?.statusCode} '
            'body=${err.response?.data}');
      }
      debugPrint('[DioError] ${err.message}');
    }

    final mensaje = _traducirError(err);
    handler.next(DioException(
      requestOptions: err.requestOptions,
      type: err.type,
      response: err.response,
      error: err.error,
      message: mensaje,
    ));
  }

  String _traducirError(DioException err) {
    // Si la API respondió con un mensaje, usarlo.
    if (err.response?.data is Map<String, dynamic>) {
      final apiMessage =
          (err.response!.data as Map<String, dynamic>)['message'] as String?;
      if (apiMessage != null && apiMessage.isNotEmpty) {
        return apiMessage;
      }
    }

    switch (err.type) {
      case DioExceptionType.connectionTimeout:
        return 'Tiempo de conexión agotado. Revisa tu red e intenta de nuevo.';
      case DioExceptionType.sendTimeout:
        return 'Tiempo agotado al enviar. Revisa tu red e intenta de nuevo.';
      case DioExceptionType.receiveTimeout:
        return 'El servidor tardó demasiado en responder. Intenta de nuevo.';
      case DioExceptionType.connectionError:
        return 'No pudimos conectar con el servidor. '
            'Verifica que estás en la misma red WiFi que tu Mac.';
      case DioExceptionType.badCertificate:
        return 'El certificado del servidor no es válido.';
      case DioExceptionType.cancel:
        return 'La petición fue cancelada.';
      case DioExceptionType.badResponse:
        final status = err.response?.statusCode;
        if (status == 401) {
          return 'Teléfono o contraseña incorrectos.';
        }
        if (status != null && status >= 500) {
          return 'El servidor tiene un problema. Intenta más tarde.';
        }
        return 'Error del servidor ($status).';
      case DioExceptionType.unknown:
        return 'Ocurrió un error inesperado. Intenta de nuevo.';
      case DioExceptionType.transformTimeout:
        return 'No pudimos procesar la respuesta del servidor. Intenta de nuevo.';
    }
  }
}

class AuthInterceptor extends Interceptor {
  AuthInterceptor({required this.tokenStorage, required this.dio});

  final TokenStorage tokenStorage;
  final Dio dio;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final token = await tokenStorage.getAccessToken();
    if (token != null && !_isAuthEndpoint(options.path)) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final statusCode = err.response?.statusCode;
    final isAuthEndpoint = _isAuthEndpoint(err.requestOptions.path);

    // Solo intentamos refresh si es 401 y no es un endpoint de auth
    // (para no entrar en loop infinito con /auth/refresh).
    if (statusCode == 401 && !isAuthEndpoint) {
      final refreshed = await _tryRefresh();
      if (refreshed) {
        try {
          final newToken = await tokenStorage.getAccessToken();
          final clonedRequest = err.requestOptions
            ..headers['Authorization'] = 'Bearer $newToken';
          final response = await dio.fetch(clonedRequest);
          handler.resolve(response);
          return;
        } catch (_) {
          // Si el reintento falla, cae al handler.next abajo
        }
      }
      // Refresh falló: limpiar sesión
      await tokenStorage.clearAll();
    }

    handler.next(err);
  }

  Future<bool> _tryRefresh() async {
    try {
      final refreshToken = await tokenStorage.getRefreshToken();
      if (refreshToken == null) return false;

      final response = await dio.post(
        '/auth/refresh',
        data: RefreshRequest(refreshToken: refreshToken).toJson(),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        final newAccess = response.data['accessToken'] as String;
        final newRefresh =
            (response.data['refreshToken'] as String?) ?? refreshToken;
        await tokenStorage.saveTokens(
          accessToken: newAccess,
          refreshToken: newRefresh,
        );
        return true;
      }
    } catch (_) {
      // Refresh falló: el 401 llega a la app
    }
    return false;
  }

  bool _isAuthEndpoint(String path) {
    return path.contains('/auth/login') ||
        path.contains('/auth/refresh') ||
        path.contains('/auth/pin');
  }
}
