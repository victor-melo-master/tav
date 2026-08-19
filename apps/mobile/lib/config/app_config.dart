import 'package:flutter/foundation.dart';

/// Configuración de la app que viene de fuera del código.
///
/// La URL base de la API se pasa con `--dart-define=API_BASE_URL=...` en el
/// comando `flutter run`. Esto evita quemar la URL en el código: iOS Simulator
/// usa `http://localhost:3001`, el emulador de Android necesita
/// `http://10.0.2.2:3001` para llegar al mismo sitio, y un dispositivo físico
/// usa la IP de la Mac en la red WiFi.
///
/// Ejemplo:
///   flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3001
///
/// Si no se pasa el define, cae en el default de iOS Simulator. Eso está bien
/// para desarrollo local; en producción el CI siempre lo pasa explícito.
class AppConfig {
  const AppConfig._();

  /// URL base de la API, sin slash final.
  /// Por defecto apunta a la API de producción. Para desarrollo local,
  /// pasar --dart-define=API_BASE_URL=http://localhost:3001.
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://api.tav.rolapro.com',
  );

  /// Imprime la URL efectiva al arrancar para diagnosticar problemas
  /// de conectividad en dispositivo físico.
  static void logConfig() {
    if (kDebugMode) {
      debugPrint('[AppConfig] API_BASE_URL = $apiBaseUrl');
    }
  }
}
