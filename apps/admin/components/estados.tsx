'use client';

import * as React from 'react';
import { Loader2, AlertTriangle, Inbox } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { EstadoSemaforo } from '@/lib/types';

/** Punto de semáforo + etiqueta escrita (el color nunca viaja solo). */
const SEM: Record<EstadoSemaforo, { label: string; variant: 'verde' | 'ambar' | 'rojo'; dot: string }> = {
  verde: { label: 'Al día', variant: 'verde', dot: 'bg-tav-green' },
  ambar: { label: 'Por vencer', variant: 'ambar', dot: 'bg-tav-gold' },
  rojo: { label: 'Vencida', variant: 'rojo', dot: 'bg-tav-red' },
};

export function SemaforoBadge({
  estado,
  dias,
  className,
}: {
  estado: EstadoSemaforo;
  dias?: number;
  className?: string;
}) {
  const s = SEM[estado];
  return (
    <Badge variant={s.variant} className={className}>
      <span className={cn('inline-block h-2 w-2 rounded-full', s.dot)} />
      {s.label}
      {typeof dias === 'number' ? ` · ${dias}d` : ''}
    </Badge>
  );
}

/** Punto suelto del semáforo, sin texto (para columnas compactas). */
export function SemaforoDot({ estado }: { estado: EstadoSemaforo }) {
  const s = SEM[estado];
  return <span className={cn('inline-block h-2.5 w-2.5 rounded-full', s.dot)} title={s.label} />;
}

// ─────────────────────────── ESTADOS DE TABLA ───────────────────────────

export function CargandoTabla({ columnas = 5 }: { columnas?: number }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-tav-ink-3">
      <Loader2 className="h-4 w-4 animate-spin" />
      Cargando…
      <span className="sr-only">{columnas} columnas</span>
    </div>
  );
}

export function ErrorTabla({ mensaje, onReintentar }: { mensaje: string; onReintentar?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-sm">
      <div className="flex items-center gap-2 text-tav-red-700">
        <AlertTriangle className="h-4 w-4" />
        <span>{mensaje}</span>
      </div>
      {onReintentar && (
        <button
          onClick={onReintentar}
          className="text-primary text-sm font-semibold hover:underline"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}

export function VacioTabla({ mensaje = 'No hay registros para mostrar' }: { mensaje?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-tav-ink-3">
      <Inbox className="h-6 w-6 text-tav-ink-4" />
      {mensaje}
    </div>
  );
}

/** Spinner de página completa (login, fichas). */
export function CargandoPagina({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm text-tav-ink-3">
      <Loader2 className="h-5 w-5 animate-spin" />
      {label}
    </div>
  );
}
