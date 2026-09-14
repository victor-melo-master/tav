/// DTOs de la API del cobrador.
///
/// Los montos llegan de la API como string (BigInt serializado en JSON)
/// y se convierten a int de centavos aquí. Nunca double.
library;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/auth_state.dart';

// ───────────────────────────── Cajeros ─────────────────────────────

/// Atención activa sobre un cajero ("lo estoy atendiendo").
/// null cuando ningún cobrador lo está atendiendo.
class AtendidoPorDto {
  const AtendidoPorDto({
    required this.cobradorId,
    required this.nombre,
    required this.iniciadaAt,
  });

  final String cobradorId;
  final String nombre;
  final DateTime iniciadaAt;

  factory AtendidoPorDto.fromJson(Map<String, dynamic> json) {
    return AtendidoPorDto(
      cobradorId: json['cobradorId'] as String,
      nombre: json['nombre'] as String,
      iniciadaAt: DateTime.parse(json['iniciadaAt'] as String),
    );
  }
}

/// Cajero visto por el cobrador. La lista la devuelve el servidor ya
/// ordenada por urgencia: no se reordena en la app.
class CajeroCobradorDto {
  const CajeroCobradorDto({
    required this.id,
    required this.nombre,
    required this.telefono,
    required this.zona,
    required this.saldoCents,
    required this.limiteCents,
    required this.dias,
    required this.pct,
    required this.bloqueado,
    required this.semaforo,
    required this.motivo,
    required this.disponibleCents,
    required this.diasSinConectarse,
    required this.atendidoPor,
  });

  final String id;
  final String nombre;
  final String? telefono;
  final String? zona;
  final int saldoCents;
  final int limiteCents;
  final int dias;
  final double pct;
  final bool bloqueado;
  final String semaforo; // 'verde' | 'ambar' | 'rojo'
  final String motivo;
  final int disponibleCents;
  final int? diasSinConectarse;
  final AtendidoPorDto? atendidoPor;

  factory CajeroCobradorDto.fromJson(Map<String, dynamic> json) {
    return CajeroCobradorDto(
      id: json['id'] as String,
      nombre: json['nombre'] as String,
      telefono: json['telefono'] as String?,
      zona: json['zona'] as String?,
      saldoCents: int.parse(json['saldoCents'] as String),
      limiteCents: int.parse(json['limiteCents'] as String),
      dias: (json['dias'] as num).toInt(),
      pct: (json['pct'] as num).toDouble(),
      bloqueado: json['bloqueado'] as bool,
      semaforo: json['semaforo'] as String,
      motivo: json['motivo'] as String,
      disponibleCents: int.parse(json['disponibleCents'] as String),
      diasSinConectarse: json['diasSinConectarse'] == null
          ? null
          : (json['diasSinConectarse'] as num).toInt(),
      atendidoPor: json['atendidoPor'] == null
          ? null
          : AtendidoPorDto.fromJson(
              json['atendidoPor'] as Map<String, dynamic>,
            ),
    );
  }
}

// ───────────────────────────── Cobros ─────────────────────────────

/// Método de cobro. Coincide con el enum MetodoCobro de Prisma.
/// Solo `efectivoUsd` y `efectivoGyd` suman al efectivo que el cobrador
/// entrega físicamente.
enum MetodoCobro {
  efectivoGyd('efectivo_gyd'),
  efectivoUsd('efectivo_usd'),
  bolivares('bolivares'),
  pagoMovil('pago_movil'),
  usdt('usdt');

  const MetodoCobro(this.valor);
  final String valor;

  static MetodoCobro fromValor(String v) {
    return MetodoCobro.values.firstWhere((m) => m.valor == v);
  }

  /// Moneda en la que se recibe el monto.
  String get moneda => switch (this) {
        MetodoCobro.efectivoGyd => 'GYD',
        MetodoCobro.efectivoUsd => 'USD',
        MetodoCobro.bolivares => 'BS',
        MetodoCobro.pagoMovil => 'BS',
        MetodoCobro.usdt => 'USDT',
      };

  /// true para efectivo físico (GYD o USD): suma al cuadre del cobrador.
  bool get esEfectivo => this == MetodoCobro.efectivoGyd || this == MetodoCobro.efectivoUsd;

  /// Etiqueta legible en español de Venezuela.
  String get label => switch (this) {
        MetodoCobro.efectivoGyd => 'Efectivo GYD',
        MetodoCobro.efectivoUsd => 'Efectivo USD',
        MetodoCobro.bolivares => 'Bolívares',
        MetodoCobro.pagoMovil => 'Pago móvil',
        MetodoCobro.usdt => 'USDT',
      };
}

class CobroDto {
  const CobroDto({
    required this.id,
    required this.folio,
    required this.clientUuid,
    required this.cajeroId,
    required this.cobradorId,
    required this.metodo,
    required this.montoCents,
    required this.moneda,
    required this.tasaAplicada,
    required this.montoBaseCents,
    required this.esEfectivo,
    required this.cierreId,
    required this.comprobanteUrl,
    required this.nota,
    required this.creadoAt,
    required this.sincronizadoAt,
    required this.anuladoAt,
    required this.anuladoPorId,
    required this.motivoAnulacion,
  });

  final String id;
  final String folio;
  final String clientUuid;
  final String cajeroId;
  final String? cobradorId;
  final MetodoCobro metodo;
  final int montoCents; // en la moneda recibida
  final String moneda; // 'GYD' | 'USD' | 'BS' | 'USDT'
  final String? tasaAplicada; // string decimal, congelada en el registro
  final int montoBaseCents; // equivalente en la moneda base (GYD) — descuenta la deuda
  final bool esEfectivo;
  final String? cierreId;
  final String? comprobanteUrl;
  final String? nota;
  final DateTime creadoAt;
  final DateTime? sincronizadoAt;
  final DateTime? anuladoAt;
  final String? anuladoPorId;
  final String? motivoAnulacion;

  bool get anulado => anuladoAt != null;

  factory CobroDto.fromJson(Map<String, dynamic> json) {
    return CobroDto(
      id: json['id'] as String,
      folio: json['folio'] as String,
      clientUuid: json['clientUuid'] as String,
      cajeroId: json['cajeroId'] as String,
      cobradorId: json['cobradorId'] as String?,
      metodo: MetodoCobro.fromValor(json['metodo'] as String),
      montoCents: int.parse(json['montoCents'] as String),
      moneda: json['moneda'] as String,
      tasaAplicada: json['tasaAplicada'] as String?,
      montoBaseCents: int.parse(json['montoBaseCents'] as String),
      esEfectivo: json['esEfectivo'] as bool,
      cierreId: json['cierreId'] as String?,
      comprobanteUrl: json['comprobanteUrl'] as String?,
      nota: json['nota'] as String?,
      creadoAt: DateTime.parse(json['creadoAt'] as String),
      sincronizadoAt: json['sincronizadoAt'] == null
          ? null
          : DateTime.parse(json['sincronizadoAt'] as String),
      anuladoAt: json['anuladoAt'] == null
          ? null
          : DateTime.parse(json['anuladoAt'] as String),
      anuladoPorId: json['anuladoPorId'] as String?,
      motivoAnulacion: json['motivoAnulacion'] as String?,
    );
  }
}

// ───────────────────────────── Cierres ─────────────────────────────

/// Estado del cierre diario del cobrador.
enum EstadoCierre {
  abierto('abierto'),
  enviado('enviado'),
  verificado('verificado'),
  conDiferencia('con_diferencia');

  const EstadoCierre(this.valor);
  final String valor;

  static EstadoCierre fromValor(String v) {
    return EstadoCierre.values.firstWhere((e) => e.valor == v);
  }

  String get label => switch (this) {
        EstadoCierre.abierto => 'Sin rendir',
        EstadoCierre.enviado => 'En verificación',
        EstadoCierre.verificado => 'Conforme',
        EstadoCierre.conDiferencia => 'Con diferencia',
      };
}

class CierreDto {
  const CierreDto({
    required this.id,
    required this.cobradorId,
    required this.fecha,
    required this.totalRegistradoCents,
    required this.efectivoGydDeclaradoCents,
    required this.efectivoUsdDeclaradoCents,
    required this.digitalCents,
    required this.estado,
    required this.entregadoA,
    required this.notaCobrador,
    required this.enviadoAt,
    required this.verificadoAt,
    required this.verificadoPorId,
    required this.efectivoGydRecibidoCents,
    required this.efectivoUsdRecibidoCents,
    required this.diferenciaGydCents,
    required this.diferenciaUsdCents,
    required this.notaAdmin,
    required this.cobros,
  });

  final String? id;
  final String cobradorId;
  final DateTime fecha;
  final int totalRegistradoCents;
  final int efectivoGydDeclaradoCents;
  final int efectivoUsdDeclaradoCents;
  final int digitalCents;
  final EstadoCierre estado;
  final String? entregadoA;
  final String? notaCobrador;
  final DateTime? enviadoAt;
  final DateTime? verificadoAt;
  final String? verificadoPorId;
  final int? efectivoGydRecibidoCents;
  final int? efectivoUsdRecibidoCents;
  final int? diferenciaGydCents;
  final int? diferenciaUsdCents;
  final String? notaAdmin;
  final List<CobroDto> cobros;

  /// Efectivo en billetes guyaneses = suma de cobros no anulados con
  /// esEfectivo y moneda GYD, en centavos de GYD (sin conversión).
  int get efectivoGydCents {
    if (cobros.isEmpty) return 0;
    return cobros
        .where((c) => !c.anulado && c.esEfectivo && c.moneda == 'GYD')
        .fold(0, (sum, c) => sum + c.montoCents);
  }

  /// Efectivo en billetes americanos = suma de cobros no anulados con
  /// esEfectivo y moneda USD, en centavos de USD (sin conversión).
  int get efectivoUsdCents {
    if (cobros.isEmpty) return 0;
    return cobros
        .where((c) => !c.anulado && c.esEfectivo && c.moneda == 'USD')
        .fold(0, (sum, c) => sum + c.montoCents);
  }

  /// Efectivo total en GYD (para contabilidad) = suma de todos los
  /// cobros esEfectivo convertidos a la moneda base.
  int get efectivoTotalGydCents {
    if (cobros.isEmpty) return 0;
    return cobros
        .where((c) => !c.anulado && c.esEfectivo)
        .fold(0, (sum, c) => sum + c.montoBaseCents);
  }

  /// Digital = suma de cobros no anulados sin esEfectivo.
  int get digitalCalculadoCents {
    if (cobros.isEmpty) return 0;
    return cobros
        .where((c) => !c.anulado && !c.esEfectivo)
        .fold(0, (sum, c) => sum + c.montoBaseCents);
  }

  /// Cobros no anulados del cierre.
  List<CobroDto> get cobrosActivos =>
      cobros.where((c) => !c.anulado).toList();

  factory CierreDto.fromJson(Map<String, dynamic> json) {
    return CierreDto(
      id: json['id'] as String?,
      cobradorId: json['cobradorId'] as String,
      fecha: DateTime.parse(json['fecha'] as String),
      totalRegistradoCents: int.parse(json['totalRegistradoCents'] as String),
      efectivoGydDeclaradoCents:
          int.parse(json['efectivoGydDeclaradoCents'] as String),
      efectivoUsdDeclaradoCents:
          int.parse(json['efectivoUsdDeclaradoCents'] as String),
      digitalCents: int.parse(json['digitalCents'] as String),
      estado: EstadoCierre.fromValor(json['estado'] as String),
      entregadoA: json['entregadoA'] as String?,
      notaCobrador: json['notaCobrador'] as String?,
      enviadoAt: json['enviadoAt'] == null
          ? null
          : DateTime.parse(json['enviadoAt'] as String),
      verificadoAt: json['verificadoAt'] == null
          ? null
          : DateTime.parse(json['verificadoAt'] as String),
      verificadoPorId: json['verificadoPorId'] as String?,
      efectivoGydRecibidoCents: json['efectivoGydRecibidoCents'] == null
          ? null
          : int.parse(json['efectivoGydRecibidoCents'] as String),
      efectivoUsdRecibidoCents: json['efectivoUsdRecibidoCents'] == null
          ? null
          : int.parse(json['efectivoUsdRecibidoCents'] as String),
      diferenciaGydCents: json['diferenciaGydCents'] == null
          ? null
          : int.parse(json['diferenciaGydCents'] as String),
      diferenciaUsdCents: json['diferenciaUsdCents'] == null
          ? null
          : int.parse(json['diferenciaUsdCents'] as String),
      notaAdmin: json['notaAdmin'] as String?,
      cobros: (json['cobros'] as List<dynamic>? ?? [])
          .map((e) => CobroDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class PaginaCierresDto {
  const PaginaCierresDto({
    required this.items,
    required this.total,
    required this.page,
    required this.limit,
  });

  final List<CierreDto> items;
  final int total;
  final int page;
  final int limit;

  factory PaginaCierresDto.fromJson(Map<String, dynamic> json) {
    return PaginaCierresDto(
      items: (json['items'] as List<dynamic>)
          .map((e) => CierreDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      total: (json['total'] as num).toInt(),
      page: (json['page'] as num).toInt(),
      limit: (json['limit'] as num).toInt(),
    );
  }
}

// ───────────────────────────── Atenciones ─────────────────────────────

class AtencionDto {
  const AtencionDto({
    required this.id,
    required this.cajeroId,
    required this.cobradorId,
    required this.iniciadaAt,
    required this.liberadaAt,
  });

  final String id;
  final String cajeroId;
  final String cobradorId;
  final DateTime iniciadaAt;
  final DateTime? liberadaAt;

  factory AtencionDto.fromJson(Map<String, dynamic> json) {
    return AtencionDto(
      id: json['id'] as String,
      cajeroId: json['cajeroId'] as String,
      cobradorId: json['cobradorId'] as String,
      iniciadaAt: DateTime.parse(json['iniciadaAt'] as String),
      liberadaAt: json['liberadaAt'] == null
          ? null
          : DateTime.parse(json['liberadaAt'] as String),
    );
  }
}

// ───────────────────────────── Avisos ─────────────────────────────

class AvisoDto {
  const AvisoDto({
    required this.id,
    required this.cajeroId,
    required this.tipo,
    required this.titulo,
    required this.cuerpo,
    required this.enviadoAt,
    required this.leidoAt,
    required this.enviadoPorId,
  });

  final String id;
  final String cajeroId;
  final String tipo;
  final String titulo;
  final String cuerpo;
  final DateTime enviadoAt;
  final DateTime? leidoAt;
  final String? enviadoPorId;

  factory AvisoDto.fromJson(Map<String, dynamic> json) {
    return AvisoDto(
      id: json['id'] as String,
      cajeroId: json['cajeroId'] as String,
      tipo: json['tipo'] as String,
      titulo: json['titulo'] as String,
      cuerpo: json['cuerpo'] as String,
      enviadoAt: DateTime.parse(json['enviadoAt'] as String),
      leidoAt:
          json['leidoAt'] == null ? null : DateTime.parse(json['leidoAt'] as String),
      enviadoPorId: json['enviadoPorId'] as String?,
    );
  }
}

// ─────────────────────── DTOs de petición ───────────────────────

class RegistrarCobroRequest {
  const RegistrarCobroRequest({
    required this.clientUuid,
    required this.cajeroId,
    required this.metodo,
    required this.montoCents,
    required this.moneda,
    this.tasaAplicada,
    this.comprobanteUrl,
    this.nota,
  });

  final String clientUuid;
  final String cajeroId;
  final String metodo; // valor del enum MetodoCobro
  final String montoCents; // string de centavos
  final String moneda; // 'USD' | 'BS' | 'USDT'
  final String? tasaAplicada; // obligatoria si moneda === 'BS'
  final String? comprobanteUrl;
  final String? nota;

  Map<String, dynamic> toJson() => {
        'clientUuid': clientUuid,
        'cajeroId': cajeroId,
        'metodo': metodo,
        'montoCents': montoCents,
        'moneda': moneda,
        if (tasaAplicada != null) 'tasaAplicada': tasaAplicada,
        if (comprobanteUrl != null) 'comprobanteUrl': comprobanteUrl,
        if (nota != null) 'nota': nota,
      };
}

class EnviarCierreRequest {
  const EnviarCierreRequest({
    required this.efectivoGydDeclaradoCents,
    required this.efectivoUsdDeclaradoCents,
    this.entregadoA,
    this.notaCobrador,
  });

  final String efectivoGydDeclaradoCents;
  final String efectivoUsdDeclaradoCents;
  final String? notaCobrador;

  // PENDIENTE DE DEFINIR: el DTO del servidor (EnviarCierreDto) aún no acepta
  // entregadoA. El prototipo muestra "¿A quién le entregas?" pero la API lo
  // rechazaría por forbidNonWhitelisted. Se conserva en el UI como informativo
  // y se omite del payload hasta que el backend lo soporte.
  final String? entregadoA;

  Map<String, dynamic> toJson() => {
        'efectivoGydDeclaradoCents': efectivoGydDeclaradoCents,
        'efectivoUsdDeclaradoCents': efectivoUsdDeclaradoCents,
        if (notaCobrador != null) 'notaCobrador': notaCobrador,
      };
}

class CrearAtencionRequest {
  const CrearAtencionRequest({required this.cajeroId});

  final String cajeroId;

  Map<String, dynamic> toJson() => {'cajeroId': cajeroId};
}

class CrearAvisoRequest {
  const CrearAvisoRequest({
    required this.cajeroId,
    required this.titulo,
    required this.cuerpo,
  });

  final String cajeroId;
  final String titulo;
  final String cuerpo;

  Map<String, dynamic> toJson() => {
        'cajeroId': cajeroId,
        'titulo': titulo,
        'cuerpo': cuerpo,
      };
}

// ─────────────────────────── Servicio ───────────────────────────

/// Servicio de API del cobrador. Capa fina sobre Dio.
///
/// cobradorId nunca va en el cuerpo: sale del JWT en el servidor.
/// Todos los cobradores ven las deudas de todos los cajeros (no hay cartera).
class CobradorApi {
  CobradorApi(this.dio);

  final Dio dio;

  /// Lista de cajeros ordenada por urgencia. El servidor la devuelve ordenada:
  /// no se reordena aquí.
  Future<List<CajeroCobradorDto>> cajeros() async {
    final r = await dio.get('/cobrador/cajeros');
    return (r.data as List<dynamic>)
        .map((e) => CajeroCobradorDto.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Registra un cobro. Idempotente por clientUuid: si ya existía,
  /// devuelve el cobro existente con yaExistia=true.
  Future<({CobroDto cobro, bool yaExistia})> registrarCobro(
    RegistrarCobroRequest req,
  ) async {
    final r = await dio.post('/cobrador/cobros', data: req.toJson());
    final data = r.data as Map<String, dynamic>;
    return (
      cobro: CobroDto.fromJson(data['cobro'] as Map<String, dynamic>),
      yaExistia: (data['yaExistia'] as bool?) ?? false,
    );
  }

  /// Anula un cobro con motivo (mínimo 10 caracteres). Nunca borra.
  Future<CobroDto> anularCobro(String cobroId, String motivo) async {
    final r = await dio.post(
      '/cobrador/cobros/$cobroId/anular',
      data: {'motivo': motivo},
    );
    return CobroDto.fromJson(r.data as Map<String, dynamic>);
  }

  /// Cierre de hoy con totales y lista de cobros. Si no hay cobros hoy,
  /// devuelve una estructura vacía con id=null.
  Future<CierreDto> cierreActual() async {
    final r = await dio.get('/cobrador/cierre-actual');
    return CierreDto.fromJson(r.data as Map<String, dynamic>);
  }

  /// Cierra el día y manda a verificación del admin.
  /// Rechaza (409) si hay cobros sin sincronizar o el cierre ya no está abierto.
  Future<CierreDto> enviarCierre(
    String cierreId,
    EnviarCierreRequest req,
  ) async {
    final r = await dio.post(
      '/cobrador/cierres/$cierreId/enviar',
      data: req.toJson(),
    );
    return CierreDto.fromJson(r.data as Map<String, dynamic>);
  }

  /// Historial paginado de cierres del cobrador.
  Future<PaginaCierresDto> cierres({int page = 1, int limit = 20}) async {
    final r = await dio.get(
      '/cobrador/cierres',
      queryParameters: {'page': page, 'limit': limit},
    );
    return PaginaCierresDto.fromJson(r.data as Map<String, dynamic>);
  }

  /// Marca "lo estoy atendiendo" sobre un cajero.
  /// 409 si otro cobrador ya lo está atendiendo.
  Future<AtencionDto> marcarAtencion(CrearAtencionRequest req) async {
    final r = await dio.post('/cobrador/atenciones', data: req.toJson());
    return AtencionDto.fromJson(r.data as Map<String, dynamic>);
  }

  /// Libera la atención sobre un cajero.
  Future<void> liberarAtencion(String cajeroId) async {
    await dio.delete('/cobrador/atenciones/$cajeroId');
  }

  /// Envía un aviso manual de cobro a un cajero.
  Future<AvisoDto> enviarAviso(CrearAvisoRequest req) async {
    final r = await dio.post('/cobrador/avisos', data: req.toJson());
    return AvisoDto.fromJson(r.data as Map<String, dynamic>);
  }
}

/// Provider del servicio de API del cobrador.
final cobradorApiProvider = Provider<CobradorApi>((ref) {
  final dio = ref.read(dioProvider);
  return CobradorApi(dio);
});
