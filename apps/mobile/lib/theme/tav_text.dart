import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Tipografía del sistema de diseño.
///
/// Una sola familia: Inter (o la del sistema como respaldo).
/// Las cifras de dinero usan `font-feature-settings: 'tnum'` para que las
/// columnas de montos queden alineadas.
///
/// Pesos: solo 400 y 650 por pantalla.
class TavText {
  const TavText._();

  static TextStyle get display => GoogleFonts.inter(
        fontSize: 34,
        height: 1.15,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.03,
      );

  static TextStyle get h1 => GoogleFonts.inter(
        fontSize: 23,
        height: 1.25,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.02,
      );

  static TextStyle get h2 => GoogleFonts.inter(
        fontSize: 17,
        height: 1.3,
        fontWeight: FontWeight.w600,
      );

  static TextStyle get body => GoogleFonts.inter(
        fontSize: 15,
        height: 1.5,
        fontWeight: FontWeight.w400,
      );

  static TextStyle get body2 => GoogleFonts.inter(
        fontSize: 13.5,
        height: 1.55,
        fontWeight: FontWeight.w400,
      );

  static TextStyle get label => GoogleFonts.inter(
        fontSize: 12.5,
        height: 1.3,
        fontWeight: FontWeight.w600,
      );

  static TextStyle get caption => GoogleFonts.inter(
        fontSize: 11.5,
        height: 1.5,
        fontWeight: FontWeight.w400,
      );

  static TextStyle get overline => GoogleFonts.inter(
        fontSize: 12,
        height: 1.2,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.07,
      );

  /// Cifras de dinero con tabular numbers para alineación de columnas.
  static TextStyle get mono => GoogleFonts.inter(
        fontSize: 12.5,
        fontWeight: FontWeight.w400,
        fontFeatures: const [FontFeature.tabularFigures()],
      );

  /// Display de dinero: número grande, tabular.
  static TextStyle get moneyDisplay => GoogleFonts.inter(
        fontSize: 34,
        height: 1.15,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.03,
        fontFeatures: const [FontFeature.tabularFigures()],
      );

  /// Botones: 15px, peso 650.
  static TextStyle get button => GoogleFonts.inter(
        fontSize: 15,
        fontWeight: FontWeight.w600,
      );

  /// Keypad: 22px, peso 500.
  static TextStyle get keypad => GoogleFonts.inter(
        fontSize: 22,
        fontWeight: FontWeight.w500,
      );

  /// Tab bar: 10.5px, peso 600.
  static TextStyle get tab => GoogleFonts.inter(
        fontSize: 10.5,
        fontWeight: FontWeight.w600,
      );
}
