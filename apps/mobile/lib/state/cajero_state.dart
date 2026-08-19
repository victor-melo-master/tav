import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/cajero_api.dart';

/// Estado de carga para las pantallas del cajero.
sealed class CajeroDataState {
  const CajeroDataState();
}

class CajeroDataLoading extends CajeroDataState {
  const CajeroDataLoading();
}

class CajeroDataError extends CajeroDataState {
  const CajeroDataError(this.message);
  final String message;
}

class CajeroDataLoaded<T> extends CajeroDataState {
  const CajeroDataLoaded(this.data);
  final T data;
}

// ─────────────────────────── Resumen ───────────────────────────

class ResumenNotifier extends StateNotifier<CajeroDataState> {
  ResumenNotifier(this.api) : super(const CajeroDataLoading());

  final CajeroApi api;

  Future<void> cargar() async {
    state = const CajeroDataLoading();
    try {
      final resumen = await api.resumen();
      state = CajeroDataLoaded<ResumenDto>(resumen);
    } on DioException catch (e) {
      state = CajeroDataError(e.message ?? 'No pudimos cargar tu resumen.');
    } catch (e) {
      state = const CajeroDataError('No pudimos cargar tu resumen.');
    }
  }
}

final resumenProvider =
    StateNotifierProvider<ResumenNotifier, CajeroDataState>((ref) {
  final api = ref.read(cajeroApiProvider);
  return ResumenNotifier(api);
});

// ─────────────────────────── Tasas ───────────────────────────

class TasasNotifier extends StateNotifier<CajeroDataState> {
  TasasNotifier(this.api) : super(const CajeroDataLoading());

  final CajeroApi api;

  Future<void> cargar() async {
    state = const CajeroDataLoading();
    try {
      final tasas = await api.tasasVigentes();
      state = CajeroDataLoaded<List<TasaDto>>(tasas);
    } on DioException catch (e) {
      state = CajeroDataError(e.message ?? 'No pudimos cargar las tasas.');
    } catch (e) {
      state = const CajeroDataError('No pudimos cargar las tasas.');
    }
  }
}

final tasasProvider =
    StateNotifierProvider<TasasNotifier, CajeroDataState>((ref) {
  final api = ref.read(cajeroApiProvider);
  return TasasNotifier(api);
});

// ─────────────────────────── Operaciones ───────────────────────────

class OperacionesNotifier extends StateNotifier<CajeroDataState> {
  OperacionesNotifier(this.api) : super(const CajeroDataLoading());

  final CajeroApi api;
  int _currentPage = 1;
  final int _limit = 20;
  List<OperacionDto> _allItems = [];
  int _total = 0;
  String? _estadoFiltro;

  Future<void> cargar({String? estado}) async {
    _estadoFiltro = estado;
    _currentPage = 1;
    _allItems = [];
    state = const CajeroDataLoading();
    await _cargarPagina();
  }

  Future<void> cargarMas() async {
    if (_allItems.length >= _total) return;
    _currentPage++;
    await _cargarPagina();
  }

  Future<void> _cargarPagina() async {
    try {
      final pagina = await api.operaciones(
        page: _currentPage,
        limit: _limit,
        estado: _estadoFiltro,
      );
      _allItems = [..._allItems, ...pagina.items];
      _total = pagina.total;
      state = CajeroDataLoaded<({
        List<OperacionDto> items,
        int total,
        bool hasMore
      })>((
        items: _allItems,
        total: _total,
        hasMore: _allItems.length < _total,
      ));
    } on DioException catch (e) {
      state = CajeroDataError(e.message ?? 'No pudimos cargar las operaciones.');
    } catch (e) {
      state = const CajeroDataError('No pudimos cargar las operaciones.');
    }
  }
}

final operacionesProvider =
    StateNotifierProvider<OperacionesNotifier, CajeroDataState>((ref) {
  final api = ref.read(cajeroApiProvider);
  return OperacionesNotifier(api);
});

// ─────────────────────────── Movimientos ───────────────────────────

class MovimientosNotifier extends StateNotifier<CajeroDataState> {
  MovimientosNotifier(this.api) : super(const CajeroDataLoading());

  final CajeroApi api;
  int _currentPage = 1;
  final int _limit = 20;
  List<MovimientoDto> _allItems = [];
  int _total = 0;

  Future<void> cargar() async {
    _currentPage = 1;
    _allItems = [];
    state = const CajeroDataLoading();
    await _cargarPagina();
  }

  Future<void> cargarMas() async {
    if (_allItems.length >= _total) return;
    _currentPage++;
    await _cargarPagina();
  }

  Future<void> _cargarPagina() async {
    try {
      final pagina = await api.movimientos(page: _currentPage, limit: _limit);
      _allItems = [..._allItems, ...pagina.items];
      _total = pagina.total;
      state = CajeroDataLoaded<({
        List<MovimientoDto> items,
        int total,
        bool hasMore
      })>((
        items: _allItems,
        total: _total,
        hasMore: _allItems.length < _total,
      ));
    } on DioException catch (e) {
      state = CajeroDataError(e.message ?? 'No pudimos cargar los movimientos.');
    } catch (e) {
      state = const CajeroDataError('No pudimos cargar los movimientos.');
    }
  }
}

final movimientosProvider =
    StateNotifierProvider<MovimientosNotifier, CajeroDataState>((ref) {
  final api = ref.read(cajeroApiProvider);
  return MovimientosNotifier(api);
});

// ─────────────────────────── Ampliaciones ───────────────────────────

class AmpliacionesNotifier extends StateNotifier<CajeroDataState> {
  AmpliacionesNotifier(this.api) : super(const CajeroDataLoading());

  final CajeroApi api;

  Future<void> cargar() async {
    state = const CajeroDataLoading();
    try {
      final lista = await api.ampliaciones();
      state = CajeroDataLoaded<List<AmpliacionDto>>(lista);
    } on DioException catch (e) {
      state = CajeroDataError(e.message ?? 'No pudimos cargar las ampliaciones.');
    } catch (e) {
      state = const CajeroDataError('No pudimos cargar las ampliaciones.');
    }
  }
}

final ampliacionesProvider =
    StateNotifierProvider<AmpliacionesNotifier, CajeroDataState>((ref) {
  final api = ref.read(cajeroApiProvider);
  return AmpliacionesNotifier(api);
});
