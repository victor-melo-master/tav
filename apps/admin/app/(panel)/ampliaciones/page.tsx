'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, X, Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { gyd, formatFecha } from '@/lib/format';
import type { AmpliacionCredito, EstadoAmpliacion } from '@/lib/types';
import { PageHeader, PageContent } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { CargandoTabla, ErrorTabla, VacioTabla } from '@/components/estados';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const FILTROS: { valor: EstadoAmpliacion | 'todos'; label: string }[] = [
  { valor: 'todos', label: 'Todas' },
  { valor: 'pendiente', label: 'Pendientes' },
  { valor: 'aprobada', label: 'Aprobadas' },
  { valor: 'rechazada', label: 'Rechazadas' },
  { valor: 'consumida', label: 'Consumidas' },
  { valor: 'expirada', label: 'Expiradas' },
];

const ESTILO: Record<EstadoAmpliacion, 'navy' | 'verde' | 'rojo' | 'outline'> = {
  pendiente: 'navy',
  aprobada: 'verde',
  rechazada: 'rojo',
  consumida: 'outline',
  expirada: 'outline',
};

export default function AmpliacionesPage() {
  const [estado, setEstado] = React.useState<EstadoAmpliacion | 'todos'>('todos');
  const { data, cargando, error, recargar, setData } = useApi<AmpliacionCredito[]>(
    () => api.ampliaciones(estado === 'todos' ? undefined : estado),
    [estado],
  );

  const [resolviendo, setResolviendo] = React.useState<{
    ampliacion: AmpliacionCredito;
    accion: 'aprobar' | 'rechazar';
  } | null>(null);

  const pendientes = data?.filter((a) => a.estado === 'pendiente').length ?? 0;

  return (
    <>
      <PageHeader
        titulo="Ampliaciones de cupo"
        descripcion={
          pendientes > 0
            ? `Hay ${pendientes} solicitud${pendientes === 1 ? '' : 'es'} pendiente${pendientes === 1 ? '' : 's'} esperando decisión.`
            : 'Bandeja de solicitudes de cupo extra de los cajeros.'
        }
      />

      <PageContent>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              onClick={() => setEstado(f.valor)}
              className={cn(
                'rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors',
                estado === f.valor
                  ? 'bg-tav-navy text-white'
                  : 'border border-tav-line bg-tav-surface text-tav-ink-2 hover:bg-tav-bg',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-lg border border-tav-line bg-tav-surface shadow-tav">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cajero</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Nota admin</TableHead>
                <TableHead>Solicitada</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cargando && (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <CargandoTabla />
                  </TableCell>
                </TableRow>
              )}
              {!cargando && error && (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <ErrorTabla mensaje={error} onReintentar={recargar} />
                  </TableCell>
                </TableRow>
              )}
              {!cargando && !error && (data?.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <VacioTabla mensaje="No hay ampliaciones para este filtro" />
                  </TableCell>
                </TableRow>
              )}
              {!cargando &&
                !error &&
                data?.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link
                        href={`/cajeros/${a.cajeroId}`}
                        className="font-medium text-tav-ink hover:text-tav-blue"
                      >
                        {a.cajero?.usuario.nombre ?? '—'}
                      </Link>
                      <div className="font-mono text-[11.5px] text-tav-ink-3">
                        {a.cajero?.usuario.telefono ?? ''}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {gyd(a.montoCents)}
                    </TableCell>
                    <TableCell className="max-w-[300px] text-tav-ink-2">
                      <span className="line-clamp-2">{a.motivo}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ESTILO[a.estado]}>{a.estado}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-tav-ink-3" title={a.notaAdmin ?? ''}>
                      {a.notaAdmin || '—'}
                    </TableCell>
                    <TableCell className="font-mono text-[12px] text-tav-ink-2">
                      {formatFecha(a.solicitadaAt, true)}
                    </TableCell>
                    <TableCell className="text-right">
                      {a.estado === 'pendiente' ? (
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => setResolviendo({ ampliacion: a, accion: 'aprobar' })}
                          >
                            <Check className="h-3.5 w-3.5" /> Aprobar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setResolviendo({ ampliacion: a, accion: 'rechazar' })}
                          >
                            <X className="h-3.5 w-3.5" /> Rechazar
                          </Button>
                        </div>
                      ) : (
                        <span className="text-[12px] text-tav-ink-4">Resuelta</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </PageContent>

      <ResolverDialog
        estado={resolviendo}
        onClose={() => setResolviendo(null)}
        onResuelto={(id, nuevo) => {
          setData((prev) =>
            prev ? prev.map((a) => (a.id === id ? { ...a, ...nuevo } : a)) : prev,
          );
        }}
      />
    </>
  );
}

function ResolverDialog({
  estado,
  onClose,
  onResuelto,
}: {
  estado: { ampliacion: AmpliacionCredito; accion: 'aprobar' | 'rechazar' } | null;
  onClose: () => void;
  onResuelto: (id: string, nuevo: Partial<AmpliacionCredito>) => void;
}) {
  const [nota, setNota] = React.useState('');
  const [guardando, setGuardando] = React.useState(false);

  React.useEffect(() => {
    setNota('');
  }, [estado]);

  const accion = estado?.accion;
  const ampliacion = estado?.ampliacion;

  async function resolver() {
    if (!ampliacion || !accion) return;
    setGuardando(true);
    try {
      const fn = accion === 'aprobar' ? api.aprobarAmpliacion : api.rechazarAmpliacion;
      const res = await fn(ampliacion.id, nota.trim() || undefined);
      onResuelto(ampliacion.id, {
        estado: res.estado,
        resueltaAt: res.resueltaAt,
        notaAdmin: res.notaAdmin,
      });
      toast.success(
        accion === 'aprobar' ? 'Ampliación aprobada' : 'Ampliación rechazada',
        { description: ampliacion.cajero?.usuario.nombre },
      );
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo resolver la ampliación');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={estado !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {accion === 'aprobar' ? 'Aprobar ampliación' : 'Rechazar ampliación'}
          </DialogTitle>
          <DialogDescription>
            {ampliacion?.cajero?.usuario.nombre} · {ampliacion ? gyd(ampliacion.montoCents) : ''}
          </DialogDescription>
        </DialogHeader>

        {ampliacion && (
          <div className="rounded-md bg-tav-bg p-3 text-[13px] text-tav-ink-2">
            <div className="mb-1 text-[12px] font-medium text-tav-ink-3">Motivo del cajero</div>
            {ampliacion.motivo}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nota-amp">Nota del admin (opcional)</Label>
          <Textarea
            id="nota-amp"
            placeholder="Explica la decisión…"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button
            variant={accion === 'aprobar' ? 'default' : 'destructive'}
            onClick={resolver}
            disabled={guardando}
          >
            {guardando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : accion === 'aprobar' ? (
              'Aprobar'
            ) : (
              'Rechazar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
