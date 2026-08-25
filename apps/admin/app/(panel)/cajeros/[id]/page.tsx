'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { usd, bs, formatFecha, formatTasa, haceTexto } from '@/lib/format';
import type { TipoMovimiento, EstadoOperacion } from '@/lib/types';
import { PageHeader, PageContent } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { SemaforoBadge, CargandoPagina, ErrorTabla, VacioTabla } from '@/components/estados';
import { cn } from '@/lib/utils';

const TIPO_MOV: Record<TipoMovimiento, { label: string; color: string }> = {
  cargo: { label: 'Cargo', color: 'text-tav-red-700' },
  abono: { label: 'Abono', color: 'text-tav-green-600' },
  reverso_cargo: { label: 'Reverso cargo', color: 'text-tav-ink-3' },
  reverso_abono: { label: 'Reverso abono', color: 'text-tav-ink-3' },
  ajuste: { label: 'Ajuste', color: 'text-tav-blue-600' },
};

const ESTADO_OP: Record<EstadoOperacion, 'outline' | 'navy' | 'verde' | 'ambar' | 'rojo'> = {
  en_verificacion: 'navy',
  en_proceso: 'ambar',
  completada: 'verde',
  observada: 'ambar',
  rechazada: 'rojo',
  anulada: 'outline',
};

const ESTADO_AMP: Record<string, 'navy' | 'verde' | 'rojo' | 'outline' | 'ambar'> = {
  pendiente: 'navy',
  aprobada: 'verde',
  rechazada: 'rojo',
  consumida: 'outline',
  expirada: 'outline',
};

type Pestana = 'movimientos' | 'operaciones' | 'ampliaciones';

export default function FichaCajeroPage() {
  const { id } = useParams<{ id: string }>();
  const { data, cargando, error, recargar } = useApi(() => api.fichaCajero(id), [id]);
  const [pestana, setPestana] = React.useState<Pestana>('movimientos');

  if (cargando) return <CargandoPagina label="Cargando ficha…" />;
  if (error)
    return (
      <>
        <PageHeader titulo="Cajero" />
        <PageContent>
          <ErrorTabla mensaje={error} onReintentar={recargar} />
        </PageContent>
      </>
    );
  if (!data) return null;

  const pct = Math.round(data.semaforo.pct * 100);

  return (
    <>
      <PageHeader
        titulo={data.nombre}
        descripcion={`${data.telefono}${data.documento ? ` · ${data.documento}` : ''}`}
        acciones={
          <Link href="/cajeros">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Button>
          </Link>
        }
      />

      <PageContent className="flex flex-col gap-6">
        {/* Resumen */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Card>
            <CardContent className="p-4">
              <div className="text-[12px] font-medium text-tav-ink-3">Deuda</div>
              <div className="mt-1 text-[18px] font-semibold tabular-nums">{usd(data.saldoCents)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-[12px] font-medium text-tav-ink-3">Límite</div>
              <div className="mt-1 text-[18px] font-semibold tabular-nums">{usd(data.limiteCents)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-[12px] font-medium text-tav-ink-3">Disponible</div>
              <div className="mt-1 text-[18px] font-semibold tabular-nums text-tav-green-600">
                {usd(data.semaforo.disponibleCents)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-[12px] font-medium text-tav-ink-3">Semáforo</div>
              <div className="mt-1.5">
                <SemaforoBadge estado={data.semaforo.estado} dias={data.semaforo.dias} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-[12px] font-medium text-tav-ink-3">Última conexión</div>
              <div className="mt-1 text-[14px] font-medium text-tav-ink-2">
                {haceTexto(data.ultimaVezAt)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Barra de cupo */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-medium text-tav-ink-2">Uso del cupo</span>
              <span className="tabular-nums text-tav-ink-3">
                {usd(data.saldoCents)} / {usd(data.limiteCents)} · {pct}%
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-tav-line-2">
              <div
                className={cn(
                  'h-full rounded-full',
                  pct >= 100 ? 'bg-tav-red' : pct >= 75 ? 'bg-tav-gold' : 'bg-tav-green',
                )}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
            {data.semaforo.bloqueado && (
              <p className="mt-2 text-[12.5px] font-medium text-tav-red-700">
                Cajero bloqueado por cupo: {data.semaforo.motivo}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Datos del perfil */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Dato label="Zona" valor={data.zona || '—'} />
          <Dato label="Dirección" valor={data.direccion || '—'} />
          <Dato label="Notas" valor={data.notas || '—'} />
        </div>

        {/* Pestañas */}
        <div className="flex gap-1 border-b border-tav-line">
          {(
            [
              ['movimientos', `Movimientos (${data.movimientos.length})`],
              ['operaciones', `Operaciones (${data.operaciones.length})`],
              ['ampliaciones', `Ampliaciones (${data.ampliaciones.length})`],
            ] as [Pestana, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPestana(key)}
              className={cn(
                '-mb-px border-b-2 px-4 py-2.5 text-[13.5px] font-semibold transition-colors',
                pestana === key
                  ? 'border-tav-blue text-tav-blue'
                  : 'border-transparent text-tav-ink-3 hover:text-tav-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Contenido de pestañas */}
        <div className="overflow-hidden rounded-lg border border-tav-line bg-tav-surface shadow-tav">
          {pestana === 'movimientos' && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Seq</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Monto USD</TableHead>
                  <TableHead className="text-right">Saldo después</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.movimientos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="p-0">
                      <VacioTabla mensaje="Sin movimientos" />
                    </TableCell>
                  </TableRow>
                )}
                {data.movimientos.map((m) => {
                  const t = TIPO_MOV[m.tipo];
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-mono text-[12px] text-tav-ink-3">{m.seq}</TableCell>
                      <TableCell className={cn('font-medium', t.color)}>{t.label}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {usd(m.montoUsdCents)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-tav-ink-2">
                        {usd(m.saldoDespues)}
                      </TableCell>
                      <TableCell className="text-tav-ink-2">
                        {m.origenTipo}
                        {m.motivo ? <span className="block text-[11.5px] text-tav-ink-3">{m.motivo}</span> : null}
                      </TableCell>
                      <TableCell className="font-mono text-[12px] text-tav-ink-2">
                        {formatFecha(m.creadoAt, true)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {pestana === 'operaciones' && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Folio</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Origen</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Destino</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.operaciones.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="p-0">
                      <VacioTabla mensaje="Sin operaciones" />
                    </TableCell>
                  </TableRow>
                )}
                {data.operaciones.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-[12px] font-medium text-tav-ink">
                      {o.folio}
                    </TableCell>
                    <TableCell className="text-tav-ink-2">{o.tipo}</TableCell>
                    <TableCell className="text-right tabular-nums text-tav-ink-2">
                      {o.monedaOrigen === 'BS' ? bs(o.montoOrigenCents) : usd(o.montoOrigenCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {usd(o.totalCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-tav-ink-2">
                      {bs(o.montoDestinoCents)}
                      <span className="ml-1 text-[11px] text-tav-ink-4">
                        @ {formatTasa(o.tasaAplicada)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ESTADO_OP[o.estado]}>{o.estado.replace('_', ' ')}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-[12px] text-tav-ink-2">
                      {formatFecha(o.creadaAt, true)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {pestana === 'ampliaciones' && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Nota admin</TableHead>
                  <TableHead>Solicitada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.ampliaciones.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="p-0">
                      <VacioTabla mensaje="Sin ampliaciones" />
                    </TableCell>
                  </TableRow>
                )}
                {data.ampliaciones.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-right tabular-nums font-medium">
                      {usd(a.montoCents)}
                    </TableCell>
                    <TableCell className="max-w-[320px] truncate text-tav-ink-2" title={a.motivo}>
                      {a.motivo}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ESTADO_AMP[a.estado]}>{a.estado}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate text-tav-ink-3" title={a.notaAdmin ?? ''}>
                      {a.notaAdmin || '—'}
                    </TableCell>
                    <TableCell className="font-mono text-[12px] text-tav-ink-2">
                      {formatFecha(a.solicitadaAt, true)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </PageContent>
    </>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[12px] font-medium text-tav-ink-3">{label}</div>
        <div className="mt-1 text-[14px] text-tav-ink">{valor}</div>
      </CardContent>
    </Card>
  );
}
