import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Almacenamiento seguro de tokens JWT y datos de sesión.
///
/// Usa flutter_secure_storage: en iOS usa Keychain, en Android usa
/// EncryptedSharedPreferences. Los tokens no se guardan en SharedPreferences
/// ni en archivos planos.
class TokenStorage {
  TokenStorage({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage(
          aOptions: AndroidOptions(encryptedSharedPreferences: true),
        );

  final FlutterSecureStorage _storage;

  static const _keyAccessToken = 'access_token';
  static const _keyRefreshToken = 'refresh_token';
  static const _keyUserId = 'user_id';
  static const _keyUserRole = 'user_role';
  static const _keyUserName = 'user_name';
  static const _keyPin = 'pin_hash';

  Future<String?> getAccessToken() => _storage.read(key: _keyAccessToken);
  Future<String?> getRefreshToken() => _storage.read(key: _keyRefreshToken);

  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    await _storage.write(key: _keyAccessToken, value: accessToken);
    await _storage.write(key: _keyRefreshToken, value: refreshToken);
  }

  Future<void> saveSession({
    required String userId,
    required String role,
    required String name,
  }) async {
    await _storage.write(key: _keyUserId, value: userId);
    await _storage.write(key: _keyUserRole, value: role);
    await _storage.write(key: _keyUserName, value: name);
  }

  Future<String?> getUserId() => _storage.read(key: _keyUserId);
  Future<String?> getUserRole() => _storage.read(key: _keyUserRole);
  Future<String?> getUserName() => _storage.read(key: _keyUserName);

  Future<void> savePin(String pinHash) =>
      _storage.write(key: _keyPin, value: pinHash);

  Future<String?> getPin() => _storage.read(key: _keyPin);

  Future<void> clearPin() => _storage.delete(key: _keyPin);

  Future<void> clearAll() => _storage.deleteAll();
}
