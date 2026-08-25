'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { formatTasa, formatFecha } from '@/lib/format';
import type { Tasa } from '@/lib/types';
import { PageHeader, PageContent } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { CargandoTabla, ErrorTabla, VacioTabla } from '@/components/estados';
import { toast } from 'sonner';

const PARES = [
  { valor: 'USDT_BS', label: 'USDT → Bs' },
  { valor: 'USD_BS', label: 'USD efectivo → Bs' },
  { valor: 'ZELLE_BS', label: 'Zelle → Bs' },
];

export default function TasasPage() {
  const [par, setPar] = React.useState('USDT_BS');
  const [valor, setValor] = React.useState('');
  const [fijando, setFijando] = React.useState(false);

  const { data, cargando, error, recargar } = useApi<Tasa[]>(() => api.tasas(), []);

  // Tasa vigente por par (la más reciente de cada par).
  const vigentes = React.useMemo(() => {
    const map = new Map<string, Tasa>();
    for (const t of data ?? []) {
      if (!map.has(t.par)) map.set(t.par, t); // ya viene ordenada desc por vigenteDesde
    }
    return map;
  }, [data]);

  const historial = React.useMemo(
    () => (data ?? []).filter((t) => t.par === par),
    [data, par],
  );

  async function fijar() {
    const v = valor.trim().replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(v)) {
      toast.error('El valor debe ser un número decimal positivo');
      return;
    }
    setFijando(true);
    try {
      await api.fijarTasa(par, v);
      toast.success('Tasa fijada', { description: `${par}: ${formatTasa(v)}` });
      setValor('');
      recargar();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo fijar la tasa');
    } finally {
      setFijando(false);
    }
  }

  return (
    <>
      <PageHeader
        titulo="Tasas"
        descripcion="Fija la tasa del día para cada par. Las operaciones pasadas conservan la tasa con la que se hicieron: el pasado no cambia."
      />

      <PageContent className="flex flex-col gap-6">
        {/* Fijar tasa + vigentes */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[420px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Fijar tasa del día</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="par">Par</Label>
                <Select value={par} onValueChange={setPar}>
                  <SelectTrigger id="par">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PARES.map((p) => (
                      <SelectItem key={p.valor} value={p.valor}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="valor">Valor de la tasa</Label>
                <Input
                  id="valor"
                  inputMode="decimal"
                  placeholder="285,40"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  className="font-mono tabular-nums"
                />
                {vigentes.get(par) && (
                  <p className="text-[12px] text-tav-ink-3">
                    Vigente actual: <b className="font-mono text-tav-ink-2">{formatTasa(vigentes.get(par)!.valor)}</b> desde{' '}
                    {formatFecha(vigentes.get(par)!.vigenteDesde)}
                  </p>
                )}
              </div>
              <Button onClick={fijar} disabled={fijando || !valor.trim()} className="h-11">
                {fijando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Fijar tasa'}
              </Button>
            </CardContent>
          </Card>

          {/* Vigentes por par */}
          <Card>
            <CardHeader>
              <CardTitle>Tasas vigentes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {PARES.map((p) => {
                  const t = vigentes.get(p.valor);
                  return (
                    <div key={p.valor} className="rounded-md border border-tav-line bg-tav-bg p-3">
                      <div className="text-[12px] font-medium text-tav-ink-3">{p.label}</div>
                      <div className="mt-1 font-mono text-[20px] font-bold tabular-nums text-tav-ink">
                        {t ? formatTasa(t.valor) : '—'}
                      </div>
                      <div className="mt-0.5 text-[11px] text-tav-ink-4">
                        {t ? `Desde ${formatFecha(t.vigenteDesde)}` : 'Sin tasa'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Historial del par seleccionado */}
        <div className="overflow-hidden rounded-lg border border-tav-line bg-tav-surface shadow-tav">
          <div className="flex items-center justify-between border-b border-tav-line bg-[#FAFBFC] px-4 py-3">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.07em] text-tav-ink-3">
              Historial · {PARES.find((p) => p.valor === par)?.label ?? par}
            </h2>
            <Select value={par} onValueChange={setPar}>
              <SelectTrigger className="h-8 w-44 text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARES.map((p) => (
                  <SelectItem key={p.valor} value={p.valor}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vigente desde</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cargando && (
                <TableRow>
                  <TableCell colSpan={3} className="p-0">
                    <CargandoTabla />
                  </TableCell>
                </TableRow>
              )}
              {!cargando && error && (
                <TableRow>
                  <TableCell colSpan={3} className="p-0">
                    <ErrorTabla mensaje={error} onReintentar={recargar} />
                  </TableCell>
                </TableRow>
              )}
              {!cargando && !error && historial.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="p-0">
                    <VacioTabla mensaje="Sin historial para este par" />
                  </TableCell>
                </TableRow>
              )}
              {!cargando &&
                !error &&
                historial.map((t, i) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-[12px] text-tav-ink-2">
                      {formatFecha(t.vigenteDesde, true)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[14px] font-semibold tabular-nums">
                      {formatTasa(t.valor)}
                    </TableCell>
                    <TableCell>
                      {i === 0 ? (
                        <Badge variant="verde">Vigente</Badge>
                      ) : (
                        <Badge variant="outline">Histórica</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </PageContent>
    </>
  );
}
