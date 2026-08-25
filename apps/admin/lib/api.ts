import type {
  LoginResponse,
  RefreshResponse,
  CajeroLista,
  FichaCajero,
  AmpliacionCredito,
  Cierre,
  PaginaCierres,
  Tasa,
  Resumen,
  RegistrarCobroAdminPayload,
  CobroAdminRespuesta,
  UsuarioPublico,
  EstadoSemaforo,
  EstadoCierre,
  EstadoAmpliacion,
} from './types';

/**
 * Cliente HTTP para la API del admin.
 *
 * Gestiona el JWT: adjunta el access token a cada petición y, si la API
 * responde 401, intenta UN refresh con el refresh token y reintenta la
 * petición original. Si el refresh también falla, descarta la sesión y
 * lanza para que el AuthProvider mande al usuario al login.
 *
 * Los tokens se guardan en localStorage. El access token expira pronto;
 * el refresh dura 30d. Nunca se loguean ni se exponen fuera de aquí.
 */

const ACCESS_KEY = 'tav_access';
const REFRESH_KEY = 'tav_refresh';
const USER_KEY = 'tav_user';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class SesionExpiradaError extends Error {
  constructor() {
    super('Sesión expirada');
    this.name = 'SesionExpiradaError';
  }
}

function readAccess(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ACCESS_KEY);
}
function readRefresh(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function guardarSesion(s: LoginResponse): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACCESS_KEY, s.accessToken);
  window.localStorage.setItem(REFRESH_KEY, s.refreshToken);
  window.localStorage.setItem(USER_KEY, JSON.stringify(s.usuario));
}

export function limpiarSesion(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export function leerUsuarioGuardado(): UsuarioPublico | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UsuarioPublico;
  } catch {
    return null;
  }
}

async function refreshTokens(): Promise<boolean> {
  const refreshToken = readRefresh();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as RefreshResponse;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ACCESS_KEY, data.accessToken);
      window.localStorage.setItem(REFRESH_KEY, data.refreshToken);
    }
    return true;
  } catch {
    return false;
  }
}

let refreshing: Promise<boolean> | null = null;

/**
 * Petición autenticada con reintento único tras refresh.
 * Devuelve el JSON parseado. Lanza ApiError si la API responde con error,
 * o SesionExpiradaError si ni el refresh rescata la sesión.
 */
async function request<T>(
  path: string,
  opts: RequestInit = {},
  isRetry = false,
): Promise<T> {
  const access = readAccess();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string>),
  };
  if (access) headers.Authorization = `Bearer ${access}`;

  const res = await fetch(`${API_URL}${path}`, { ...opts, headers });

  if (res.status === 401 && !isRetry) {
    // Serializa los refresh: si varias peticiones fallan a la vez, todas
    // esperan el mismo refresh en vez de disparar uno cada una.
    if (!refreshing) refreshing = refreshTokens().finally(() => {
      refreshing = null;
    });
    const ok = await refreshing;
    if (ok) return request<T>(path, opts, true);
    limpiarSesion();
    throw new SesionExpiradaError();
  }

  if (res.status === 401 && isRetry) {
    limpiarSesion();
    throw new SesionExpiradaError();
  }

  if (!res.ok) {
    let body: unknown;
    let mensaje = `Error ${res.status}`;
    try {
      body = await res.json();
      const m = (body as { message?: string | string[] })?.message;
      if (Array.isArray(m)) mensaje = m.join(', ');
      else if (typeof m === 'string') mensaje = m;
    } catch {
      /* sin cuerpo */
    }
    throw new ApiError(res.status, mensaje, body);
  }

  // 204 o vacío
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}

// ─────────────────────────── AUTH ───────────────────────────

export const api = {
  async login(telefono: string, password: string): Promise<LoginResponse> {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefono, password }),
    });
    if (!res.ok) {
      let mensaje = 'Teléfono o contraseña incorrectos';
      try {
        const b = await res.json();
        if (typeof b.message === 'string') mensaje = b.message;
      } catch {
        /* ignore */
      }
      throw new ApiError(res.status, mensaje);
    }
    const data = (await res.json()) as LoginResponse;
    guardarSesion(data);
    return data;
  },

  async logout(): Promise<void> {
    try {
      await request('/auth/logout', { method: 'POST' });
    } catch {
      /* incluso si falla, limpiamos local */
    }
    limpiarSesion();
  },

  async me(): Promise<UsuarioPublico> {
    return request<UsuarioPublico>('/auth/me');
  },

  // ─────────────────────────── CAJEROS ───────────────────────────

  cajeros(filtros: { semaforo?: EstadoSemaforo; q?: string } = {}): Promise<CajeroLista[]> {
    return request<CajeroLista[]>(`/admin/cajeros${qs(filtros)}`);
  },

  fichaCajero(id: string): Promise<FichaCajero> {
    return request<FichaCajero>(`/admin/cajeros/${id}`);
  },

  cambiarLimite(id: string, limiteCents: string): Promise<unknown> {
    return request(`/admin/cajeros/${id}/limite`, {
      method: 'PATCH',
      body: JSON.stringify({ limiteCents }),
    });
  },

  // ─────────────────────────── AMPLIACIONES ───────────────────────────

  ampliaciones(estado?: EstadoAmpliacion): Promise<AmpliacionCredito[]> {
    return request<AmpliacionCredito[]>(`/admin/ampliaciones${qs({ estado })}`);
  },

  aprobarAmpliacion(id: string, nota?: string): Promise<AmpliacionCredito> {
    return request<AmpliacionCredito>(`/admin/ampliaciones/${id}/aprobar`, {
      method: 'POST',
      body: JSON.stringify({ nota }),
    });
  },

  rechazarAmpliacion(id: string, nota?: string): Promise<AmpliacionCredito> {
    return request<AmpliacionCredito>(`/admin/ampliaciones/${id}/rechazar`, {
      method: 'POST',
      body: JSON.stringify({ nota }),
    });
  },

  // ─────────────────────────── CIERRES ───────────────────────────

  cierres(filtros: { estado?: EstadoCierre; page?: number; limit?: number } = {}): Promise<PaginaCierres> {
    return request<PaginaCierres>(`/admin/cierres${qs(filtros)}`);
  },

  cierreDetalle(id: string): Promise<Cierre> {
    return request<Cierre>(`/admin/cierres/${id}`);
  },

  verificarCierre(id: string, body: { efectivoRecibidoCents: string; nota?: string }): Promise<Cierre> {
    return request<Cierre>(`/admin/cierres/${id}/verificar`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  // ─────────────────────────── TASAS ───────────────────────────

  fijarTasa(par: string, valor: string): Promise<Tasa> {
    return request<Tasa>('/admin/tasas', {
      method: 'POST',
      body: JSON.stringify({ par, valor }),
    });
  },

  tasas(par?: string): Promise<Tasa[]> {
    return request<Tasa[]>(`/admin/tasas${qs({ par })}`);
  },

  // ─────────────────────────── COBROS ADMIN ───────────────────────────

  registrarCobro(body: RegistrarCobroAdminPayload): Promise<CobroAdminRespuesta> {
    return request<CobroAdminRespuesta>('/admin/cobros', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  // ─────────────────────────── USUARIOS ───────────────────────────

  crearUsuario(body: {
    nombre: string;
    telefono: string;
    rol: 'cajero' | 'cobrador';
    password: string;
    documento?: string;
    limiteCents?: string;
    zona?: string;
    direccion?: string;
    notas?: string;
  }): Promise<unknown> {
    return request('/admin/usuarios', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  // ─────────────────────────── TABLERO ───────────────────────────

  resumen(): Promise<Resumen> {
    return request<Resumen>('/admin/resumen');
  },
};
