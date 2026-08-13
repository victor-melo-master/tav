import 'package:flutter/material.dart';

import 'config/app_config.dart';

void main() {
  runApp(const TavApp());
}

class TavApp extends StatelessWidget {
  const TavApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'TAV',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF2E7D32)),
        useMaterial3: true,
      ),
      home: const Scaffold(
        body: Center(
          child: Text('TAV — ${AppConfig.apiBaseUrl}'),
        ),
      ),
    );
  }
}
