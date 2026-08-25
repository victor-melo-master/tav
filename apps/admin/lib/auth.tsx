'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  ApiError,
  SesionExpiradaError,
  guardarSesion,
  leerUsuarioGuardado,
  limpiarSesion,
} from './api';
import type { UsuarioPublico } from './types';

interface AuthContextValue {
  usuario: UsuarioPublico | null;
  cargando: boolean; // true mientras verifica la sesión inicial
  login: (telefono: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

/**
 * Proveedor de autenticación.
 *
 - Al montar, si hay un usuario guardado en localStorage se da por buena la
 - sesión (optimista) y se hace un GET /auth/me en segundo plano para
 - confirmar que el access token sigue vivo. Si el me falla y el refresh
 - tampoco rescata, se limpia y se redirige a /login.
 *
 - Cualquier SesionExpiradaError que burbujee desde el api client redirige
 - a /login. El api client ya limpió el storage.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = React.useState<UsuarioPublico | null>(null);
  const [cargando, setCargando] = React.useState(true);
  const router = useRouter();

  // Sesión inicial: arranca con el usuario guardado (si hay) para no flashear
  // el login, y confirma contra /auth/me.
  React.useEffect(() => {
    const guardado = leerUsuarioGuardado();
    if (guardado) setUsuario(guardado);
    setCargando(false);

    if (!guardado) return;
    api
      .me()
      .then((u) => setUsuario(u))
      .catch(() => {
        // Si el access expiró pero el refresh sigue válido, api.me ya refrescó
        // y resolvió. Si llegó aquí, la sesión cayó del todo.
        setUsuario(null);
        limpiarSesion();
        router.replace('/login');
      });
    // Solo al montar: verifica la sesión guardada contra /auth/me.
  }, []);

  const login = React.useCallback(async (telefono: string, password: string) => {
    const data = await api.login(telefono, password);
    setUsuario(data.usuario);
  }, []);

  const logout = React.useCallback(async () => {
    await api.logout();
    setUsuario(null);
    router.replace('/login');
  }, [router]);

  // Captura global de sesión expirada: el api client la lanza cuando ni el
  // refresh rescata. Redirige al login sin pedir nada más.
  React.useEffect(() => {
    function onSesionExpirada(e: ErrorEvent) {
      if (e.error instanceof SesionExpiradaError) {
        setUsuario(null);
        router.replace('/login');
      }
    }
    window.addEventListener('error', onSesionExpirada as EventListener);
    return () => window.removeEventListener('error', onSesionExpirada as EventListener);
  }, [router]);

  const value = React.useMemo<AuthContextValue>(
    () => ({ usuario, cargando, login, logout }),
    [usuario, cargando, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}

/** ¿Es un error de "sesión expirada" que ya fue manejado? Útil en hooks. */
export function esSesionExpirada(e: unknown): boolean {
  return e instanceof SesionExpiradaError;
}

export { ApiError, guardarSesion };
