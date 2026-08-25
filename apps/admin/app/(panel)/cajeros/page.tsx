'use client';

import * as React from 'react';
import Link from 'next/link';
import { Search, Pencil, ChevronRight, Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { usd, parseUserAmountToCents } from '@/lib/format';
import type { CajeroLista, EstadoSemaforo } from '@/lib/types';
import { PageHeader, PageContent } from '@/components/page-header';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
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
import { SemaforoBadge, SemaforoDot, CargandoTabla, ErrorTabla, VacioTabla } from '@/components/estados';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const FILTROS: { valor: EstadoSemaforo | 'todos'; label: string }[] = [
  { valor: 'todos', label: 'Todos' },
  { valor: 'rojo', label: 'Vencida' },
  { valor: 'ambar', label: 'Por vencer' },
  { valor: 'verde', label: 'Al día' },
];

export default function CajerosPage() {
  const [semaforo, setSemaforo] = React.useState<EstadoSemaforo | 'todos'>('todos');
  const [q, setQ] = React.useState('');

  const { data, cargando, error, recargar } = useApi<CajeroLista[]>(
    () => api.cajeros({ semaforo: semaforo === 'todos' ? undefined : semaforo, q: q.trim() || undefined }),
    [semaforo, q.trim()],
  );

  const [editando, setEditando] = React.useState<CajeroLista | null>(null);

  return (
    <>
      <PageHeader
        titulo="Cajeros"
        descripcion="Deuda, límite de crédito, semáforo y días sin conectarse. Edita el límite desde la fila; abre la ficha para ver movimientos y operaciones."
      />

      <PageContent>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            {FILTROS.map((f) => (
              <button
                key={f.valor}
                onClick={() => setSemaforo(f.valor)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors',
                  semaforo === f.valor
                    ? 'bg-tav-navy text-white'
                    : 'border border-tav-line bg-tav-surface text-tav-ink-2 hover:bg-tav-bg',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative ml-auto w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tav-ink-4" />
            <Input
              placeholder="Nombre o teléfono…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-tav-line bg-tav-surface shadow-tav">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Cajero</TableHead>
                <TableHead>Zona</TableHead>
                <TableHead className="text-right">Deuda</TableHead>
                <TableHead className="text-right">Límite</TableHead>
                <TableHead>Cupo</TableHead>
                <TableHead>Semáforo</TableHead>
                <TableHead className="text-right">Sin conectarse</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {cargando && (
                <TableRow>
                  <TableCell colSpan={9} className="p-0">
                    <CargandoTabla />
                  </TableCell>
                </TableRow>
              )}
              {!cargando && error && (
                <TableRow>
                  <TableCell colSpan={9} className="p-0">
                    <ErrorTabla mensaje={error} onReintentar={recargar} />
                  </TableCell>
                </TableRow>
              )}
              {!cargando && !error && (data?.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="p-0">
                    <VacioTabla mensaje="No hay cajeros para este filtro" />
                  </TableCell>
                </TableRow>
              )}
              {!cargando &&
                !error &&
                data?.map((c) => (
                  <CajeroFila key={c.id} cajero={c} onEditar={() => setEditando(c)} />
                ))}
            </TableBody>
          </Table>
        </div>
      </PageContent>

      <EditarLimiteDialog
        cajero={editando}
        onClose={() => setEditando(null)}
        onGuardado={() => recargar()}
      />
    </>
  );
}

function CajeroFila({ cajero, onEditar }: { cajero: CajeroLista; onEditar: () => void }) {
  const pct = Math.round(cajero.pct * 100);
  return (
    <TableRow className="cursor-pointer">
      <TableCell>
        <SemaforoDot estado={cajero.semaforo} />
      </TableCell>
      <TableCell>
        <Link href={`/cajeros/${cajero.id}`} className="block">
          <div className="font-medium text-tav-ink">{cajero.nombre}</div>
          <div className="font-mono text-[11.5px] text-tav-ink-3">{cajero.telefono}</div>
        </Link>
      </TableCell>
      <TableCell className="text-tav-ink-2">{cajero.zona || '—'}</TableCell>
      <TableCell className="text-right tabular-nums font-medium">
        {usd(cajero.saldoCents)}
      </TableCell>
      <TableCell className="text-right tabular-nums text-tav-ink-2">
        {usd(cajero.limiteCents)}
      </TableCell>
      <TableCell className="w-32">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-tav-line-2">
            <div
              className={cn(
                'h-full rounded-full',
                pct >= 100 ? 'bg-tav-red' : pct >= 75 ? 'bg-tav-gold' : 'bg-tav-green',
              )}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          <span className="tabular-nums text-[12px] text-tav-ink-3">{pct}%</span>
        </div>
      </TableCell>
      <TableCell>
        <SemaforoBadge estado={cajero.semaforo} dias={cajero.dias} />
      </TableCell>
      <TableCell className="text-right tabular-nums text-tav-ink-2">
        {cajero.diasSinConectarse === null ? 'Nunca' : `${cajero.diasSinConectarse}d`}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEditar();
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-tav-ink-3 hover:bg-tav-bg hover:text-tav-ink"
            aria-label="Editar límite"
            title="Editar límite"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <Link
            href={`/cajeros/${cajero.id}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-tav-ink-3 hover:bg-tav-bg hover:text-tav-ink"
            aria-label="Abrir ficha"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </TableCell>
    </TableRow>
  );
}

function EditarLimiteDialog({
  cajero,
  onClose,
  onGuardado,
}: {
  cajero: CajeroLista | null;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [valor, setValor] = React.useState('');
  const [guardando, setGuardando] = React.useState(false);

  React.useEffect(() => {
    if (cajero) {
      const cents = BigInt(cajero.limiteCents);
      const enteros = cents / 100n;
      const dec = cents % 100n;
      setValor(`${enteros.toString()},${dec.toString().padStart(2, '0')}`);
    }
  }, [cajero]);

  const nuevoCents = React.useMemo(() => parseUserAmountToCents(valor), [valor]);
  const cambio = cajero && nuevoCents !== null && nuevoCents !== cajero.limiteCents;

  async function guardar() {
    if (!cajero || nuevoCents === null) return;
    setGuardando(true);
    try {
      await api.cambiarLimite(cajero.id, nuevoCents);
      toast.success('Límite actualizado', {
        description: `${cajero.nombre}: ${usd(nuevoCents)}`,
      });
      onGuardado();
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo actualizar el límite');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={cajero !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar límite de crédito</DialogTitle>
          <DialogDescription>
            {cajero?.nombre} · {cajero?.telefono}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-md bg-tav-bg px-3 py-2 text-[13px]">
            <span className="text-tav-ink-3">Límite actual</span>
            <span className="tabular-nums font-semibold text-tav-ink-2">
              {cajero ? usd(cajero.limiteCents) : ''}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nuevo-limite">Nuevo límite (USD)</Label>
            <Input
              id="nuevo-limite"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="font-mono tabular-nums"
              autoFocus
            />
          </div>
          {cambio && (
            <div className="flex items-center justify-between rounded-md bg-tav-blue-50 px-3 py-2 text-[13px] text-tav-blue-600">
              <span>Nuevo límite</span>
              <span className="tabular-nums font-semibold">{usd(nuevoCents)}</span>
            </div>
          )}
          <p className="text-[12px] text-tav-ink-3">
            El cambio queda registrado en la auditoría con el valor anterior y el nuevo.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={!cambio || guardando}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar cambio'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
