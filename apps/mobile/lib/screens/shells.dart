import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../theme/tav_colors.dart';
import '../theme/tav_radius.dart';
import '../theme/tav_text.dart';

/// Shell del cajero con barra inferior de 4 destinos + FAB central.
///
/// Destinos: Inicio, Operaciones, Cuenta, Perfil.
/// El FAB central abre el flujo de nueva operación (no es un destino).
/// Los contenidos van vacíos por ahora — solo la navegación.
class CajeroShell extends StatelessWidget {
  const CajeroShell({super.key, required this.child, required this.currentIndex});

  final Widget child;
  final int currentIndex;

  static const _destinations = [
    _NavDest(icon: Icons.home_outlined, label: 'Inicio'),
    _NavDest(icon: Icons.list_alt_outlined, label: 'Operaciones'),
    _NavDest(icon: Icons.account_balance_wallet_outlined, label: 'Cuenta'),
    _NavDest(icon: Icons.person_outline, label: 'Perfil'),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: TavColors.bg,
      body: child,
      bottomNavigationBar: _TavBottomNav(
        destinations: _destinations,
        currentIndex: currentIndex,
        onTap: (i) => _onTap(context, i),
        onFabTap: () => _onFabTap(context),
      ),
    );
  }

  void _onTap(BuildContext context, int index) {
    switch (index) {
      case 0:
        context.go('/cajero/inicio');
      case 1:
        context.go('/cajero/operaciones');
      case 2:
        context.go('/cajero/cuenta');
      case 3:
        context.go('/cajero/perfil');
    }
  }

  void _onFabTap(BuildContext context) {
    context.push('/cajero/operacion/tipo');
  }
}

/// Shell del cobrador con barra inferior de 4 destinos + FAB central.
///
/// Destinos: Mi día, Cajeros, Cuadre, Perfil.
class CobradorShell extends StatelessWidget {
  const CobradorShell({super.key, required this.child, required this.currentIndex});

  final Widget child;
  final int currentIndex;

  static const _destinations = [
    _NavDest(icon: Icons.home_outlined, label: 'Mi día'),
    _NavDest(icon: Icons.map_outlined, label: 'Cajeros'),
    _NavDest(icon: Icons.list_alt_outlined, label: 'Cuadre'),
    _NavDest(icon: Icons.person_outline, label: 'Perfil'),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: TavColors.bg,
      body: child,
      bottomNavigationBar: _TavBottomNav(
        destinations: _destinations,
        currentIndex: currentIndex,
        onTap: (i) => _onTap(context, i),
        onFabTap: () => _onFabTap(context),
      ),
    );
  }

  void _onTap(BuildContext context, int index) {
    switch (index) {
      case 0:
        context.go('/cobrador/mi-dia');
      case 1:
        context.go('/cobrador/cajeros');
      case 2:
        context.go('/cobrador/cuadre');
      case 3:
        context.go('/cobrador/perfil');
    }
  }

  void _onFabTap(BuildContext context) {
    context.push('/cobrador/cajeros');
  }
}

/// Modelo interno de destino de navegación.
class _NavDest {
  const _NavDest({required this.icon, required this.label});
  final IconData icon;
  final String label;
}

/// Barra de navegación inferior con FAB central.
///
/// Replica el prototipo:
/// - 4 destinos (2 izquierda, 2 derecha) + FAB central
/// - Altura: 76px. Fondo: surface. Borde superior: line.
/// - Tab inactivo: ink3. Tab activo: blue.
/// - FAB: 56x56, radio 19, azul, sombra azul, borde 4px surface.
class _TavBottomNav extends StatelessWidget {
  const _TavBottomNav({
    required this.destinations,
    required this.currentIndex,
    required this.onTap,
    required this.onFabTap,
  });

  final List<_NavDest> destinations;
  final int currentIndex;
  final ValueChanged<int> onTap;
  final VoidCallback onFabTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 76,
      decoration: const BoxDecoration(
        color: TavColors.surface,
        border: Border(top: BorderSide(color: TavColors.line)),
      ),
      // Stack con clipBehavior: Clip.none para que el FAB pueda sobresalir
      // por encima del borde superior de la barra sin recortarse.
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Row(
            children: [
              // 2 destinos izquierdos
              Expanded(
                child: _NavTab(
                  icon: destinations[0].icon,
                  label: destinations[0].label,
                  active: currentIndex == 0,
                  onTap: () => onTap(0),
                ),
              ),
              Expanded(
                child: _NavTab(
                  icon: destinations[1].icon,
                  label: destinations[1].label,
                  active: currentIndex == 1,
                  onTap: () => onTap(1),
                ),
              ),
              // Espacio central reservado para el FAB
              const SizedBox(width: 66),
              // 2 destinos derechos
              Expanded(
                child: _NavTab(
                  icon: destinations[2].icon,
                  label: destinations[2].label,
                  active: currentIndex == 2,
                  onTap: () => onTap(2),
                ),
              ),
              Expanded(
                child: _NavTab(
                  icon: destinations[3].icon,
                  label: destinations[3].label,
                  active: currentIndex == 3,
                  onTap: () => onTap(3),
                ),
              ),
            ],
          ),
          // FAB central posicionado sobre la barra, sobresaliendo 24px arriba.
          // Transform.translate desplaza el widget visualmente y su área táctil
          // se mueve con él, así que sigue siendo pulsable en toda su superficie.
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: Center(
              child: Transform.translate(
                offset: const Offset(0, -24),
                child: GestureDetector(
                  onTap: onFabTap,
                  behavior: HitTestBehavior.opaque,
                  child: Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      color: TavColors.blue,
                      borderRadius: BorderRadius.circular(TavRadius.fab),
                      border: Border.all(color: TavColors.surface, width: 4),
                      boxShadow: const [
                        BoxShadow(
                          color: Color(0x661F6FEB),
                          blurRadius: 20,
                          offset: Offset(0, 8),
                        ),
                      ],
                    ),
                    child: const Icon(
                      Icons.add,
                      color: TavColors.surface,
                      size: 24,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NavTab extends StatelessWidget {
  const _NavTab({
    required this.icon,
    required this.label,
    required this.active,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.only(top: 9),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.start,
          children: [
            Icon(
              icon,
              size: 20,
              color: active ? TavColors.blue : TavColors.ink3,
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: TavText.tab.copyWith(
                color: active ? TavColors.blue : TavColors.ink3,
              ),
            ),
          ],
        ),
      ),
    );
  }
}


