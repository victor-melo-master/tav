import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/cobrador_api.dart';

/// Estado de carga compartido por las pantallas del cobrador.
sealed class CobradorDataState {
  const CobradorDataState();
}

class CobradorDataLoading extends CobradorDataState {
  const CobradorDataLoading();
}

class CobradorDataError extends CobradorDataState {
  const CobradorDataError(this.message);
  final String message;
}

class CobradorDataLoaded<T> extends CobradorDataState {
  const CobradorDataLoaded(this.data, {this.isRefreshing = false});
  final T data;
  final bool isRefreshing;
}

// ─────────────────────────── Cajeros ───────────────────────────

class CajerosCobradorNotifier extends StateNotifier<CobradorDataState> {
  CajerosCobradorNotifier(this.api) : super(const CobradorDataLoading());

  final CobradorApi api;

  Future<void> cargar() async {
    final anterior = state is CobradorDataLoaded
        ? (state as CobradorDataLoaded).data
        : null;
    if (anterior != null) {
      state = CobradorDataLoaded<List<CajeroCobradorDto>>(anterior as List<CajeroCobradorDto>, isRefreshing: true);
    } else {
      state = const CobradorDataLoading();
    }
    try {
      final lista = await api.cajeros();
      state = CobradorDataLoaded<List<CajeroCobradorDto>>(lista);
    } on DioException catch (e) {
      if (anterior != null) {
        state = CobradorDataLoaded<List<CajeroCobradorDto>>(anterior as List<CajeroCobradorDto>, isRefreshing: false);
      } else {
        state = CobradorDataError(e.message ?? 'No pudimos cargar los cajeros.');
      }
    } catch (e) {
      if (anterior != null) {
        state = CobradorDataLoaded<List<CajeroCobradorDto>>(anterior as List<CajeroCobradorDto>, isRefreshing: false);
      } else {
        state = const CobradorDataError('No pudimos cargar los cajeros.');
      }
    }
  }
}

final cajerosCobradorProvider =
    StateNotifierProvider<CajerosCobradorNotifier, CobradorDataState>((ref) {
  final api = ref.read(cobradorApiProvider);
  return CajerosCobradorNotifier(api);
});

// ─────────────────────────── Cierre actual ───────────────────────────

class CierreActualNotifier extends StateNotifier<CobradorDataState> {
  CierreActualNotifier(this.api) : super(const CobradorDataLoading());

  final CobradorApi api;

  Future<void> cargar() async {
    final anterior = state is CobradorDataLoaded
        ? (state as CobradorDataLoaded).data
        : null;
    if (anterior != null) {
      state = CobradorDataLoaded<CierreDto>(anterior as CierreDto, isRefreshing: true);
    } else {
      state = const CobradorDataLoading();
    }
    try {
      final cierre = await api.cierreActual();
      state = CobradorDataLoaded<CierreDto>(cierre);
    } on DioException catch (e) {
      if (anterior != null) {
        state = CobradorDataLoaded<CierreDto>(anterior as CierreDto, isRefreshing: false);
      } else {
        state = CobradorDataError(e.message ?? 'No pudimos cargar tu día.');
      }
    } catch (e) {
      if (anterior != null) {
        state = CobradorDataLoaded<CierreDto>(anterior as CierreDto, isRefreshing: false);
      } else {
        state = const CobradorDataError('No pudimos cargar tu día.');
      }
    }
  }
}

final cierreActualProvider =
    StateNotifierProvider<CierreActualNotifier, CobradorDataState>((ref) {
  final api = ref.read(cobradorApiProvider);
  return CierreActualNotifier(api);
});

// ─────────────────────────── Historial de cierres ───────────────────────────

class CierresNotifier extends StateNotifier<CobradorDataState> {
  CierresNotifier(this.api) : super(const CobradorDataLoading());

  final CobradorApi api;
  int _currentPage = 1;
  final int _limit = 20;
  List<CierreDto> _allItems = [];
  int _total = 0;

  Future<void> cargar() async {
    _currentPage = 1;
    _allItems = [];
    final anterior = state is CobradorDataLoaded
        ? (state as CobradorDataLoaded).data
        : null;
    if (anterior != null) {
      state = CobradorDataLoaded<({
        List<CierreDto> items,
        int total,
        bool hasMore
      })>(anterior as ({
        List<CierreDto> items,
        int total,
        bool hasMore
      }), isRefreshing: true);
    } else {
      state = const CobradorDataLoading();
    }
    await _cargarPagina();
  }

  Future<void> cargarMas() async {
    if (_allItems.length >= _total) return;
    _currentPage++;
    await _cargarPagina();
  }

  Future<void> _cargarPagina() async {
    final anterior = state is CobradorDataLoaded
        ? (state as CobradorDataLoaded).data
        : null;
    try {
      final pagina = await api.cierres(page: _currentPage, limit: _limit);
      _allItems = [..._allItems, ...pagina.items];
      _total = pagina.total;
      state = CobradorDataLoaded<({
        List<CierreDto> items,
        int total,
        bool hasMore
      })>((
        items: _allItems,
        total: _total,
        hasMore: _allItems.length < _total,
      ));
    } on DioException catch (e) {
      if (anterior != null) {
        state = CobradorDataLoaded<({
          List<CierreDto> items,
          int total,
          bool hasMore
        })>(anterior as ({
          List<CierreDto> items,
          int total,
          bool hasMore
        }), isRefreshing: false);
      } else {
        state = CobradorDataError(e.message ?? 'No pudimos cargar los cierres.');
      }
    } catch (e) {
      if (anterior != null) {
        state = CobradorDataLoaded<({
          List<CierreDto> items,
          int total,
          bool hasMore
        })>(anterior as ({
          List<CierreDto> items,
          int total,
          bool hasMore
        }), isRefreshing: false);
      } else {
        state = const CobradorDataError('No pudimos cargar los cierres.');
      }
    }
  }
}

final cierresProvider =
    StateNotifierProvider<CierresNotifier, CobradorDataState>((ref) {
  final api = ref.read(cobradorApiProvider);
  return CierresNotifier(api);
});
