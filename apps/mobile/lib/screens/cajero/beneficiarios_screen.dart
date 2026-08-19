import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../components/tav_button.dart';
import '../../components/tav_card.dart';
import '../../components/tav_list_row.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';

/// Pantalla de beneficiarios del cajero.
///
/// PENDIENTE DE DEFINIR: el endpoint de beneficiarios guardados no
/// existe todavía en la API. Esta pantalla muestra la estructura del
/// prototipo. Cuando se implemente el endpoint, se conecta aquí.
class BeneficiariosScreen extends StatelessWidget {
  const BeneficiariosScreen({super.key});

  // Datos de ejemplo del prototipo — NO production data.
  // PENDIENTE DE DEFINIR: conectar con endpoint de beneficiarios.
  static const _beneficiarios = [
    (
      nombre: 'Carmen Silva',
      banco: 'Banesco',
      cuenta: '0134 •••• 4521',
      metodo: 'Transferencia',
    ),
    (
      nombre: 'Luis Pérez',
      banco: 'BDV',
      cuenta: '0102 •••• 8830',
      metodo: 'Pago móvil',
    ),
    (
      nombre: 'Ana Rodríguez',
      banco: 'Mercantil',
      cuenta: '0105 •••• 1192',
      metodo: 'Transferencia',
    ),
  ];

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
        title: Text('Mis beneficiarios', style: TavText.h2),
        centerTitle: false,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(TavSpace.xl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Guarda tus contactos frecuentes para registrar operaciones más rápido.',
                style: TavText.body2.copyWith(color: TavColors.ink3, height: 1.55),
              ),
              const SizedBox(height: TavSpace.lg),
              TavCard(
                padding: const EdgeInsets.symmetric(horizontal: TavSpace.lg, vertical: 0),
                child: Column(
                  children: _beneficiarios.map((b) {
                    final idx = _beneficiarios.indexOf(b);
                    return TavListRow(
                      title: b.nombre,
                      subtitle: '${b.banco} · ${b.cuenta} · ${b.metodo}',
                      avatar: const Icon(Icons.person_outline, color: TavColors.blue, size: 20),
                      onTap: () {},
                      showDivider: idx < _beneficiarios.length - 1,
                    );
                  }).toList(),
                ),
              ),
              const SizedBox(height: TavSpace.xxl),
              TavButton(
                label: 'Agregar beneficiario',
                variant: TavButtonVariant.primary,
                icon: const Icon(Icons.person_add_outlined, size: 20),
                onPressed: () {},
              ),
            ],
          ),
        ),
      ),
    );
  }
}
