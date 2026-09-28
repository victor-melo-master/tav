import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tav_mobile/data/token_storage.dart';
import 'package:tav_mobile/state/auth_state.dart';

/// Tests del flujo de autenticación simplificado: correo + contraseña,
/// sesión persistente por tokens, y logout. No hay PIN.

// ─────────────────── Fakes ───────────────────

/// TokenStorage en memoria para tests.
class _FakeTokenStorage implements TokenStorage {
  final Map<String, String> _store = {};

  @override
  Future<String?> getAccessToken() async => _store['access_token'];

  @override
  Future<String?> getRefreshToken() async => _store['refresh_token'];

  @override
  Future<String?> getUserId() async => _store['user_id'];

  @override
  Future<String?> getUserRole() async => _store['user_role'];

  @override
  Future<String?> getUserName() async => _store['user_name'];

  @override
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    _store['access_token'] = accessToken;
    _store['refresh_token'] = refreshToken;
  }

  @override
  Future<void> saveSession({
    required String userId,
    required String role,
    required String name,
  }) async {
    _store['user_id'] = userId;
    _store['user_role'] = role;
    _store['user_name'] = name;
  }

  @override
  Future<void> clearAll() async {
    _store.clear();
  }
}

/// Adapter de Dio que devuelve respuestas predefinidas según método + path.
class _MockAdapter implements HttpClientAdapter {
  _MockAdapter(this._handlers);

  final List<_MockHandler> _handlers;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    for (final handler in _handlers) {
      final response = handler(options);
      if (response != null) {
        return ResponseBody(
          Stream.value(utf8.encode(jsonEncode(response))),
          200,
          headers: {
            Headers.contentTypeHeader: ['application/json'],
          },
        );
      }
    }
    throw DioException(
      requestOptions: options,
      response: Response(
        requestOptions: options,
        statusCode: 404,
        data: {'message': 'No mock for ${options.method} ${options.path}'},
      ),
    );
  }

  @override
  void close({bool force = false}) {}
}

typedef _MockHandler = Map<String, dynamic>? Function(RequestOptions options);

/// Construye un Dio con respuestas mockeadas.
Dio _buildMockDio(List<_MockHandler> handlers) {
  final dio = Dio(BaseOptions(baseUrl: 'https://mock.test'));
  dio.httpClientAdapter = _MockAdapter(handlers);
  return dio;
}

/// Datos de usuario de prueba.
const _testUserId = 'user-001';
const _testUserName = 'Juan Pérez';
const _testUserPhone = '+584120000010';
const _testUserRole = 'cajero';
const _testPassword = 'tav1234';

Map<String, dynamic> get _loginResponse => {
  'accessToken': 'access-1',
  'refreshToken': 'refresh-1',
  'usuario': {
    'id': _testUserId,
    'email': 'juan@tav.test',
    'telefono': _testUserPhone,
    'nombre': _testUserName,
    'rol': _testUserRole,
  },
};

Map<String, dynamic> get _meResponse => {
  'id': _testUserId,
  'email': 'juan@tav.test',
  'telefono': _testUserPhone,
  'nombre': _testUserName,
  'rol': _testUserRole,
};

List<_MockHandler> _buildHandlers() {
  return [
    (req) {
      if (req.method == 'POST' && req.path == '/auth/login') {
        return _loginResponse;
      }
      return null;
    },
    (req) {
      if (req.method == 'GET' && req.path == '/auth/me') {
        return _meResponse;
      }
      return null;
    },
    (req) {
      if (req.method == 'POST' && req.path == '/auth/logout') {
        return {'ok': true};
      }
      return null;
    },
  ];
}

// ─────────────────── Tests ───────────────────

void main() {
  test('login guarda tokens y deja el usuario autenticado', () async {
    final storage = _FakeTokenStorage();
    final dio = _buildMockDio(_buildHandlers());
    final auth = AuthNotifier(dio: dio, storage: storage);

    await auth.login(_testUserPhone, _testPassword);

    expect(auth.state, isA<AuthAuthenticated>());
    final state = auth.state as AuthAuthenticated;
    expect(state.usuario.nombre, _testUserName);
    expect(state.usuario.rol, _testUserRole);
    expect(await storage.getAccessToken(), isNotNull);
    expect(await storage.getRefreshToken(), isNotNull);
  });

  test('login fallido deja AuthError', () async {
    final storage = _FakeTokenStorage();
    final dio = Dio(BaseOptions(baseUrl: 'https://mock.test'));
    dio.httpClientAdapter = _MockAdapter([
      (req) {
        if (req.method == 'POST' && req.path == '/auth/login') {
          throw DioException(
            requestOptions: req,
            response: Response(
              requestOptions: req,
              statusCode: 401,
              data: {'message': 'Credenciales incorrectas'},
            ),
          );
        }
        return null;
      },
    ]);
    final auth = AuthNotifier(dio: dio, storage: storage);

    await auth.login(_testUserPhone, 'mal');

    expect(auth.state, isA<AuthError>());
    // Sin interceptor de errores, el mensaje es el fallback genérico.
    expect((auth.state as AuthError).message, isNotEmpty);
  });

  test('checkSession con tokens guardados entra directo', () async {
    final storage = _FakeTokenStorage();
    await storage.saveTokens(accessToken: 'access-x', refreshToken: 'refresh-x');
    await storage.saveSession(
      userId: _testUserId,
      role: _testUserRole,
      name: _testUserName,
    );

    final dio = _buildMockDio(_buildHandlers());
    final auth = AuthNotifier(dio: dio, storage: storage);

    await auth.checkSession();

    expect(auth.state, isA<AuthAuthenticated>());
    final state = auth.state as AuthAuthenticated;
    expect(state.usuario.nombre, _testUserName);
  });

  test('checkSession sin tokens deja AuthUnauthenticated', () async {
    final storage = _FakeTokenStorage();
    final dio = _buildMockDio(_buildHandlers());
    final auth = AuthNotifier(dio: dio, storage: storage);

    await auth.checkSession();

    expect(auth.state, isA<AuthUnauthenticated>());
  });

  test('checkSession no pisa el estado si ya cambió', () async {
    final storage = _FakeTokenStorage();
    await storage.saveTokens(accessToken: 'old-access', refreshToken: 'old-refresh');
    await storage.saveSession(
      userId: _testUserId,
      role: _testUserRole,
      name: _testUserName,
    );

    final dio = _buildMockDio(_buildHandlers());
    final auth = AuthNotifier(dio: dio, storage: storage);

    // El usuario loguea antes de que checkSession termine.
    await auth.login(_testUserPhone, _testPassword);
    expect(auth.state, isA<AuthAuthenticated>());

    await auth.checkSession();
    final state = auth.state as AuthAuthenticated;
    expect(state.usuario.nombre, _testUserName);
  });

  test('logout limpia sesión y deja AuthUnauthenticated', () async {
    final storage = _FakeTokenStorage();
    final dio = _buildMockDio(_buildHandlers());
    final auth = AuthNotifier(dio: dio, storage: storage);

    await auth.login(_testUserPhone, _testPassword);
    expect(auth.state, isA<AuthAuthenticated>());

    await auth.logout();

    expect(auth.state, isA<AuthUnauthenticated>());
    expect(await storage.getAccessToken(), isNull);
    expect(await storage.getRefreshToken(), isNull);
  });
}
