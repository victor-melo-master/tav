import 'package:flutter/material.dart';

import '../theme/tav_colors.dart';
import '../theme/tav_radius.dart';
import '../theme/tav_space.dart';
import '../theme/tav_text.dart';

/// Campo de texto del sistema de diseño.
///
/// Altura: 50px. Radio: 12px. Borde: 1px [TavColors.line].
/// Foco: borde azul + sombra blue-50. Error: borde rojo + sombra red-50.
class TavField extends StatelessWidget {
  const TavField({
    super.key,
    required this.label,
    this.controller,
    this.obscureText = false,
    this.keyboardType,
    this.placeholder,
    this.hint,
    this.errorText,
    this.prefix,
    this.suffix,
    this.onChanged,
    this.onSubmitted,
    this.autofocus = false,
    this.enabled = true,
  });

  final String label;
  final TextEditingController? controller;
  final bool obscureText;
  final TextInputType? keyboardType;
  final String? placeholder;
  final String? hint;
  final String? errorText;
  final Widget? prefix;
  final Widget? suffix;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final bool autofocus;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final hasError = errorText != null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TavText.label.copyWith(color: TavColors.ink2),
        ),
        const SizedBox(height: 6),
        SizedBox(
          height: 50,
          child: TextField(
            controller: controller,
            obscureText: obscureText,
            keyboardType: keyboardType,
            autofocus: autofocus,
            enabled: enabled,
            onChanged: onChanged,
            onSubmitted: onSubmitted,
            style: TavText.body,
            decoration: InputDecoration(
              hintText: placeholder,
              hintStyle: TavText.body.copyWith(color: TavColors.ink3),
              prefixIcon: prefix != null
                  ? Padding(
                      padding: const EdgeInsets.only(left: TavSpace.md),
                      child: Center(child: prefix),
                    )
                  : null,
              prefixIconConstraints: const BoxConstraints(
                minWidth: 0,
                minHeight: 0,
              ),
              suffixIcon: suffix != null
                  ? Padding(
                      padding: const EdgeInsets.only(right: TavSpace.md),
                      child: Center(child: suffix),
                    )
                  : null,
              suffixIconConstraints: const BoxConstraints(
                minWidth: 0,
                minHeight: 0,
              ),
              contentPadding: const EdgeInsets.symmetric(
                horizontal: TavSpace.md,
              ),
              filled: true,
              fillColor: TavColors.surface,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(TavRadius.field),
                borderSide: const BorderSide(color: TavColors.line),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(TavRadius.field),
                borderSide: const BorderSide(color: TavColors.line),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(TavRadius.field),
                borderSide: const BorderSide(color: TavColors.blue),
              ),
              errorBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(TavRadius.field),
                borderSide: const BorderSide(color: TavColors.red),
              ),
              focusedErrorBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(TavRadius.field),
                borderSide: const BorderSide(color: TavColors.red),
              ),
            ),
          ),
        ),
        if (hint != null && !hasError) ...[
          const SizedBox(height: 6),
          Text(hint!, style: TavText.caption.copyWith(color: TavColors.ink3)),
        ],
        if (hasError) ...[
          const SizedBox(height: 6),
          Text(
            errorText!,
            style: TavText.caption.copyWith(color: TavColors.red),
          ),
        ],
      ],
    );
  }
}
