import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Almacenamiento seguro de tokens JWT y datos de sesión.
///
/// Usa flutter_secure_storage: en iOS usa Keychain, en Android usa
/// EncryptedSharedPreferences. Los tokens no se guardan en SharedPreferences
/// ni en archivos planos.
///
/// Si el almacenamiento está corrupto (ej. tras restore de backup con clave vieja),
/// se limpia automáticamente y la app manda al usuario a login.
class TokenStorage {
  TokenStorage({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _keyAccessToken = 'access_token';
  static const _keyRefreshToken = 'refresh_token';
  static const _keyUserId = 'user_id';
  static const _keyUserRole = 'user_role';
  static const _keyUserName = 'user_name';

  Future<String?> getAccessToken() async {
    try {
      return await _storage.read(key: _keyAccessToken);
    } catch (e) {
      if (kDebugMode) debugPrint('[TokenStorage] Error reading access token: $e');
      await clearAll();
      return null;
    }
  }

  Future<String?> getRefreshToken() async {
    try {
      return await _storage.read(key: _keyRefreshToken);
    } catch (e) {
      if (kDebugMode) debugPrint('[TokenStorage] Error reading refresh token: $e');
      await clearAll();
      return null;
    }
  }

  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    try {
      await _storage.write(key: _keyAccessToken, value: accessToken);
      await _storage.write(key: _keyRefreshToken, value: refreshToken);
    } catch (e) {
      if (kDebugMode) debugPrint('[TokenStorage] Error saving tokens: $e');
      rethrow;
    }
  }

  Future<void> saveSession({
    required String userId,
    required String role,
    required String name,
  }) async {
    try {
      await _storage.write(key: _keyUserId, value: userId);
      await _storage.write(key: _keyUserRole, value: role);
      await _storage.write(key: _keyUserName, value: name);
    } catch (e) {
      if (kDebugMode) debugPrint('[TokenStorage] Error saving session: $e');
      rethrow;
    }
  }

  Future<String?> getUserId() async {
    try {
      return await _storage.read(key: _keyUserId);
    } catch (e) {
      if (kDebugMode) debugPrint('[TokenStorage] Error reading user id: $e');
      await clearAll();
      return null;
    }
  }

  Future<String?> getUserRole() async {
    try {
      return await _storage.read(key: _keyUserRole);
    } catch (e) {
      if (kDebugMode) debugPrint('[TokenStorage] Error reading user role: $e');
      await clearAll();
      return null;
    }
  }

  Future<String?> getUserName() async {
    try {
      return await _storage.read(key: _keyUserName);
    } catch (e) {
      if (kDebugMode) debugPrint('[TokenStorage] Error reading user name: $e');
      await clearAll();
      return null;
    }
  }

  Future<void> clearAll() async {
    try {
      await _storage.deleteAll();
    } catch (e) {
      if (kDebugMode) debugPrint('[TokenStorage] Error clearing storage: $e');
    }
  }
}
