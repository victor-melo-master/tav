'use client';

import * as React from 'react';
import { ApiError, SesionExpiradaError } from '@/lib/api';
import { esSesionExpirada } from '@/lib/auth';

interface EstadoApi<T> {
  data: T | null;
  cargando: boolean;
  error: string | null;
  recargar: () => void;
  /** Asigna directamente los datos (tras una mutación optimista, p.ej.). */
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

/**
 * Hook de fetching para el panel. Resuelve los tres estados que piden las
 * reglas: cargando, error y vacío. Si la sesión expira, el AuthProvider
 * redirige; aquí solo se propaga el error para no duplicar lógica.
 *
 - El fetcher se re-ejecuta cuando cambian las dependencias (deps). Si el
 - fetcher cambia de identidad en cada render, hay que estabilizarlo con
 - useCallback en el llamador o pasar deps explícitas.
 */
export function useApi<T>(fetcher: () => Promise<T>, deps: React.DependencyList = []): EstadoApi<T> {
  const [data, setData] = React.useState<T | null>(null);
  const [cargando, setCargando] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);

  const recargar = React.useCallback(() => setTick((t) => t + 1), []);

  React.useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);
    fetcher()
      .then((d) => {
        if (vivo) {
          setData(d);
          setCargando(false);
        }
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        if (esSesionExpirada(e)) return; // lo maneja el AuthProvider
        setCargando(false);
        setError(mensajeError(e));
      });
    return () => {
      vivo = false;
    };
    // deps se esparcen intencionalmente: el llamador controla cuándo refetch.
  }, [tick, ...deps]);

  return { data, cargando, error, recargar, setData };
}

/** Extrae un mensaje legible de cualquier error de fetch. */
export function mensajeError(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof SesionExpiradaError) return 'Sesión expirada';
  if (e instanceof Error) return e.message;
  return 'Ocurrió un error inesperado';
}
