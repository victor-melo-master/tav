'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { formatTasa, formatFecha } from '@/lib/format';
import type { PrecioCajeroServicio, PrecioCajeroHistorial } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { toast } from 'sonner';

/**
 * Editor de precios por cajero (nuevo modelo de Fase 9).
 *
 * Cada cajero tiene su propio precio en GYD por dólar, por servicio. Lo fija
 * el admin desde aquí. El precio se congela en cada operación; cambiarlo
 * aquí nunca altera una operación registrada. El historial es consultable
 * porque el precio determina deudas pasadas.
 *
 * El precio es un RATIO (GYD por 1 USD), no un monto. Se captura como string
 * decimal, igual que las tasas. La deuda la calcula el servidor.
 */
export function PreciosCajero({ cajeroId }: { cajeroId: string }) {
  const { data, cargando, error, recargar } = useApi<PrecioCajeroServicio[]>(
    () => api.preciosCajero(cajeroId),
    [cajeroId],
  );
  const [editando, setEditando] = React.useState<string | null>(null);
  const [valor, setValor] = React.useState('');
  const [guardando, setGuardando] = React.useState(false);
  const [verHistorial, setVerHistorial] = React.useState(false);

  async function guardar(servicioId: string) {
    if (!valor.trim()) {
      toast.error('Escribe un precio');
      return;
    }
    setGuardando(true);
    try {
      await api.fijarPrecioCajero(cajeroId, {
        servicioId,
        precioGyd: valor.trim().replace(',', '.'),
      });
      toast.success('Precio fijado');
      setEditando(null);
      setValor('');
      recargar();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo fijar el precio');
    } finally {
      setGuardando(false);
    }
  }

  function empezarEditar(servicioId: string, actual: string | null) {
    setEditando(servicioId);
    setValor(actual ?? '');
  }

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-tav-ink-3" />
      </div>
    );
  }
  if (error) return <p className="text-tav-error">{error}</p>;
  if (!data) return null;

  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-[13px] text-tav-ink-3">
        Precio en GYD por dólar para cada servicio. El precio se congela en cada
        operación; cambiarlo aquí no altera operaciones ya registradas.
      </p>

      <div className="overflow-hidden rounded-lg border border-tav-line">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Servicio</TableHead>
              <TableHead>Moneda</TableHead>
              <TableHead className="text-right">Precio vigente</TableHead>
              <TableHead>Desde</TableHead>
              <TableHead className="text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((p) => (
              <TableRow key={p.servicioId}>
                <TableCell>
                  <div className="font-medium text-tav-ink">{p.paisNombre}</div>
                  <div className="text-[12px] text-tav-ink-3">
                    {p.formaEntregaNombre}
                    {p.servicioNombre ? ` · ${p.servicioNombre}` : ''}
                  </div>
                </TableCell>
                <TableCell className="text-tav-ink-2">{p.moneda}</TableCell>
                <TableCell className="text-right">
                  {editando === p.servicioId ? (
                    <div className="flex items-center justify-end gap-1.5">
                      <Input
                        inputMode="decimal"
                        value={valor}
                        onChange={(e) => setValor(e.target.value)}
                        placeholder="240"
                        className="w-28 text-right font-mono tabular-nums h-9"
                        autoFocus
                      />
                      <span className="text-[12px] text-tav-ink-3">G$ / USD</span>
                    </div>
                  ) : p.precioGyd ? (
                    <span className="font-mono tabular-nums font-medium text-tav-navy">
                      G$ {formatTasa(p.precioGyd)}
                    </span>
                  ) : (
                    <Badge variant="ambar">Sin fijar</Badge>
                  )}
                </TableCell>
                <TableCell className="font-mono text-[12px] text-tav-ink-3">
                  {p.vigenteDesde ? formatFecha(p.vigenteDesde, true) : '—'}
                </TableCell>
                <TableCell className="text-right">
                  {editando === p.servicioId ? (
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        onClick={() => guardar(p.servicioId)}
                        disabled={guardando}
                      >
                        {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Guardar'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditando(null)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => empezarEditar(p.servicioId, p.precioGyd)}
                    >
                      {p.precioGyd ? 'Cambiar' : 'Fijar precio'}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setVerHistorial((v) => !v)}>
          {verHistorial ? 'Ocultar historial' : 'Ver historial de cambios'}
        </Button>
      </div>

      {verHistorial && <HistorialPrecios cajeroId={cajeroId} />}
    </div>
  );
}

function HistorialPrecios({ cajeroId }: { cajeroId: string }) {
  const { data, cargando, error, recargar } = useApi<PrecioCajeroHistorial[]>(
    () => api.historialPreciosCajero(cajeroId),
    [cajeroId],
  );

  if (cargando) return <Loader2 className="h-4 w-4 animate-spin text-tav-ink-3" />;
  if (error) return <p className="text-tav-error">{error}</p>;
  if (!data || data.length === 0) {
    return <p className="text-[13px] text-tav-ink-3">Sin cambios registrados.</p>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[14px]">Historial de precios</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Servicio</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead>Fecha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((h) => (
              <TableRow key={h.id}>
                <TableCell>
                  <div className="font-medium text-tav-ink">{h.servicio.paisNombre}</div>
                  <div className="text-[12px] text-tav-ink-3">
                    {h.servicio.formaEntregaNombre} · {h.servicio.moneda}
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  G$ {formatTasa(h.precioGyd)}
                </TableCell>
                <TableCell className="font-mono text-[12px] text-tav-ink-3">
                  {formatFecha(h.vigenteDesde, true)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Button variant="ghost" size="sm" className="mt-3" onClick={recargar}>
          Refrescar
        </Button>
      </CardContent>
    </Card>
  );
}
