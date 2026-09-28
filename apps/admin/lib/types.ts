/**
 * Tipos de las respuestas de la API del admin.
 * Los montos llegan como string (BigInt serializado a string en main.ts).
 * Reflejan los retornos de apps/api/src/admin/admin.service.ts.
 */

export type Rol = 'admin' | 'cajero' | 'cobrador' | 'pagador';
export type EstadoSemaforo = 'verde' | 'ambar' | 'rojo';
export type EstadoCierre = 'abierto' | 'enviado' | 'verificado' | 'con_diferencia';
export type EstadoAmpliacion = 'pendiente' | 'aprobada' | 'rechazada' | 'consumida' | 'expirada';
export type EstadoOperacion =
  | 'en_verificacion'
  | 'en_proceso'
  | 'completada'
  | 'observada'
  | 'rechazada'
  | 'anulada';
export type MetodoCobro = 'efectivo_gyd' | 'transferencia_gyd';
export type TipoMovimiento = 'cargo' | 'abono' | 'reverso_cargo' | 'reverso_abono' | 'ajuste';

export interface UsuarioPublico {
  id: string;
  rol: Rol;
  nombre: string;
  email: string;
  telefono?: string | null;
  documento?: string | null;
  activo: boolean;
  ultimaVezAt?: string | null;
  creadoAt: string;
  perfilCajero?: PerfilCajeroRaw | null;
  perfilCobrador?: { usuarioId: string; zona?: string | null } | null;
  perfilPagador?: PerfilPagadorRaw | null;
}

export interface PaginaUsuarios {
  items: UsuarioPublico[];
  total: number;
  page: number;
  limit: number;
}

export interface PerfilCajeroRaw {
  usuarioId: string;
  limiteCents: string;
  saldoCents: string;
  deudaDesde?: string | null;
  zona?: string | null;
  direccion?: string | null;
  notas?: string | null;
}

export interface PerfilPagadorRaw {
  usuarioId: string;
  pais: string;
  notas?: string | null;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  usuario: UsuarioPublico;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

// ─────────────────────────── CAJEROS ───────────────────────────

export interface CajeroLista {
  id: string;
  nombre: string;
  email: string;
  telefono?: string | null;
  zona?: string | null;
  saldoCents: string;
  limiteCents: string;
  pct: number;
  dias: number;
  bloqueado: boolean;
  semaforo: EstadoSemaforo;
  motivo: string;
  disponibleCents: string;
  diasSinConectarse: number | null;
  ultimaVezAt?: string | null;
  activo: boolean;
}

export interface Semaforo {
  estado: EstadoSemaforo;
  pct: number;
  dias: number;
  bloqueado: boolean;
  motivo: string;
  disponibleCents: string;
}

export interface Movimiento {
  id: string;
  seq: string;
  cajeroId: string;
  tipo: TipoMovimiento;
  montoCents: string;
  saldoDespues: string;
  origenTipo: string;
  origenId: string;
  motivo?: string | null;
  registradoPorId: string;
  creadoAt: string;
}

export interface Operacion {
  id: string;
  folio: string;
  clientUuid: string;
  cajeroId: string;
  montoOrigenCents: string;
  tasaAplicada: string;
  totalCents: string;
  montoDestinoCents: string;
  monedaDestino: string;
  beneficiario: Record<string, unknown>;
  estado: EstadoOperacion;
  comprobanteUrl?: string | null;
  ampliacionId?: string | null;
  creadaPorId: string;
  creadaAt: string;
  anuladaAt?: string | null;
  anuladaPorId?: string | null;
  motivoAnulacion?: string | null;
  corredorId?: string | null;
  pagadaAt?: string | null;
  tasaEjecucion?: string | null;
  formaPago?: string | null;
  nombreCliente?: string | null;
  pagadaPorId?: string | null;
  comprobantePagoUrl?: string | null;
  precioCompraGyd?: string | null;
}

export interface AmpliacionCredito {
  id: string;
  cajeroId: string;
  cajero?: { usuarioId: string; usuario: { nombre: string; email: string; telefono?: string | null } } | null;
  montoCents: string;
  motivo: string;
  estado: EstadoAmpliacion;
  solicitadaAt: string;
  resueltaAt?: string | null;
  resueltaPorId?: string | null;
  notaAdmin?: string | null;
  operacion?: { id: string; folio: string } | null;
}

export interface AvisoAbono {
  id: string;
  cajeroId: string;
  montoCents: string;
  nota?: string | null;
  estado: 'enviado' | 'atendido' | 'cancelado' | 'caducado';
  creadoAt: string;
}

export type TipoAviso =
  | 'cobro_automatico'
  | 'cobro_manual'
  | 'cerca_del_limite'
  | 'sin_cupo'
  | 'vencido'
  | 'ampliacion_resuelta'
  | 'sin_conexion';

export interface Aviso {
  id: string;
  cajeroId: string;
  tipo: TipoAviso;
  titulo: string;
  cuerpo: string;
  enviadoAt: string;
  leidoAt?: string | null;
  resueltoAt?: string | null;
  enviadoPorId?: string | null;
}

export interface FichaCajero {
  id: string;
  nombre: string;
  email: string;
  telefono?: string | null;
  documento?: string | null;
  zona?: string | null;
  direccion?: string | null;
  notas?: string | null;
  activo: boolean;
  ultimaVezAt?: string | null;
  saldoCents: string;
  limiteCents: string;
  deudaDesde?: string | null;
  semaforo: Semaforo;
  movimientos: Movimiento[];
  operaciones: Operacion[];
  ampliaciones: AmpliacionCredito[];
  avisoAbono: AvisoAbono | null;
  avisos: Aviso[];
}

// ─────────────────────────── CIERRES ───────────────────────────

export interface Cobro {
  id: string;
  folio: string;
  clientUuid: string;
  cajeroId: string;
  cajero?: { usuarioId: string; usuario: { nombre: string; email: string; telefono?: string | null } } | null;
  cobradorId?: string | null;
  metodo: MetodoCobro;
  montoCents: string;
  esEfectivo: boolean;
  cierreId?: string | null;
  comprobanteUrl?: string | null;
  nota?: string | null;
  creadoAt: string;
  sincronizadoAt?: string | null;
  anuladoAt?: string | null;
  anuladoPorId?: string | null;
  motivoAnulacion?: string | null;
}

export interface Cierre {
  id: string;
  cobradorId: string;
  cobrador?: { usuarioId: string; usuario: { nombre: string; email: string; telefono?: string | null } } | null;
  fecha: string;
  totalRegistradoCents: string;
  efectivoDeclaradoCents: string;
  digitalCents: string;
  estado: EstadoCierre;
  entregadoA?: string | null;
  notaCobrador?: string | null;
  enviadoAt?: string | null;
  verificadoAt?: string | null;
  verificadoPorId?: string | null;
  efectivoRecibidoCents?: string | null;
  diferenciaCents?: string | null;
  notaAdmin?: string | null;
  cobros?: Cobro[];
  cobrosCount?: number;
}

export interface PaginaCierres {
  items: Cierre[];
  total: number;
  page: number;
  limit: number;
}

// ──────────────────── PRECIOS POR CAJERO (nuevo modelo) ────────────────────

// Precio vigente de un servicio para un cajero, o null si falta por fijar.
// `precioGyd` es GYD por dólar (string decimal). La deuda se calcula en el
// servidor: deudaGydCents = round_half_up(montoUsdCents × precioGyd ÷ 100).

export interface PrecioCajeroServicio {
  servicioId: string;
  paisNombre: string;
  moneda: string;
  monedaNombre: string;
  formaEntregaNombre: string;
  servicio: string | null;
  servicioNombre: string | null;
  precioGyd: string | null;
  vigenteDesde: string | null;
  fijadoPorId: string | null;
}

export interface PrecioCajeroHistorial {
  id: string;
  cajeroId: string;
  servicioId: string;
  precioGyd: string;
  vigenteDesde: string;
  fijadoPorId: string;
  servicio: { paisNombre: string; moneda: string; formaEntregaNombre: string };
}

// ─────────────────────────── TABLERO ───────────────────────────

export interface Resumen {
  hoy: { cobradoCents: string; operaciones: number };
  mes: { cobradoCents: string; operaciones: number };
  carteraPendienteCents: string;
  repartoSemaforo: { verde: number; ambar: number; rojo: number };
  cierresEsperandoVerificacion: number;
  ampliacionesPendientes: number;
  cajerosSinConectarse: number;
}

// ─────────────────────────── COBRO ADMIN ───────────────────────────

export interface RegistrarCobroAdminPayload {
  clientUuid: string;
  cajeroId: string;
  metodo: MetodoCobro;
  montoCents: string;
  comprobanteUrl?: string;
  nota?: string;
}

export interface CobroAdminRespuesta {
  cobro: Cobro;
  yaExistia: boolean;
}

// ─────────────────────────── CAJAS (Tesorería) ───────────────────────────

export type TipoMovimientoCaja =
  | 'apertura'
  | 'recarga'
  | 'ingreso'
  | 'transferencia'
  | 'pago'
  | 'reverso_apertura'
  | 'reverso_pago'
  | 'ajuste';

export type TipoAlertaCaja = 'saldo_bajo' | 'saldo_negativo';

export interface Caja {
  id: string;
  esMadre: boolean;
  moneda: string;
  nombre: string;
  pais: string | null;
  saldoCents: string;
  umbralAlertaCents: string | null;
  creadaAt: string;
}

export interface MovimientoCaja {
  id: string;
  seq: string;
  cajaId: string;
  tipo: TipoMovimientoCaja;
  montoCents: string;
  saldoDespues: string;
  cajaMadreId?: string | null;
  montoMadreCents?: string | null;
  tasaConversion?: string | null;
  precioCompraGyd?: string | null;
  origenTipo: string;
  origenId: string;
  clientUuid: string;
  motivo?: string | null;
  registradoPorId: string;
  registradoPor?: { id: string; nombre: string; email: string } | null;
  creadoAt: string;
}

export interface PaginaMovimientosCaja {
  items: MovimientoCaja[];
  total: number;
  page: number;
  limit: number;
}

export interface AlertaCaja {
  cajaId: string;
  tipo: TipoAlertaCaja;
  saldoCents: string;
  umbralAlertaCents: string | null;
  moneda: string;
  cajaNombre: string;
}

export interface IngresarCajaMadrePayload {
  clientUuid: string;
  cajaMadreId: string;
  montoCents: string;
  precioCompraGyd: string;
  motivo: string;
}

export interface AbrirCajaPayload {
  clientUuid: string;
  cajaId: string;
  cajaMadreId: string;
  montoMadreCents: string;
  montoDestinoCents: string;
  tasaConversion: string;
}

export interface RetiroDepositoPayload {
  clientUuid: string;
  cajaId: string;
  montoCents: string;
  motivo: string;
}

export interface RetiroDepositoRespuesta {
  caja: Caja;
  movimiento: MovimientoCaja;
  yaExistia: boolean;
}

export interface AnularAperturaPayload {
  movimientoCajaId: string;
  motivo: string;
}

export interface IngresoCajaMadreRespuesta {
  caja: Caja;
  movimiento: MovimientoCaja;
  yaExistia: boolean;
}

export interface AperturaCajaRespuesta {
  cajaDestino: Caja;
  cajaMadre: Caja;
  movimientoDestino: MovimientoCaja;
  movimientoMadre: MovimientoCaja;
  yaExistia: boolean;
}

export interface AnulacionAperturaRespuesta {
  movimientoDestino: MovimientoCaja;
  movimientoMadre: MovimientoCaja;
}

export interface CrearCajaPayload {
  nombre: string;
  moneda: string;
  pais?: string;
  esMadre?: boolean;
}

// ─────────────────────────── SERVICIOS (CORREDORES) ───────────────────────────

export interface Corredor {
  id: string;
  activo: boolean;
  pais: string;
  paisNombre: string;
  moneda: string;
  monedaNombre: string;
  formaEntrega: string;
  formaEntregaNombre: string;
  servicio: string;
  servicioNombre: string;
  cajaId: string;
  caja?: Caja | null;
  creadoPorId: string;
  creadoAt: string;
  desactivadoAt?: string | null;
  desactivadoPorId?: string | null;
}

export interface CrearCorredorPayload {
  pais: string;
  paisNombre: string;
  moneda: string;
  monedaNombre: string;
  formaEntrega: string;
  formaEntregaNombre: string;
  servicio: string;
  servicioNombre: string;
  cajaId: string;
}

export interface EditarCorredorPayload {
  cajaId?: string;
  formaEntrega?: string;
  formaEntregaNombre?: string;
  servicioNombre?: string;
  moneda?: string;
  monedaNombre?: string;
}

// ─────────────────────── MOVIMIENTOS DIARIOS ───────────────────────

export interface MovimientoDiarioItem {
  id: string;
  folio: string;
  cajero: string;
  servicio: string;
  montoUsdCents: string;
  precioVenta: string;
  precioCompra: string | null;
  margenGydCents: string | null;
  pctMargen: string | null;
}

export interface MovimientosDiariosTotales {
  operaciones: number;
  usdCents: string;
  gananciaGydCents: string;
  pctPromedioPonderado: string | null;
}

export interface MovimientosDiarios {
  fecha: string;
  operaciones: MovimientoDiarioItem[];
  totales: MovimientosDiariosTotales;
}
