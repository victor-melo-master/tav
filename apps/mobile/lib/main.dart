import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'config/app_config.dart';
import 'router/tav_router.dart';
import 'state/auth_state.dart';
import 'state/cajero_state.dart';
import 'state/cobrador_state.dart';
import 'theme/tav_theme.dart';

void main() {
  AppConfig.logConfig();
  runApp(const ProviderScope(child: TavApp()));
}

class TavApp extends ConsumerStatefulWidget {
  const TavApp({super.key});

  @override
  ConsumerState<TavApp> createState() => _TavAppState();
}

class _TavAppState extends ConsumerState<TavApp>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Al arrancar, comprobar si hay sesión guardada.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(authProvider.notifier).checkSession();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);
    if (state == AppLifecycleState.resumed) {
      _refrescarDatosSiAutenticado();
    }
  }

  void _refrescarDatosSiAutenticado() {
    final auth = ref.read(authProvider);
    if (auth is! AuthAuthenticated) return;

    // Se actualizan todos los providers de datos abiertos. Si la pantalla
    // no está visible, el trabajo se hace en segundo plano; si está visible,
    // el widget la recibe cuando vuelve a renderizar.
    ref.read(resumenProvider.notifier).cargar();
    ref.read(tasasProvider.notifier).cargar();
    ref.read(operacionesProvider.notifier).cargar();
    ref.read(movimientosProvider.notifier).cargar();
    ref.read(ampliacionesProvider.notifier).cargar();
    ref.read(cajerosCobradorProvider.notifier).cargar();
    ref.read(cierreActualProvider.notifier).cargar();
    ref.read(cierresProvider.notifier).cargar();
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(tavRouterProvider);

    return MaterialApp.router(
      title: 'TAV',
      debugShowCheckedModeBanner: false,
      theme: buildTavTheme(),
      routerConfig: router,
    );
  }
}
