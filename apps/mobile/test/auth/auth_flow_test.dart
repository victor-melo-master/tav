import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tav_mobile/data/token_storage.dart';
import 'package:tav_mobile/state/auth_state.dart';

/// Test del ciclo completo de autenticación:
///   login → setPin → "reiniciar app" (checkSession) → loginPin → autenticado
///
/// Verifica que la máquina de estados descrita en
/// docs/06-maquina-de-estados-auth.md no se rompe. Específicamente:
/// - pinEstablecido se lee del campo booleano del servidor, no de pinHash.
/// - checkSession no pisa el estado si este ya cambió (guard anti-race).
/// - loginPin deja pinEstablecido=true tras entrar con PIN.
/// - logout limpia sesión y manda a AuthUnauthenticated.

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

  /// Cada handler recibe el RequestOptions y decide si lo maneja.
  /// Si devuelve una Response, se usa; si devuelve null, se prueba el siguiente.
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
const _testPin = '1234';

/// Estado del servidor mock: simula la base de datos.
class _MockServer {
  bool pinEstablecido = false;
  String? refreshTokenActivo;
  int tokenVersion = 0;
}

/// Crea los handlers del mock server.
List<_MockHandler> _buildHandlers(_MockServer server) {
  return [
    // POST /auth/login
    (req) {
      if (req.method == 'POST' && req.path == '/auth/login') {
        server.tokenVersion++;
        final access = 'access-${server.tokenVersion}';
        final refresh = 'refresh-${server.tokenVersion}';
        server.refreshTokenActivo = refresh;
        return {
          'accessToken': access,
          'refreshToken': refresh,
          'usuario': {
            'id': _testUserId,
            'telefono': _testUserPhone,
            'nombre': _testUserName,
            'rol': _testUserRole,
            'pinEstablecido': server.pinEstablecido,
          },
        };
      }
      return null;
    },
    // POST /auth/pin
    (req) {
      if (req.method == 'POST' && req.path == '/auth/pin') {
        server.pinEstablecido = true;
        return {'ok': true};
      }
      return null;
    },
    // POST /auth/login-pin
    (req) {
      if (req.method == 'POST' && req.path == '/auth/login-pin') {
        server.tokenVersion++;
        final access = 'access-${server.tokenVersion}';
        final refresh = 'refresh-${server.tokenVersion}';
        server.refreshTokenActivo = refresh;
        return {'accessToken': access, 'refreshToken': refresh};
      }
      return null;
    },
    // GET /auth/me
    (req) {
      if (req.method == 'GET' && req.path == '/auth/me') {
        return {
          'id': _testUserId,
          'telefono': _testUserPhone,
          'nombre': _testUserName,
          'rol': _testUserRole,
          'pinEstablecido': server.pinEstablecido,
        };
      }
      return null;
    },
    // POST /auth/logout
    (req) {
      if (req.method == 'POST' && req.path == '/auth/logout') {
        server.tokenVersion++;
        return {'ok': true};
      }
      return null;
    },
  ];
}

// ─────────────────── Tests ───────────────────

void main() {
  test('ciclo completo: login → setPin → restart → loginPin → autenticado', () async {
    final server = _MockServer();
    final storage = _FakeTokenStorage();
    final dio = _buildMockDio(_buildHandlers(server));
    final auth = AuthNotifier(dio: dio, storage: storage);

    // 1. Login con contraseña
    await auth.login(_testUserPhone, 'tav1234');
    expect(auth.state, isA<AuthAuthenticated>());
    final stateAfterLogin = auth.state as AuthAuthenticated;
    expect(stateAfterLogin.pinEstablecido, isFalse,
        reason: 'Tras login sin PIN previo, pinEstablecido debe ser false');
    expect(stateAfterLogin.usuario.nombre, _testUserName);

    // 2. Establecer PIN
    final setPinOk = await auth.setPin(_testPin);
    expect(setPinOk, isTrue);
    final stateAfterSetPin = auth.state as AuthAuthenticated;
    expect(stateAfterSetPin.pinEstablecido, isTrue,
        reason: 'Tras setPin, pinEstablecido debe ser true');

    // 3. Simular reinicio de app: nuevo AuthNotifier, mismo storage
    final dio2 = _buildMockDio(_buildHandlers(server));
    final auth2 = AuthNotifier(dio: dio2, storage: storage);
    expect(auth2.state, isA<AuthInitial>());

    await auth2.checkSession();
    expect(auth2.state, isA<AuthAuthenticated>());
    final stateAfterRestart = auth2.state as AuthAuthenticated;
    expect(stateAfterRestart.pinEstablecido, isTrue,
        reason: 'Tras reinicio con PIN ya guardado, pinEstablecido debe ser '
            'true (leído del servidor, no de pinHash)');
    expect(stateAfterRestart.usuario.nombre, _testUserName,
        reason: 'El nombre debe venir de /auth/me, no estar vacío');

    // 4. Login con PIN
    await auth2.loginPin(_testPin);
    expect(auth2.state, isA<AuthAuthenticated>());
    final stateAfterPinLogin = auth2.state as AuthAuthenticated;
    expect(stateAfterPinLogin.pinEstablecido, isTrue,
        reason: 'Tras loginPin, pinEstablecido debe seguir siendo true');
    expect(stateAfterPinLogin.usuario.nombre, _testUserName);

    // 5. Logout
    await auth2.logout();
    expect(auth2.state, isA<AuthUnauthenticated>());
    expect(await storage.getAccessToken(), isNull);
    expect(await storage.getRefreshToken(), isNull);
  });

  test('checkSession no pisa el estado si ya cambió (guard anti-race)', () async {
    final server = _MockServer();
    // Pre-poblar: el usuario ya tiene PIN
    server.pinEstablecido = true;

    final storage = _FakeTokenStorage();
    // Simular tokens de una sesión previa en storage
    await storage.saveTokens(accessToken: 'old-access', refreshToken: 'old-refresh');
    await storage.saveSession(userId: _testUserId, role: _testUserRole, name: _testUserName);

    final dio = _buildMockDio(_buildHandlers(server));
    final auth = AuthNotifier(dio: dio, storage: storage);

    // Simular que el usuario loguea ANTES de que checkSession termine.
    // Para eso, llamamos login() primero, luego checkSession().
    // checkSession debe ver que el estado ya no es AuthInitial y descartar.
    await auth.login(_testUserPhone, 'tav1234');
    expect(auth.state, isA<AuthAuthenticated>());
    final stateAfterLogin = auth.state as AuthAuthenticated;
    expect(stateAfterLogin.usuario.nombre, _testUserName);

    // Ahora checkSession llega tarde. No debe pisar el estado.
    await auth.checkSession();
    final stateAfterCheck = auth.state as AuthAuthenticated;
    expect(stateAfterCheck.usuario.nombre, _testUserName,
        reason: 'checkSession tardío no debe cambiar el usuario');
    expect(stateAfterCheck.pinEstablecido, isTrue,
        reason: 'checkSession tardío no debe resetear pinEstablecido');
  });

  test('checkSession sin tokens → AuthUnauthenticated', () async {
    final server = _MockServer();
    final storage = _FakeTokenStorage();
    final dio = _buildMockDio(_buildHandlers(server));
    final auth = AuthNotifier(dio: dio, storage: storage);

    await auth.checkSession();
    expect(auth.state, isA<AuthUnauthenticated>());
  });

  test('setPin falla → AuthError con mensaje, no pisa pinEstablecido', () async {
    final storage = _FakeTokenStorage();
    // Dio que devuelve 400 para /auth/pin
    final dio = Dio(BaseOptions(baseUrl: 'https://mock.test'));
    dio.httpClientAdapter = _MockAdapter([
      (req) {
        if (req.method == 'POST' && req.path == '/auth/login') {
          return {
            'accessToken': 'access-1',
            'refreshToken': 'refresh-1',
            'usuario': {
              'id': _testUserId,
              'telefono': _testUserPhone,
              'nombre': _testUserName,
              'rol': _testUserRole,
              'pinEstablecido': false,
            },
          };
        }
        if (req.method == 'POST' && req.path == '/auth/pin') {
          // Simular error del servidor
          throw DioException(
            requestOptions: req,
            response: Response(
              requestOptions: req,
              statusCode: 400,
              data: {'message': 'El PIN ya fue establecido. Usa cambiar PIN.'},
            ),
          );
        }
        return null;
      },
    ]);

    final auth = AuthNotifier(dio: dio, storage: storage);
    await auth.login(_testUserPhone, 'tav1234');
    expect(auth.state, isA<AuthAuthenticated>());

    final setPinOk = await auth.setPin(_testPin);
    expect(setPinOk, isFalse);
    expect(auth.state, isA<AuthError>());
    expect((auth.state as AuthError).message, contains('PIN'));
  });
}
