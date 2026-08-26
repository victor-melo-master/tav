import 'dart:math';

/// Genera un identificador único para idempotencia de escrituras de dinero.
///
/// Cada cobro llega con un clientUuid generado en el dispositivo. El campo
/// tiene índice único en la base: si la misma petición llega dos veces, la
/// segunda devuelve el registro existente sin crear nada nuevo.
///
/// No requiere el paquete `uuid`: combina microsegundos + aleatorio cripto
/// para garantizar unicidad práctica en un dispositivo de cobrador.
String generarClientUuid() {
  final r = Random.secure();
  final hex = List.generate(16, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
  // Formato UUID v4: 8-4-4-4-12, con bits de versión y variante.
  final v4 = '${hex.substring(0, 8)}-${hex.substring(8, 12)}-4${hex.substring(13, 16)}-'
      '${(r.nextInt(4) + 8).toRadixString(16)}${hex.substring(17, 20)}-${hex.substring(20, 32)}';
  return v4;
}
