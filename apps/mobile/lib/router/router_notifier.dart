import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/auth_state.dart';

/// ChangeNotifier que escucha cambios en authProvider
/// y notifica al GoRouter para re-evaluar redirects.
///
/// Esto es necesario porque GoRouter.redirect solo se ejecuta
/// ante eventos de navegación, no cuando cambia el estado de
/// los providers. Sin esto, tras un login exitoso el usuario
/// queda atrapado en /login porque redirect nunca se re-evalúa.
class RouterNotifier extends ChangeNotifier {
  RouterNotifier(this.ref);

  final Ref ref;

  AuthState get authState => ref.read(authProvider);

  void _update() {
    notifyListeners();
  }
}

/// Provider del RouterNotifier que escucha authProvider.
final routerNotifierProvider = Provider<RouterNotifier>((ref) {
  final notifier = RouterNotifier(ref);

  // Escuchar cambios en authProvider y notificar al router
  ref.listen<AuthState>(authProvider, (previous, next) {
    notifier._update();
  });

  return notifier;
});
