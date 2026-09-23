'use client';

import * as React from 'react';
import Link from 'next/link';
import { Search, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { gyd, formatFecha } from '@/lib/format';
import type { EstadoCierre } from '@/lib/types';
import { PageHeader, PageContent } from '@/components/page-header';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { CargandoTabla, ErrorTabla, VacioTabla } from '@/components/estados';
import { cn } from '@/lib/utils';

const ESTADOS: { valor: EstadoCierre | 'todos'; label: string }[] = [
  { valor: 'todos', label: 'Todos' },
  { valor: 'enviado', label: 'Enviados' },
  { valor: 'verificado', label: 'Verificados' },
  { valor: 'con_diferencia', label: 'Con diferencia' },
  { valor: 'abierto', label: 'Abiertos' },
];

const ESTILO_ESTADO: Record<EstadoCierre, { label: string; variant: 'navy' | 'verde' | 'ambar' | 'outline' }> = {
  abierto: { label: 'Abierto', variant: 'outline' },
  enviado: { label: 'Enviado', variant: 'navy' },
  verificado: { label: 'Verificado', variant: 'verde' },
  con_diferencia: { label: 'Con diferencia', variant: 'ambar' },
};

export default function CierresPage() {
  const [estado, setEstado] = React.useState<EstadoCierre | 'todos'>('todos');
  const [q, setQ] = React.useState('');
  const [page, setPage] = React.useState(1);
  const limit = 20;

  const { data, cargando, error, recargar } = useApi(
    () => api.cierres({ estado: estado === 'todos' ? undefined : estado, page, limit }),
    [estado, page],
  );

  // Filtro cliente por nombre de cobrador (la API no expone búsqueda de texto).
  const items = React.useMemo(() => {
    if (!data?.items) return [];
    if (!q.trim()) return data.items;
    const t = q.toLowerCase();
    return data.items.filter((c) =>
      (c.cobrador?.usuario.nombre ?? '').toLowerCase().includes(t),
    );
  }, [data, q]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <>
      <PageHeader
        titulo="Verificación de cierres"
        descripcion="Bandeja de los cierres enviados por los cobradores. Abre uno para capturar el efectivo que recibiste y cuadrar la diferencia."
      />

      <PageContent>
        {/* Filtros visibles */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            {ESTADOS.map((e) => (
              <button
                key={e.valor}
                onClick={() => {
                  setEstado(e.valor);
                  setPage(1);
                }}
                className={cn(
                  'rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors',
                  estado === e.valor
                    ? 'bg-tav-navy text-white'
                    : 'bg-tav-surface text-tav-ink-2 border border-tav-line hover:bg-tav-bg',
                )}
              >
                {e.label}
              </button>
            ))}
          </div>
          <div className="relative ml-auto w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tav-ink-4" />
            <Input
              placeholder="Buscar cobrador…"
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
                <TableHead>Fecha</TableHead>
                <TableHead>Cobrador</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Cobros</TableHead>
                <TableHead className="text-right">Total registrado</TableHead>
                <TableHead className="text-right">Efectivo declarado</TableHead>
                <TableHead className="text-right">Diferencia</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {cargando && (
                <TableRow>
                  <TableCell colSpan={8} className="p-0">
                    <CargandoTabla />
                  </TableCell>
                </TableRow>
              )}
              {!cargando && error && (
                <TableRow>
                  <TableCell colSpan={8} className="p-0">
                    <ErrorTabla mensaje={error} onReintentar={recargar} />
                  </TableCell>
                </TableRow>
              )}
              {!cargando && !error && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="p-0">
                    <VacioTabla mensaje="No hay cierres para este filtro" />
                  </TableCell>
                </TableRow>
              )}
              {!cargando && !error && items.map((c) => {
                const est = ESTILO_ESTADO[c.estado];
                const diff =
                  c.diferenciaCents !== undefined && c.diferenciaCents !== null
                    ? BigInt(c.diferenciaCents)
                    : null;
                const hayDiff = diff !== null && diff !== 0n;
                return (
                  <TableRow key={c.id} className="cursor-pointer">
                    <TableCell className="font-mono text-[12px] text-tav-ink-2">
                      {formatFecha(c.fecha)}
                    </TableCell>
                    <TableCell className="font-medium text-tav-ink">
                      {c.cobrador?.usuario.nombre ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={est.variant}>{est.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.cobrosCount ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {gyd(c.totalRegistradoCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-tav-ink-2">
                      {gyd(c.efectivoDeclaradoCents)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        diff === null
                          ? 'text-tav-ink-4'
                          : hayDiff
                            ? 'text-tav-red-700'
                            : 'text-tav-green-600',
                      )}
                    >
                      {diff === null
                        ? '—'
                        : hayDiff
                          ? 'Con diff'
                          : 'Cuadró'}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/cierres/${c.id}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-tav-ink-3 hover:bg-tav-bg hover:text-tav-ink"
                        aria-label="Abrir cierre"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Paginación */}
        {total > limit && (
          <div className="mt-4 flex items-center justify-between text-[13px] text-tav-ink-3">
            <span>
              Página {page} de {totalPages} · {total} cierres
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-md border border-tav-line bg-tav-surface px-3 py-1.5 font-medium text-tav-ink-2 disabled:opacity-40 hover:bg-tav-bg"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-md border border-tav-line bg-tav-surface px-3 py-1.5 font-medium text-tav-ink-2 disabled:opacity-40 hover:bg-tav-bg"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </PageContent>
    </>
  );
}
