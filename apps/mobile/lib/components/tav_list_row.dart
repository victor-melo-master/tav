import 'package:flutter/material.dart';

import '../theme/tav_colors.dart';
import '../theme/tav_radius.dart';
import '../theme/tav_space.dart';
import '../theme/tav_text.dart';

/// Fila de lista — el componente más repetido de la app.
///
/// Operaciones, movimientos, beneficiarios y notificaciones son todos
/// la misma pieza con distinto contenido.
///
/// Altura de fila: 68px (con padding). Avatar: 42x42, radio 12.
class TavListRow extends StatelessWidget {
  const TavListRow({
    super.key,
    required this.title,
    this.subtitle,
    this.trailingTitle,
    this.trailingSubtitle,
    this.avatar,
    this.avatarColor,
    this.onTap,
    this.showDivider = true,
  });

  final String title;
  final String? subtitle;
  final String? trailingTitle;
  final String? trailingSubtitle;
  final Widget? avatar;
  final Color? avatarColor;
  final VoidCallback? onTap;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: TavSpace.lg,
          vertical: 13,
        ),
        child: Row(
          children: [
            if (avatar != null) ...[
              _buildAvatar(),
              const SizedBox(width: TavSpace.md),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TavText.body.copyWith(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      subtitle!,
                      style: TavText.caption.copyWith(color: TavColors.ink3),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
            if (trailingTitle != null) ...[
              const SizedBox(width: TavSpace.md),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    trailingTitle!,
                    style: TavText.body.copyWith(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (trailingSubtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      trailingSubtitle!,
                      style: TavText.caption.copyWith(
                        fontSize: 11,
                        color: TavColors.ink3,
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildAvatar() {
    return Container(
      width: 42,
      height: 42,
      decoration: BoxDecoration(
        color: avatarColor ?? TavColors.blue50,
        borderRadius: BorderRadius.circular(TavRadius.field),
      ),
      child: Center(child: avatar),
    );
  }
}
