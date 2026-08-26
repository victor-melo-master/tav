import 'package:flutter/material.dart';

import '../components/tav_chip.dart';
import '../theme/tav_colors.dart';

/// Helpers de presentación para las pantallas del cobrador.
///
/// El semáforo lo calcula el servidor (SemaforoService); aquí solo se
/// traduce su estado a chip y color para la interfaz. Nunca se recalcula.

/// Chip del semáforo a partir del estado que devuelve la API.
TavChipState semaforoChipState(String estado) => switch (estado) {
      'verde' => TavChipState.verde,
      'ambar' => TavChipState.ambar,
      'rojo' => TavChipState.rojo,
      _ => TavChipState.gris,
    };

/// Color del semáforo para barras y acentos.
Color semaforoColor(String estado) => switch (estado) {
      'verde' => TavColors.green600,
      'ambar' => TavColors.gold,
      'rojo' => TavColors.red,
      _ => TavColors.ink4,
    };

const _dias = [
  'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'
];
const _meses = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

/// "Jueves 6 de agosto" — fecha larga en español de Venezuela.
String fechaLarga(DateTime d) {
  final dia = _dias[d.weekday - 1];
  return '${dia[0].toUpperCase()}${dia.substring(1)} ${d.day} de ${_meses[d.month - 1]}';
}

/// "6 de agosto" — fecha corta sin día de semana.
String fechaCorta(DateTime d) => '${d.day} de ${_meses[d.month - 1]}';

/// "2:20 p.m." — hora en formato 12h venezolano.
String horaAmPm(DateTime d) {
  final h12 = d.hour % 12 == 0 ? 12 : d.hour % 12;
  final m = d.minute.toString().padLeft(2, '0');
  final ampm = d.hour < 12 ? 'a.m.' : 'p.m.';
  return '$h12:$m $ampm';
}

/// "hace 12 min" / "hace 3 h" / "hace 4 días" — relativo desde una atención.
String tiempoRelativo(DateTime desde, DateTime ahora) {
  final diff = ahora.difference(desde);
  if (diff.inMinutes < 1) return 'hace un momento';
  if (diff.inMinutes < 60) return 'hace ${diff.inMinutes} min';
  if (diff.inHours < 24) return 'hace ${diff.inHours} h';
  return 'hace ${diff.inDays} días';
}

/// Etiqueta corta del método de cobro para listas compactas.
String metodoCobroCorto(String metodoValor) => switch (metodoValor) {
      'efectivo_usd' => 'Efectivo',
      'bolivares' => 'Bs',
      'pago_movil' => 'Pago móvil',
      'usdt' => 'USDT',
      _ => metodoValor,
    };
