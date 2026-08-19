/// DTOs de la API del cajero.
///
/// Los montos llegan de la API como string (BigInt serializado en JSON)
/// y se convierten a int de centavos aquí. Nunca double.
library;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/auth_state.dart';

// ───────────────────────────── Resumen ─────────────────────────────

class SemaforoDto {
  const SemaforoDto({
    required this.estado,
    required this.dias,
    required this.pct,
    required this.bloqueado,
    required this.motivo,
    required this.disponibleCents,
  });

  final String estado; // 'verde' | 'ambar' | 'rojo'
  final int dias;
  final double pct;
  final bool bloqueado;
  final String motivo;
  final int disponibleCents;

  factory SemaforoDto.fromJson(Map<String, dynamic> json) {
    return SemaforoDto(
      estado: json['estado'] as String,
      dias: (json['dias'] as num).toInt(),
      pct: (json['pct'] as num).toDouble(),
      bloqueado: json['bloqueado'] as bool,
      motivo: json['motivo'] as String,
      disponibleCents: int.parse(json['disponibleCents'] as String),
    );
  }
}

class ResumenDto {
  const ResumenDto({
    required this.saldoCents,
    required this.limiteCents,
    required this.disponibleCents,
    required this.deudaDesde,
    required this.semaforo,
  });

  final int saldoCents;
  final int limiteCents;
  final int disponibleCents;
  final DateTime? deudaDesde;
  final SemaforoDto semaforo;

  factory ResumenDto.fromJson(Map<String, dynamic> json) {
    return ResumenDto(
      saldoCents: int.parse(json['saldoCents'] as String),
      limiteCents: int.parse(json['limiteCents'] as String),
      disponibleCents: int.parse(json['disponibleCents'] as String),
      deudaDesde: json['deudaDesde'] != null
          ? DateTime.parse(json['deudaDesde'] as String)
          : null,
      semaforo: SemaforoDto.fromJson(
        json['semaforo'] as Map<String, dynamic>,
      ),
    );
  }
}

// ─────────────────────────── Operaciones ───────────────────────────

class BeneficiarioOperacionDto {
  const BeneficiarioOperacionDto({
    required this.nombre,
    required this.documento,
    required this.banco,
    required this.cuenta,
    required this.metodo,
  });

  final String nombre;
  final String documento;
  final String banco;
  final String cuenta;
  final String metodo;

  factory BeneficiarioOperacionDto.fromJson(Map<String, dynamic> json) {
    return BeneficiarioOperacionDto(
      nombre: json['nombre'] as String,
      documento: json['documento'] as String,
      banco: json['banco'] as String,
      cuenta: json['cuenta'] as String,
      metodo: json['metodo'] as String,
    );
  }

  Map<String, dynamic> toJson() => {
        'nombre': nombre,
        'documento': documento,
        'banco': banco,
        'cuenta': cuenta,
        'metodo': metodo,
      };
}

class OperacionDto {
  const OperacionDto({
    required this.id,
    required this.folio,
    required this.tipo,
    required this.montoOrigenCents,
    required this.monedaOrigen,
    required this.tasaAplicada,
    required this.comisionCents,
    required this.totalCents,
    required this.montoDestinoCents,
    required this.monedaDestino,
    required this.beneficiario,
    required this.estado,
    required this.comprobanteUrl,
    required this.creadaAt,
    required this.anuladaAt,
    required this.motivoAnulacion,
  });

  final String id;
  final String folio;
  final String tipo;
  final int montoOrigenCents;
  final String monedaOrigen;
  final String tasaAplicada;
  final int comisionCents;
  final int totalCents;
  final int montoDestinoCents;
  final String monedaDestino;
  final BeneficiarioOperacionDto beneficiario;
  final String estado;
  final String? comprobanteUrl;
  final DateTime creadaAt;
  final DateTime? anuladaAt;
  final String? motivoAnulacion;

  factory OperacionDto.fromJson(Map<String, dynamic> json) {
    return OperacionDto(
      id: json['id'] as String,
      folio: json['folio'] as String,
      tipo: json['tipo'] as String,
      montoOrigenCents: int.parse(json['montoOrigenCents'] as String),
      monedaOrigen: json['monedaOrigen'] as String,
      tasaAplicada: json['tasaAplicada'] as String,
      comisionCents: int.parse(json['comisionCents'] as String),
      totalCents: int.parse(json['totalCents'] as String),
      montoDestinoCents: int.parse(json['montoDestinoCents'] as String),
      monedaDestino: json['monedaDestino'] as String,
      beneficiario: BeneficiarioOperacionDto.fromJson(
        json['beneficiario'] as Map<String, dynamic>,
      ),
      estado: json['estado'] as String,
      comprobanteUrl: json['comprobanteUrl'] as String?,
      creadaAt: DateTime.parse(json['creadaAt'] as String),
      anuladaAt: json['anuladaAt'] != null
          ? DateTime.parse(json['anuladaAt'] as String)
          : null,
      motivoAnulacion: json['motivoAnulacion'] as String?,
    );
  }
}

class PaginaOperacionesDto {
  const PaginaOperacionesDto({
    required this.items,
    required this.total,
    required this.page,
    required this.limit,
  });

  final List<OperacionDto> items;
  final int total;
  final int page;
  final int limit;

  factory PaginaOperacionesDto.fromJson(Map<String, dynamic> json) {
    return PaginaOperacionesDto(
      items: (json['items'] as List<dynamic>)
          .map((e) => OperacionDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      total: (json['total'] as num).toInt(),
      page: (json['page'] as num).toInt(),
      limit: (json['limit'] as num).toInt(),
    );
  }
}

// ─────────────────────────── Movimientos ───────────────────────────

class MovimientoDto {
  const MovimientoDto({
    required this.id,
    required this.seq,
    required this.tipo,
    required this.montoUsdCents,
    required this.saldoDespues,
    required this.origenTipo,
    required this.origenId,
    required this.motivo,
    required this.creadoAt,
  });

  final String id;
  final int seq;
  final String tipo;
  final int montoUsdCents;
  final int saldoDespues;
  final String origenTipo;
  final String origenId;
  final String? motivo;
  final DateTime creadoAt;

  factory MovimientoDto.fromJson(Map<String, dynamic> json) {
    return MovimientoDto(
      id: json['id'] as String,
      seq: int.parse(json['seq'] as String),
      tipo: json['tipo'] as String,
      montoUsdCents: int.parse(json['montoUsdCents'] as String),
      saldoDespues: int.parse(json['saldoDespues'] as String),
      origenTipo: json['origenTipo'] as String,
      origenId: json['origenId'] as String,
      motivo: json['motivo'] as String?,
      creadoAt: DateTime.parse(json['creadoAt'] as String),
    );
  }
}

class PaginaMovimientosDto {
  const PaginaMovimientosDto({
    required this.items,
    required this.total,
    required this.page,
    required this.limit,
  });

  final List<MovimientoDto> items;
  final int total;
  final int page;
  final int limit;

  factory PaginaMovimientosDto.fromJson(Map<String, dynamic> json) {
    return PaginaMovimientosDto(
      items: (json['items'] as List<dynamic>)
          .map((e) => MovimientoDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      total: (json['total'] as num).toInt(),
      page: (json['page'] as num).toInt(),
      limit: (json['limit'] as num).toInt(),
    );
  }
}

// ─────────────────────────── Ampliaciones ───────────────────────────

class AmpliacionDto {
  const AmpliacionDto({
    required this.id,
    required this.montoCents,
    required this.motivo,
    required this.estado,
    required this.solicitadaAt,
    required this.resueltaAt,
    required this.notaAdmin,
  });

  final String id;
  final int montoCents;
  final String motivo;
  final String estado;
  final DateTime solicitadaAt;
  final DateTime? resueltaAt;
  final String? notaAdmin;

  factory AmpliacionDto.fromJson(Map<String, dynamic> json) {
    return AmpliacionDto(
      id: json['id'] as String,
      montoCents: int.parse(json['montoCents'] as String),
      motivo: json['motivo'] as String,
      estado: json['estado'] as String,
      solicitadaAt: DateTime.parse(json['solicitadaAt'] as String),
      resueltaAt: json['resueltaAt'] != null
          ? DateTime.parse(json['resueltaAt'] as String)
          : null,
      notaAdmin: json['notaAdmin'] as String?,
    );
  }
}

// ───────────────────────────── Tasas ─────────────────────────────

class TasaDto {
  const TasaDto({
    required this.id,
    required this.par,
    required this.valor,
    required this.vigenteDesde,
  });

  final String id;
  final String par; // 'USDT_BS' | 'USD_BS' | 'ZELLE_BS'
  final String valor; // string decimal: "285.400000"
  final DateTime vigenteDesde;

  factory TasaDto.fromJson(Map<String, dynamic> json) {
    return TasaDto(
      id: json['id'] as String,
      par: json['par'] as String,
      valor: json['valor'] as String,
      vigenteDesde: DateTime.parse(json['vigenteDesde'] as String),
    );
  }
}

// ─────────────────────── DTOs de petición ───────────────────────

class CrearOperacionRequest {
  const CrearOperacionRequest({
    required this.clientUuid,
    required this.tipo,
    required this.montoOrigenCents,
    required this.monedaOrigen,
    required this.tasaAplicada,
    required this.comisionCents,
    required this.totalCents,
    required this.montoDestinoCents,
    required this.monedaDestino,
    required this.beneficiario,
    this.comprobanteUrl,
  });

  final String clientUuid;
  final String tipo;
  final String montoOrigenCents;
  final String monedaOrigen;
  final String tasaAplicada;
  final String comisionCents;
  final String totalCents;
  final String montoDestinoCents;
  final String monedaDestino;
  final BeneficiarioOperacionDto beneficiario;
  final String? comprobanteUrl;

  Map<String, dynamic> toJson() => {
        'clientUuid': clientUuid,
        'tipo': tipo,
        'montoOrigenCents': montoOrigenCents,
        'monedaOrigen': monedaOrigen,
        'tasaAplicada': tasaAplicada,
        'comisionCents': comisionCents,
        'totalCents': totalCents,
        'montoDestinoCents': montoDestinoCents,
        'monedaDestino': monedaDestino,
        'beneficiario': beneficiario.toJson(),
        if (comprobanteUrl != null) 'comprobanteUrl': comprobanteUrl,
      };
}

class SolicitarAmpliacionRequest {
  const SolicitarAmpliacionRequest({
    required this.montoCents,
    required this.motivo,
  });

  final String montoCents;
  final String motivo;

  Map<String, dynamic> toJson() => {
        'montoCents': montoCents,
        'motivo': motivo,
      };
}

// ─────────────────────── Excepción de cupo ───────────────────────

/// Respuesta del 409 cuando no hay cupo suficiente.
/// La API devuelve { disponible, requerido, faltante } en centavos.
class CupoInsuficienteException implements Exception {
  const CupoInsuficienteException({
    required this.disponibleCents,
    required this.requeridoCents,
    required this.faltanteCents,
    required this.mensaje,
  });

  final int disponibleCents;
  final int requeridoCents;
  final int faltanteCents;
  final String mensaje;

  @override
  String toString() => mensaje;
}

// ─────────────────────────── Servicio ───────────────────────────

/// Servicio de API del cajero. Capa fina sobre Dio.
///
/// Todas las peticiones usan el Dio del provider, que ya tiene el
/// interceptor de auth (Bearer token) y el de errores legibles.
class CajeroApi {
  CajeroApi(this.dio);

  final Dio dio;

  Future<ResumenDto> resumen() async {
    final r = await dio.get('/cajero/resumen');
    return ResumenDto.fromJson(r.data as Map<String, dynamic>);
  }

  Future<PaginaOperacionesDto> operaciones({
    int page = 1,
    int limit = 20,
    String? estado,
  }) async {
    final query = <String, dynamic>{
      'page': page,
      'limit': limit,
      if (estado != null) 'estado': estado,
    };
    final r = await dio.get('/cajero/operaciones', queryParameters: query);
    return PaginaOperacionesDto.fromJson(r.data as Map<String, dynamic>);
  }

  /// Crea una operación. Lanza [CupoInsuficienteException] si la API
  /// responde 409 con { disponible, requerido, faltante }.
  Future<OperacionDto> crearOperacion(CrearOperacionRequest req) async {
    try {
      final r = await dio.post(
        '/cajero/operaciones',
        data: req.toJson(),
      );
      final data = r.data as Map<String, dynamic>;
      // La API devuelve { operacion, yaExistia }.
      return OperacionDto.fromJson(data['operacion'] as Map<String, dynamic>);
    } on DioException catch (e) {
      if (e.response?.statusCode == 409) {
        final data = e.response?.data as Map<String, dynamic>?;
        if (data != null) {
          throw CupoInsuficienteException(
            disponibleCents: int.parse(data['disponible'] as String? ?? '0'),
            requeridoCents: int.parse(data['requerido'] as String? ?? '0'),
            faltanteCents: int.parse(data['faltante'] as String? ?? '0'),
            mensaje: data['message'] as String? ??
                'No tienes cupo suficiente para esta operación.',
          );
        }
      }
      rethrow;
    }
  }

  Future<PaginaMovimientosDto> movimientos({
    int page = 1,
    int limit = 20,
  }) async {
    final r = await dio.get('/cajero/movimientos', queryParameters: {
      'page': page,
      'limit': limit,
    });
    return PaginaMovimientosDto.fromJson(r.data as Map<String, dynamic>);
  }

  Future<AmpliacionDto> solicitarAmpliacion(
    SolicitarAmpliacionRequest req,
  ) async {
    final r = await dio.post('/cajero/ampliaciones', data: req.toJson());
    return AmpliacionDto.fromJson(r.data as Map<String, dynamic>);
  }

  Future<List<AmpliacionDto>> ampliaciones() async {
    final r = await dio.get('/cajero/ampliaciones');
    return (r.data as List<dynamic>)
        .map((e) => AmpliacionDto.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<TasaDto>> tasasVigentes() async {
    final r = await dio.get('/tasas/vigentes');
    return (r.data as List<dynamic>)
        .map((e) => TasaDto.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}

/// Provider del servicio de API del cajero.
final cajeroApiProvider = Provider<CajeroApi>((ref) {
  final dio = ref.read(dioProvider);
  return CajeroApi(dio);
});
