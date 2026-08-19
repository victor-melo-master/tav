import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'config/app_config.dart';
import 'router/tav_router.dart';
import 'state/auth_state.dart';
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

class _TavAppState extends ConsumerState<TavApp> {
  @override
  void initState() {
    super.initState();
    // Al arrancar, comprobar si hay sesión guardada.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(authProvider.notifier).checkSession();
    });
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
