import 'package:flutter/material.dart';

import 'tav_colors.dart';
import 'tav_text.dart';

/// Construye el ThemeData de la app desde los tokens de diseño.
/// Nadie escribe un color inline en un widget: todo sale de aquí o de TavColors.
ThemeData buildTavTheme() {
  return ThemeData(
    useMaterial3: true,
    scaffoldBackgroundColor: TavColors.bg,
    colorScheme: ColorScheme.fromSeed(
      seedColor: TavColors.blue,
      primary: TavColors.blue,
      surface: TavColors.surface,
      error: TavColors.red,
      onPrimary: TavColors.surface,
      onSurface: TavColors.ink,
    ),
    textTheme: TextTheme(
      displayLarge: TavText.display,
      headlineMedium: TavText.h1,
      headlineSmall: TavText.h2,
      bodyLarge: TavText.body,
      bodyMedium: TavText.body2,
      labelLarge: TavText.label,
      labelSmall: TavText.caption,
    ),
    fontFamily: TavText.body.fontFamily,
    appBarTheme: const AppBarTheme(
      backgroundColor: TavColors.surface,
      foregroundColor: TavColors.ink,
      elevation: 0,
      centerTitle: false,
    ),
    dividerColor: TavColors.line,
    splashFactory: NoSplash.splashFactory,
  );
}
