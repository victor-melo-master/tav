/// Traduce los estados de operación del enum de Prisma a textos en español
/// de Venezuela, con el color del chip correspondiente.
///
/// El estado nunca viaja solo: siempre se muestra con un chip de color
/// y un texto legible. Un cliente con daltonismo debe poder leer
/// su situación sin ver el color.
extension EstadoOperacionX on String {
  String get estadoLabel => switch (this) {
        'en_verificacion' => 'En verificación',
        'en_proceso' => 'En proceso',
        'completada' => 'Completada',
        'observada' => 'Observada',
        'rechazada' => 'Rechazada',
        'anulada' => 'Anulada',
        _ => this,
      };
}

/// Tipo de operación legible.
String tipoOperacionLabel(String tipo) => switch (tipo) {
      'usdt_bs' => 'USDT → Bolívares',
      'usd_efectivo_bs' => 'USD efectivo → Bs',
      _ => tipo,
    };

/// Tipo de movimiento legible.
String tipoMovimientoLabel(String tipo) => switch (tipo) {
      'cargo' => 'Cargo',
      'abono' => 'Abono',
      'reverso_cargo' => 'Reverso de cargo',
      'reverso_abono' => 'Reverso de abono',
      'ajuste' => 'Ajuste',
      _ => tipo,
    };

/// Iniciales del nombre para el avatar.
/// "María González" → "MG"
String inicialesNombre(String nombre) {
  final partes = nombre.trim().split(' ');
  if (partes.length >= 2) {
    return '${partes[0][0]}${partes[1][0]}'.toUpperCase();
  }
  if (partes.isNotEmpty && partes[0].isNotEmpty) {
    return partes[0][0].toUpperCase();
  }
  return '?';
}

/// Convierte un par de tasa ("USDT_BS") a etiqueta legible.
String parTasaLabel(String par) => switch (par) {
      'USDT_BS' => 'USDT → Bs',
      'USD_BS' => 'USD efectivo → Bs',
      'ZELLE_BS' => 'Zelle → Bs',
      _ => par,
    };

/// Símbolo de moneda por código ISO-4217 de tres letras.
///
/// Para monedas de corredores que no están en `TavMoneyCurrency` (BRL, COP,
/// DOP, MXN...). Las que sí están en `TavMoneyCurrency` se formatean con
/// `formatCents` directamente; este helper es para el texto suelto.
String simboloMoneda(String codigo) => switch (codigo) {
      'GYD' => 'G\$ ',
      'USD' => 'US\$ ',
      'USDT' => '',
      'BS' => 'Bs ',
      'BRL' => 'R\$ ',
      'COP' => 'COP ',
      'DOP' => 'RD\$ ',
      'MXN' => 'MX\$ ',
      _ => '$codigo ',
    };

/// Tiempo relativo en español de Venezuela: "hace 5 min", "hace 2 h",
/// "hace 3 d", o fecha "dd/MM" si pasó más de una semana.
String tiempoRelativo(DateTime fecha) {
  final ahora = DateTime.now();
  final diff = ahora.difference(fecha);
  if (diff.inMinutes < 1) return 'ahora';
  if (diff.inMinutes < 60) return 'hace ${diff.inMinutes} min';
  if (diff.inHours < 24) return 'hace ${diff.inHours} h';
  if (diff.inDays < 7) return 'hace ${diff.inDays} d';
  final d = fecha.day.toString().padLeft(2, '0');
  final m = fecha.month.toString().padLeft(2, '0');
  return '$d/$m';
}
