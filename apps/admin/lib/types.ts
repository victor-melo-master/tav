/**
 * Tipos de las respuestas de la API del admin.
 * Los montos llegan como string (BigInt serializado a string en main.ts).
 * Reflejan los retornos de apps/api/src/admin/admin.service.ts.
 */

export type Rol = 'cajero' | 'cobrador' | 'admin';
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
export type MetodoCobro = 'efectivo_usd' | 'bolivares' | 'pago_movil' | 'usdt';
export type TipoMovimiento = 'cargo' | 'abono' | 'reverso_cargo' | 'reverso_abono' | 'ajuste';

export interface UsuarioPublico {
  id: string;
  rol: Rol;
  nombre: string;
  telefono: string;
  documento?: string | null;
  activo: boolean;
  ultimaVezAt?: string | null;
  creadoAt: string;
  pinEstablecido: boolean;
  perfilCajero?: PerfilCajeroRaw | null;
  perfilCobrador?: { usuarioId: string; zona?: string | null } | null;
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
  telefono: string;
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
  montoUsdCents: string;
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
  tipo: string;
  montoOrigenCents: string;
  monedaOrigen: string;
  tasaAplicada: string;
  comisionCents: string;
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
}

export interface AmpliacionCredito {
  id: string;
  cajeroId: string;
  cajero?: { usuarioId: string; usuario: { nombre: string; telefono: string } } | null;
  montoCents: string;
  motivo: string;
  estado: EstadoAmpliacion;
  solicitadaAt: string;
  resueltaAt?: string | null;
  resueltaPorId?: string | null;
  notaAdmin?: string | null;
  operacion?: { id: string; folio: string } | null;
}

export interface FichaCajero {
  id: string;
  nombre: string;
  telefono: string;
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
}

// ─────────────────────────── CIERRES ───────────────────────────

export interface Cobro {
  id: string;
  folio: string;
  clientUuid: string;
  cajeroId: string;
  cajero?: { usuarioId: string; usuario: { nombre: string; telefono: string } } | null;
  cobradorId?: string | null;
  metodo: MetodoCobro;
  montoCents: string;
  moneda: string;
  tasaAplicada?: string | null;
  montoUsdCents: string;
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
  cobrador?: { usuarioId: string; usuario: { nombre: string; telefono: string } } | null;
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

// ─────────────────────────── TASAS ───────────────────────────

export interface Tasa {
  id: string;
  par: string;
  valor: string;
  vigenteDesde: string;
  creadaPorId: string;
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
  moneda: 'USD' | 'BS' | 'USDT';
  tasaAplicada?: string;
  comprobanteUrl?: string;
  nota?: string;
}

export interface CobroAdminRespuesta {
  cobro: Cobro;
  yaExistia: boolean;
}
