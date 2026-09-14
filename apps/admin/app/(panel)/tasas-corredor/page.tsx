'use client';

import * as React from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { formatTasa, formatFecha } from '@/lib/format';
import type { PublicacionTasas, PublicarTasasPayload, AvisoPublicacion } from '@/lib/types';
import { PageHeader, PageContent } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

interface FilaCorredor {
  corredorId: string;
  paisNombre: string;
  moneda: string;
  monedaNombre: string;
  formaEntregaNombre: string;
  pataDestino: string;
  margen: string;
  tasaCotizada: string;
  // Valores anteriores (de la publicación vigente).
  prevPataDestino?: string;
  prevMargen?: string;
  prevTasaCotizada?: string;
}

export default function TasasCorredorPage() {
  const { data: actual, cargando, error, recargar } = useApi<PublicacionTasas | null>(
    () => api.tasasCorredorActual(),
    [],
  );

  const [pataBase, setPataBase] = React.useState('');
  const [prevPataBase, setPrevPataBase] = React.useState('');
  const [filas, setFilas] = React.useState<FilaCorredor[]>([]);
  const [publicando, setPublicando] = React.useState(false);
  const [avisos, setAvisos] = React.useState<AvisoPublicacion[] | null>(null);
  const [confirmando, setConfirmando] = React.useState(false);

  // Precargar la pantalla con la publicación vigente.
  React.useEffect(() => {
    if (!actual) {
      setPataBase('');
      setPrevPataBase('');
      setFilas([]);
      return;
    }
    setPataBase(actual.pataBase);
    setPrevPataBase(actual.pataBase);
    setFilas(
      actual.items.map((it) => ({
        corredorId: it.corredorId,
        paisNombre: it.corredor?.paisNombre ?? '?',
        moneda: it.corredor?.moneda ?? '?',
        monedaNombre: it.corredor?.monedaNombre ?? '?',
        formaEntregaNombre: it.corredor?.formaEntregaNombre ?? '?',
        pataDestino: it.pataDestino,
        margen: it.margen,
        tasaCotizada: it.tasaCotizada,
        prevPataDestino: it.pataDestino,
        prevMargen: it.margen,
        prevTasaCotizada: it.tasaCotizada,
      })),
    );
  }, [actual]);

  // Recalcular tasaCotizada en vivo cuando cambian pataBase, pataDestino o margen.
  function recalcularFila(f: FilaCorredor): FilaCorredor {
    const base = Number(pataBase);
    const dest = Number(f.pataDestino);
    const margen = Number(f.margen);
    if (!base || !dest || isNaN(margen)) return f;
    const tasa = (dest / base) * (1 - margen / 100);
    return { ...f, tasaCotizada: tasa.toFixed(8) };
  }

  function actualizarFila(corredorId: string, campo: 'pataDestino' | 'margen', valor: string) {
    setFilas((prev) =>
      prev.map((f) => recalcularFila({ ...f, [campo]: valor })),
    );
  }

  function buildPayload(): PublicarTasasPayload | null {
    if (!pataBase.trim() || filas.length === 0) return null;
    return {
      pataBase: pataBase.trim().replace(',', '.'),
      items: filas.map((f) => ({
        corredorId: f.corredorId,
        pataDestino: f.pataDestino.trim().replace(',', '.'),
        margen: f.margen.trim().replace(',', '.'),
      })),
    };
  }

  async function previsualizar() {
    const payload = buildPayload();
    if (!payload) {
      toast.error('Faltan valores');
      return;
    }
    try {
      const res = await api.previsualizarTasasCorredor(payload);
      setAvisos(res.avisos);
      if (res.avisos.length === 0) {
        toast.success('Sin avisos: todo dentro del umbral y sin corredores omitidos');
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo previsualizar');
    }
  }

  async function publicar() {
    const payload = buildPayload();
    if (!payload) {
      toast.error('Faltan valores');
      return;
    }

    // Si hay avisos y no estamos confirmando, previsualizar primero.
    if (!confirmando && avisos === null) {
      try {
        const prev = await api.previsualizarTasasCorredor(payload);
        if (prev.avisos.length > 0) {
          setAvisos(prev.avisos);
          setConfirmando(true);
          return;
        }
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : 'No se pudo previsualizar');
        return;
      }
    }

    setPublicando(true);
    try {
      const res = await api.publicarTasasCorredor(payload);
      toast.success('Tasas publicadas', {
        description: `Pata base ${formatTasa(payload.pataBase)}`,
      });
      setAvisos(null);
      setConfirmando(false);
      recargar();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo publicar');
    } finally {
      setPublicando(false);
    }
  }

  if (cargando) {
    return (
      <>
        <PageHeader titulo="Tasas por corredor" descripcion="Publica la pata base y las patas destino de todos los corredores en una sola acción." />
        <PageContent className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-tav-ink-3" />
        </PageContent>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader titulo="Tasas por corredor" descripcion="Publica la pata base y las patas destino de todos los corredores en una sola acción." />
        <PageContent>
          <p className="text-tav-error">{error}</p>
          <Button onClick={recargar} variant="outline" className="mt-4">Reintentar</Button>
        </PageContent>
      </>
    );
  }

  return (
    <>
      <PageHeader
        titulo="Tasas por corredor"
        descripcion="La pata base (1 USDT = X GYD) mueve todos los corredores. Cada corredor tiene su pata destino y margen. La tasa cotizada se calcula y se congela al publicar."
      />

      <PageContent className="flex flex-col gap-6">
        {/* Pata base — destacada */}
        <Card className="border-2 border-tav-navy/30 bg-tav-navy/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Pata base · 1 USDT = X GYD
              <Badge variant="navy">Global</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pataBase">1 USDT equivale a</Label>
                <Input
                  id="pataBase"
                  inputMode="decimal"
                  placeholder="208"
                  value={pataBase}
                  onChange={(e) => {
                    setPataBase(e.target.value);
                    setFilas((prev) => prev.map(recalcularFila));
                  }}
                  className="font-mono tabular-nums text-[20px] font-bold h-12 w-40"
                />
                <span className="text-[12px] text-tav-ink-3">GYD por cada USDT</span>
              </div>
              {prevPataBase && (
                <div className="pb-3 text-[13px] text-tav-ink-3">
                  Antes: <b className="font-mono">{formatTasa(prevPataBase)}</b>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Filas por corredor */}
        <div className="overflow-hidden rounded-lg border border-tav-line bg-tav-surface shadow-tav">
          <div className="border-b border-tav-line bg-[#FAFBFC] px-4 py-3">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.07em] text-tav-ink-3">
              Corredores · {filas.length}
            </h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Corredor</TableHead>
                <TableHead className="text-right">1 USDT =</TableHead>
                <TableHead className="text-right">Margen %</TableHead>
                <TableHead className="text-right">Tasa cotizada</TableHead>
                <TableHead className="text-right">Anterior</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-tav-ink-3 py-8">
                    No hay corredores activos. Crea corredores desde el panel de cajas.
                  </TableCell>
                </TableRow>
              )}
              {filas.map((f) => (
                <TableRow key={f.corredorId}>
                  <TableCell>
                    <div className="font-medium text-tav-ink">{f.paisNombre}</div>
                    <div className="text-[12px] text-tav-ink-3">
                      {f.monedaNombre} · {f.formaEntregaNombre}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      inputMode="decimal"
                      value={f.pataDestino}
                      onChange={(e) => actualizarFila(f.corredorId, 'pataDestino', e.target.value)}
                      className="ml-auto w-28 text-right font-mono tabular-nums h-9"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      inputMode="decimal"
                      value={f.margen}
                      onChange={(e) => actualizarFila(f.corredorId, 'margen', e.target.value)}
                      className="ml-auto w-20 text-right font-mono tabular-nums h-9"
                    />
                  </TableCell>
                  <TableCell className="text-right font-mono text-[14px] font-bold tabular-nums text-tav-navy">
                    {formatTasa(f.tasaCotizada)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[12px] text-tav-ink-3">
                    {f.prevTasaCotizada ? formatTasa(f.prevTasaCotizada) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Avisos */}
        {avisos && avisos.length > 0 && (
          <Card className="border-2 border-tav-gold/40 bg-tav-gold/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-tav-gold-700">
                <AlertTriangle className="h-5 w-5" />
                Avisos antes de publicar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2 text-[13px]">
                {avisos.map((a, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="font-medium text-tav-ink">
                      {a.tipo === 'corredor_omitido' && 'Corredor omitido'}
                      {a.tipo === 'desviacion_pata_base' && 'Pata base cambió'}
                      {a.tipo === 'desviacion_pata_destino' && 'Pata destino cambió'}
                      {a.tipo === 'desviacion_margen' && 'Margen cambió'}
                    </span>
                    {a.antes && a.ahora && (
                      <span className="text-tav-ink-3">
                        de <b className="font-mono">{formatTasa(a.antes)}</b> a{' '}
                        <b className="font-mono">{formatTasa(a.ahora)}</b>{' '}
                        ({a.pct}% de desviación)
                      </span>
                    )}
                    {a.tipo === 'corredor_omitido' && (
                      <span className="text-tav-ink-3">
                        Este corredor activo no aparece en la publicación y dejará de ser ofrecible.
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {confirmando && (
                <p className="mt-3 text-[13px] font-medium text-tav-ink-2">
                  Confirma que quieres publicar con estos cambios.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Botones */}
        <div className="flex items-center gap-3">
          <Button onClick={publicar} disabled={publicando || filas.length === 0 || !pataBase.trim()} className="h-11">
            {publicando ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmando ? 'Confirmar y publicar' : 'Publicar todo'}
          </Button>
          <Button onClick={previsualizar} variant="outline" className="h-11">
            Previsualizar avisos
          </Button>
          {confirmando && (
            <Button
              onClick={() => { setConfirmando(false); setAvisos(null); }}
              variant="ghost"
              className="h-11"
            >
              Cancelar
            </Button>
          )}
        </div>

        {/* Historial */}
        {actual && (
          <div className="text-[12px] text-tav-ink-3">
            Última publicación: {formatFecha(actual.publicadaAt, true)}
          </div>
        )}
      </PageContent>
    </>
  );
}
