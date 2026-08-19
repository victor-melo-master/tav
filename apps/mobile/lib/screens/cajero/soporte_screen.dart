import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_button.dart';
import '../../components/tav_card.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_radius.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';

/// Pantalla de soporte del cajero.
///
/// PENDIENTE DE DEFINIR: el canal de soporte real (WhatsApp, Telegram, etc.)
/// no está definido todavía. Esta pantalla muestra las opciones del prototipo.
class SoporteScreen extends StatelessWidget {
  const SoporteScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: TavColors.bg,
      appBar: AppBar(
        backgroundColor: TavColors.surface,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: TavColors.ink),
          onPressed: () => context.pop(),
        ),
        title: Text('Soporte', style: TavText.h2),
        centerTitle: false,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(TavSpace.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('¿Cómo podemos ayudarte?', style: TavText.body2.copyWith(color: TavColors.ink3)),
              const SizedBox(height: TavSpace.lg),
              TavCard(
                child: Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: const Color(0xFF25D366),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: const Icon(Icons.chat_outlined, color: Colors.white, size: 22),
                    ),
                    const SizedBox(width: 13),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('WhatsApp', style: TavText.h2.copyWith(fontSize: 15)),
                          const SizedBox(height: 2),
                          Text(
                            'Respuesta en minutos en horario laboral',
                            style: TavText.caption.copyWith(color: TavColors.ink3),
                          ),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right, color: TavColors.ink4, size: 22),
                  ],
                ),
              ),
              const SizedBox(height: TavSpace.md),
              TavCard(
                child: Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: TavColors.blue50,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: const Icon(Icons.phone_outlined, color: TavColors.blue, size: 22),
                    ),
                    const SizedBox(width: 13),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Llamada', style: TavText.h2.copyWith(fontSize: 15)),
                          const SizedBox(height: 2),
                          Text(
                            '+58 412-000-0000',
                            style: TavText.caption.copyWith(color: TavColors.ink3),
                          ),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right, color: TavColors.ink4, size: 22),
                  ],
                ),
              ),
              const SizedBox(height: TavSpace.lg),
              Text('Preguntas frecuentes', style: TavText.overline.copyWith(color: TavColors.ink3)),
              const SizedBox(height: TavSpace.sm),
              TavCard(
                padding: const EdgeInsets.symmetric(horizontal: TavSpace.lg, vertical: 0),
                child: Column(
                  children: [
                    _FaqRow(
                      pregunta: '¿Cómo abono a mi deuda?',
                      onTap: () => context.push('/cajero/cuenta'),
                    ),
                    _FaqRow(
                      pregunta: '¿Cómo solicito ampliación de cupo?',
                      onTap: () => context.push('/cajero/ampliacion'),
                    ),
                    _FaqRow(
                      pregunta: '¿Qué hago si mi operación está observada?',
                      onTap: () {},
                      showDivider: false,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: TavSpace.xxl),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(TavSpace.lg),
                decoration: BoxDecoration(
                  color: TavColors.bg,
                  borderRadius: BorderRadius.circular(TavRadius.card),
                ),
                child: Column(
                  children: [
                    Text('¿No encuentras lo que buscas?', style: TavText.body2.copyWith(color: TavColors.ink3)),
                    const SizedBox(height: TavSpace.md),
                    TavButton(
                      label: 'Escribir al administrador',
                      variant: TavButtonVariant.outline,
                      small: true,
                      onPressed: () {},
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FaqRow extends StatelessWidget {
  const _FaqRow({required this.pregunta, required this.onTap, this.showDivider = true});

  final String pregunta;
  final VoidCallback onTap;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 14),
            child: Row(
              children: [
                Expanded(
                  child: Text(pregunta, style: TavText.body.copyWith(fontSize: 14, fontWeight: FontWeight.w600)),
                ),
                const Icon(Icons.chevron_right, color: TavColors.ink4, size: 20),
              ],
            ),
          ),
          if (showDivider) const Divider(height: 0, color: TavColors.line2),
        ],
      ),
    );
  }
}
