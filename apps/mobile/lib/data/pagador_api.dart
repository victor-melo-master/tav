/// DTOs de la API del pagador.
///
/// Los montos llegan como string (BigInt serializado en JSON) y se
/// convierten a int de centavos aquí. Nunca double.
library;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/auth_state.dart';
// ─────────────────────────── Cola ───────────────────────────

class ItemColaPagadorDto {
  const ItemColaPagadorDto({
    required this.id,
    required this.folio,
    required this.montoDestinoCents,
    required this.monedaDestino,
    required this.beneficiario,
    required this.creadaAt,
    required this.corredor,
    required this.cajaId,
  });

  final String id;
  final String folio;
  final int montoDestinoCents;
  final String monedaDestino;
  final Map<String, dynamic> beneficiario;
  final DateTime creadaAt;
  final CorredorColaDto corredor;
  final String? cajaId;

  factory ItemColaPagadorDto.fromJson(Map<String, dynamic> json) {
    return ItemColaPagadorDto(
      id: json['id'] as String,
      folio: json['folio'] as String,
      montoDestinoCents: int.parse(json['montoDestinoCents'] as String),
      monedaDestino: json['monedaDestino'] as String,
      beneficiario: json['beneficiario'] as Map<String, dynamic>,
      creadaAt: DateTime.parse(json['creadaAt'] as String),
      corredor: CorredorColaDto.fromJson(json['corredor'] as Map<String, dynamic>),
      cajaId: json['cajaId'] as String?,
    );
  }
}

class CorredorColaDto {
  const CorredorColaDto({
    required this.id,
    required this.pais,
    required this.paisNombre,
    required this.moneda,
    required this.monedaNombre,
    required this.formaEntrega,
    required this.formaEntregaNombre,
  });

  final String id;
  final String pais;
  final String paisNombre;
  final String moneda;
  final String monedaNombre;
  final String formaEntrega;
  final String formaEntregaNombre;

  factory CorredorColaDto.fromJson(Map<String, dynamic> json) {
    return CorredorColaDto(
      id: json['id'] as String,
      pais: json['pais'] as String,
      paisNombre: json['paisNombre'] as String,
      moneda: json['moneda'] as String,
      monedaNombre: json['monedaNombre'] as String,
      formaEntrega: json['formaEntrega'] as String,
      formaEntregaNombre: json['formaEntregaNombre'] as String,
    );
  }
}

// ─────────────────────────── Pago del día ───────────────────────────

class PagoDelDiaDto {
  const PagoDelDiaDto({
    required this.id,
    required this.folio,
    required this.montoDestinoCents,
    required this.monedaDestino,
    required this.beneficiario,
    required this.tasaEjecucion,
    required this.formaPago,
    required this.nombreCliente,
    required this.pagadaAt,
    required this.corredor,
  });

  final String id;
  final String folio;
  final int montoDestinoCents;
  final String monedaDestino;
  final Map<String, dynamic> beneficiario;
  final String? tasaEjecucion;
  final String? formaPago;
  final String? nombreCliente;
  final DateTime pagadaAt;
  final CorredorPagoDto corredor;

  factory PagoDelDiaDto.fromJson(Map<String, dynamic> json) {
    return PagoDelDiaDto(
      id: json['id'] as String,
      folio: json['folio'] as String,
      montoDestinoCents: int.parse(json['montoDestinoCents'] as String),
      monedaDestino: json['monedaDestino'] as String,
      beneficiario: json['beneficiario'] as Map<String, dynamic>,
      tasaEjecucion: json['tasaEjecucion'] as String?,
      formaPago: json['formaPago'] as String?,
      nombreCliente: json['nombreCliente'] as String?,
      pagadaAt: DateTime.parse(json['pagadaAt'] as String),
      corredor: CorredorPagoDto.fromJson(json['corredor'] as Map<String, dynamic>),
    );
  }
}

class CorredorPagoDto {
  const CorredorPagoDto({
    required this.id,
    required this.paisNombre,
    required this.moneda,
    required this.monedaNombre,
    required this.formaEntregaNombre,
  });

  final String id;
  final String paisNombre;
  final String moneda;
  final String monedaNombre;
  final String formaEntregaNombre;

  factory CorredorPagoDto.fromJson(Map<String, dynamic> json) {
    return CorredorPagoDto(
      id: json['id'] as String,
      paisNombre: json['paisNombre'] as String,
      moneda: json['moneda'] as String,
      monedaNombre: json['monedaNombre'] as String,
      formaEntregaNombre: json['formaEntregaNombre'] as String,
    );
  }
}

// ─────────────────────────── Petición ───────────────────────────

class EjecutarPagoRequest {
  const EjecutarPagoRequest({
    required this.clientUuid,
    required this.operacionId,
    required this.montoCents,
    required this.tasaEjecucion,
    required this.formaPago,
    required this.nombreCliente,
  });

  final String clientUuid;
  final String operacionId;
  final String montoCents;
  final String tasaEjecucion;
  final String formaPago;
  final String nombreCliente;

  Map<String, dynamic> toJson() => {
        'clientUuid': clientUuid,
        'operacionId': operacionId,
        'montoCents': montoCents,
        'tasaEjecucion': tasaEjecucion,
        'formaPago': formaPago,
        'nombreCliente': nombreCliente,
      };
}

// ─────────────────────────── Respuesta ───────────────────────────

class PagoResultadoDto {
  const PagoResultadoDto({
    required this.yaExistia,
  });

  final bool yaExistia;

  factory PagoResultadoDto.fromJson(Map<String, dynamic> json) {
    return PagoResultadoDto(yaExistia: json['yaExistia'] as bool);
  }
}

// ─────────────────────────── Servicio ───────────────────────────

/// Servicio de API del pagador. Capa fina sobre Dio.
class PagadorApi {
  PagadorApi(this.dio);

  final Dio dio;

  Future<List<ItemColaPagadorDto>> cola() async {
    final r = await dio.get('/pagador/cola');
    return (r.data as List<dynamic>)
        .map((e) => ItemColaPagadorDto.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<PagoResultadoDto> pagar(EjecutarPagoRequest req) async {
    final r = await dio.post('/pagador/pagar', data: req.toJson());
    return PagoResultadoDto.fromJson(r.data as Map<String, dynamic>);
  }

  Future<List<PagoDelDiaDto>> pagosDelDia() async {
    final r = await dio.get('/pagador/pagos-del-dia');
    return (r.data as List<dynamic>)
        .map((e) => PagoDelDiaDto.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}

/// Provider del servicio de API del pagador.
final pagadorApiProvider = Provider<PagadorApi>((ref) {
  final dio = ref.read(dioProvider);
  return PagadorApi(dio);
});
