/// Modelos de la API de autenticación.
///
/// Los montos llegan de la API como string y se manejan como int de centavos.
/// Nunca double.
library;

class LoginRequest {
  const LoginRequest({required this.email, required this.password});

  final String email;
  final String password;

  Map<String, dynamic> toJson() => {
        'email': email,
        'password': password,
      };
}

class LoginResponse {
  const LoginResponse({
    required this.accessToken,
    required this.refreshToken,
    required this.usuario,
  });

  final String accessToken;
  final String refreshToken;
  final UsuarioDto usuario;

  factory LoginResponse.fromJson(Map<String, dynamic> json) {
    return LoginResponse(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
      usuario: UsuarioDto.fromJson(json['usuario'] as Map<String, dynamic>),
    );
  }
}

class UsuarioDto {
  const UsuarioDto({
    required this.id,
    required this.email,
    this.telefono,
    required this.nombre,
    required this.rol,
    this.pinEstablecido = false,
  });

  final String id;
  final String email;
  final String? telefono;
  final String nombre;
  final String rol;
  final bool pinEstablecido;

  factory UsuarioDto.fromJson(Map<String, dynamic> json) {
    return UsuarioDto(
      id: json['id'] as String,
      email: json['email'] as String,
      telefono: json['telefono'] as String?,
      nombre: json['nombre'] as String,
      rol: json['rol'] as String,
      pinEstablecido: (json['pinEstablecido'] as bool?) ?? false,
    );
  }
}

class RefreshRequest {
  const RefreshRequest({required this.refreshToken});

  final String refreshToken;

  Map<String, dynamic> toJson() => {'refreshToken': refreshToken};
}

class SetPinRequest {
  const SetPinRequest({required this.pin});

  final String pin;

  Map<String, dynamic> toJson() => {'pin': pin};
}

class LoginPinRequest {
  const LoginPinRequest({required this.refreshToken, required this.pin});

  final String refreshToken;
  final String pin;

  Map<String, dynamic> toJson() => {
        'refreshToken': refreshToken,
        'pin': pin,
      };
}

class LoginPinResponse {
  const LoginPinResponse({
    required this.accessToken,
    required this.refreshToken,
  });

  final String accessToken;
  final String refreshToken;

  factory LoginPinResponse.fromJson(Map<String, dynamic> json) {
    return LoginPinResponse(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
    );
  }
}

/// Decodifica el JWT para extraer el rol sin verificar la firma.
/// La verificación la hace el servidor; esto es solo para enrutado.
String extractRoleFromJwt(String jwt) {
  try {
    final parts = jwt.split('.');
    if (parts.length != 3) return '';
    final payload = parts[1];
    // Base64 padding
    final normalized = payload.padBase64();
    final decoded = String.fromCharCodes(
      normalized.codeUnits.map((c) => c),
    );
    // Buscar "rol":"..." en el payload decodificado
    final rolMatch = RegExp(r'"rol"\s*:\s*"([^"]+)"').firstMatch(decoded);
    return rolMatch?.group(1) ?? '';
  } catch (_) {
    return '';
  }
}

extension on String {
  String padBase64() {
    final rem = length % 4;
    return rem == 0 ? this : '$this${'=' * (4 - rem)}';
  }
}
