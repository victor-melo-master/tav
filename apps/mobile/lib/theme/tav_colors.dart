import 'package:flutter/material.dart';

/// Tokens de color del sistema de diseño TAV.
///
/// Traducción exacta de design/TAV_design_system.html.
/// Los ratios de contraste fueron calculados, no estimados.
///
/// Reglas:
/// - El azul se reserva para acciones, el navy para superficies de dinero.
/// - Verde, ámbar y rojo son exclusivamente semánticos: nunca decorativos.
/// - [ink4] (#98A2B3) no se usa NUNCA para texto. Solo para iconos muted.
/// - El verde de botones es [green600] (#2E7D32), no [green] (#4CAF50).
///   #4CAF50 es solo relleno.
/// - El gris de texto secundario es [ink3] (#667085), no [ink4].
class TavColors {
  const TavColors._();

  // ── Marca ──
  static const navy = Color(0xFF0B1B33);
  static const blue = Color(0xFF1F6FEB); // acción
  static const blue600 = Color(0xFF1558C7); // texto azul
  static const blue50 = Color(0xFFEAF2FE);

  // ── Semántico: verde (éxito, abono) ──
  static const green = Color(0xFF4CAF50); // solo relleno
  static const green600 = Color(0xFF2E7D32); // texto y botón
  static const green50 = Color(0xFFEAF7EB);

  // ── Semántico: ámbar (advertencia, por vencer) ──
  static const gold = Color(0xFFD9A441);
  static const gold700 = Color(0xFF8A6010);
  static const gold50 = Color(0xFFFBF3E3);

  // ── Semántico: rojo (error, deuda, rechazado) ──
  static const red = Color(0xFFE5484D);
  static const red700 = Color(0xFFB42318);
  static const red50 = Color(0xFFFDECEC);

  // ── Superficies ──
  static const bg = Color(0xFFF4F5F7); // fondo de pantallas
  static const surface = Color(0xFFFFFFFF); // tarjetas, campos, barras
  static const line = Color(0xFFE5E8EC); // bordes 1px
  static const line2 = Color(0xFFEFF1F4); // divisores internos

  // ── Tinta (texto) ──
  static const ink = Color(0xFF101828); // títulos y cifras — 17.75:1 AAA
  static const ink2 = Color(0xFF475467); // texto secundario fuerte
  static const ink3 = Color(0xFF667085); // texto secundario — el gris correcto
  static const ink4 = Color(0xFF98A2B3); // NUNCA texto — solo iconos muted

  // ── Sombras ──
  static const cardShadow = [
    BoxShadow(color: Color(0x0D101828), blurRadius: 2, offset: Offset(0, 1)),
    BoxShadow(color: Color(0x0F101828), blurRadius: 24, offset: Offset(0, 8)),
  ];

  static const floatingShadow = [
    BoxShadow(color: Color(0x29101828), blurRadius: 32, offset: Offset(0, 12)),
  ];

  // ── Colores de chip por estado de semáforo ──
  // Fondo / texto para cada estado.
  static const semaforoVerde = (bg: green50, text: Color(0xFF256B2A));
  static const semaforoAmbar = (bg: gold50, text: gold700);
  static const semaforoRojo = (bg: red50, text: red700);
}
