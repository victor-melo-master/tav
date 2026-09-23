'use client';

import * as React from 'react';
import { RefreshCw, CalendarDays } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { gyd, usd, formatTasa, formatFecha } from '@/lib/format';
import type { MovimientosDiarios, MovimientoDiarioItem } from '@/lib/types';
import { PageHeader, PageContent } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { CargandoTabla, ErrorTabla, VacioTabla } from '@/components/estados';
import { cn } from '@/lib/utils';

/** Fecha de hoy en Caracas como "YYYY-MM-DD" para el input type="date". */
function hoyYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Formatea un porcentaje Decimal ("0.055") a "5,50%". */
function formatPct(valor: string | null | undefined): string {
  if (!valor) return '—';
  const num = Number(valor);
  if (!Number.isFinite(num)) return '—';
  return `${num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`;
}

export default function MovimientosDiariosPage() {
  const [fecha, setFecha] = React.useState(hoyYmd());

  const { data, cargando, error, recargar } = useApi<MovimientosDiarios>(
    () => api.movimientosDiarios(fecha),
    [fecha],
  );

  return (
    <>
      <PageHeader
        titulo="Movimientos diarios"
        descripcion="Todas las operaciones del día con su precio de venta, precio de compra y margen. El porcentaje es venta ÷ compra − 1, ponderado por monto."
        acciones={
          <Button variant="outline" size="sm" onClick={recargar}>
            <RefreshCw className="h-4 w-4" /> Actualizar
          </Button>
        }
      />

      <PageContent className="flex flex-col gap-6">
        {/* Selector de fecha */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fecha-mov" className="flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" /> Fecha
            </Label>
            <Input
              id="fecha-mov"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-44 font-mono tabular-nums"
            />
          </div>
          <div className="text-[13px] text-tav-ink-3">
            {data ? formatFecha(`${data.fecha}T12:00:00-04:00`) : '…'}
          </div>
        </div>

        {/* Totales del día */}
        {data && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-tav-ink-3">
                  Operaciones
                </div>
                <div className="mt-1 text-[22px] font-bold tabular-nums text-tav-ink">
                  {data.totales.operaciones}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-tav-ink-3">
                  USD movidos
                </div>
                <div className="mt-1 text-[22px] font-bold tabular-nums text-tav-ink">
                  {usd(data.totales.usdCents)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-tav-ink-3">
                  Ganancia
                </div>
                <div className="mt-1 text-[22px] font-bold tabular-nums text-tav-green">
                  {gyd(data.totales.gananciaGydCents)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-tav-ink-3">
                  % promedio
                </div>
                <div className="mt-1 text-[22px] font-bold tabular-nums text-tav-green">
                  {formatPct(data.totales.pctPromedioPonderado)}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabla de operaciones */}
        <div className="overflow-hidden rounded-lg border border-tav-line bg-tav-surface shadow-tav">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Folio</TableHead>
                <TableHead>Cajero</TableHead>
                <TableHead>Servicio</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="text-right">Venta</TableHead>
                <TableHead className="text-right">Compra</TableHead>
                <TableHead className="text-right">Margen</TableHead>
                <TableHead className="text-right">%</TableHead>
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
              {!cargando && !error && (data?.operaciones.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="p-0">
                    <VacioTabla mensaje="No hay operaciones este día" />
                  </TableCell>
                </TableRow>
              )}
              {!cargando &&
                !error &&
                data?.operaciones.map((op) => <OperacionFila key={op.id} op={op} />)}
            </TableBody>
          </Table>
        </div>

        {/* Nota sobre operaciones sin precio de compra */}
        {data && data.operaciones.some((o) => o.precioCompra === null) && (
          <div className="rounded-lg border border-tav-gold/30 bg-tav-gold-50 px-4 py-3 text-[13px] text-tav-gold-700">
            Las operaciones sin precio de compra se muestran con el margen vacío y no entran
            en los totales. Son las registradas antes de la primera compra de USDT.
          </div>
        )}
      </PageContent>
    </>
  );
}

function OperacionFila({ op }: { op: MovimientoDiarioItem }) {
  const sinPrecioCompra = op.precioCompra === null;
  return (
    <TableRow className={cn(sinPrecioCompra && 'bg-tav-gold-50/30')}>
      <TableCell className="font-mono text-[12px] text-tav-ink-2">{op.folio}</TableCell>
      <TableCell className="font-medium text-tav-ink">{op.cajero}</TableCell>
      <TableCell className="text-tav-ink-2">{op.servicio}</TableCell>
      <TableCell className="text-right font-mono tabular-nums text-tav-ink">
        {usd(op.montoUsdCents)}
      </TableCell>
      <TableCell className="text-right font-mono tabular-nums text-tav-ink">
        {formatTasa(op.precioVenta)}
      </TableCell>
      <TableCell className="text-right font-mono tabular-nums text-tav-ink-3">
        {op.precioCompra ? formatTasa(op.precioCompra) : '—'}
      </TableCell>
      <TableCell
        className={cn(
          'text-right font-mono tabular-nums',
          op.margenGydCents ? 'font-semibold text-tav-green' : 'text-tav-ink-4',
        )}
      >
        {op.margenGydCents ? gyd(op.margenGydCents) : '—'}
      </TableCell>
      <TableCell
        className={cn(
          'text-right font-mono tabular-nums',
          op.pctMargen ? 'font-semibold text-tav-green' : 'text-tav-ink-4',
        )}
      >
        {formatPct(op.pctMargen)}
      </TableCell>
    </TableRow>
  );
}
