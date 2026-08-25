'use client';

import * as React from 'react';
import { Loader2, Check, Search } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { usd, parseUserAmountToCents } from '@/lib/format';
import type { CajeroLista, MetodoCobro } from '@/lib/types';
import { PageHeader, PageContent } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { SemaforoDot } from '@/components/estados';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const METODOS: { valor: MetodoCobro; label: string; moneda: 'USD' | 'BS' | 'USDT' }[] = [
  { valor: 'efectivo_usd', label: 'Efectivo USD', moneda: 'USD' },
  { valor: 'bolivares', label: 'Bolívares', moneda: 'BS' },
  { valor: 'pago_movil', label: 'Pago móvil', moneda: 'BS' },
  { valor: 'usdt', label: 'USDT', moneda: 'USDT' },
];

export default function RegistrarCobroPage() {
  const { data: cajeros, cargando: cajCargando } = useApi<CajeroLista[]>(() => api.cajeros(), []);

  const [q, setQ] = React.useState('');
  const [cajeroId, setCajeroId] = React.useState('');
  const [metodo, setMetodo] = React.useState<MetodoCobro>('efectivo_usd');
  const [monto, setMonto] = React.useState('');
  const [tasa, setTasa] = React.useState('');
  const [nota, setNota] = React.useState('');
  const [enviando, setEnviando] = React.useState(false);
  const [ultimo, setUltimo] = React.useState<string | null>(null);

  const moneda = METODOS.find((m) => m.valor === metodo)?.moneda ?? 'USD';
  const requiereTasa = moneda === 'BS';

  const cajerosFiltrados = React.useMemo(() => {
    if (!cajeros) return [];
    if (!q.trim()) return cajeros;
    const t = q.toLowerCase();
    return cajeros.filter(
      (c) => c.nombre.toLowerCase().includes(t) || c.telefono.toLowerCase().includes(t),
    );
  }, [cajeros, q]);

  const cajeroSel = cajeros?.find((c) => c.id === cajeroId) ?? null;
  const montoCents = parseUserAmountToCents(monto);
  const tasaValida = !requiereTasa || /^\d+([.,]\d+)?$/.test(tasa.trim());

  const valido = cajeroId && montoCents !== null && BigInt(montoCents) > 0n && tasaValida;

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    if (!valido || !cajeroSel) return;
    setEnviando(true);
    try {
      const clientUuid = crypto.randomUUID();
      const res = await api.registrarCobro({
        clientUuid,
        cajeroId,
        metodo,
        montoCents,
        moneda,
        tasaAplicada: requiereTasa ? tasa.trim().replace(',', '.') : undefined,
        nota: nota.trim() || undefined,
      });
      if (res.yaExistia) {
        toast.info('El cobro ya existía (idempotente)', {
          description: `Folio ${res.cobro.folio}`,
        });
      } else {
        toast.success('Pago registrado', {
          description: `${cajeroSel.nombre} · ${usd(res.cobro.montoUsdCents)} · ${res.cobro.folio}`,
        });
      }
      setUltimo(res.cobro.folio);
      setMonto('');
      setTasa('');
      setNota('');
    } catch (e2) {
      toast.error(e2 instanceof ApiError ? e2.message : 'No se pudo registrar el pago');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <PageHeader
        titulo="Registrar pago"
        descripcion="Registra un pago en nombre de un cajero, sin cobrador. No toca ningún cierre: descuenta la deuda directamente."
      />

      <PageContent className="max-w-3xl">
        {ultimo && (
          <div className="mb-4 flex items-center gap-2 rounded-md bg-tav-green-50 px-4 py-3 text-[13px] text-tav-green-600">
            <Check className="h-4 w-4" />
            Último cobro registrado: <b className="font-mono">{ultimo}</b>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_400px]">
          {/* Selector de cajero */}
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-[15px]">Cajero</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tav-ink-4" />
                <Input
                  placeholder="Buscar nombre o teléfono…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="max-h-[420px] overflow-y-auto scrollbar-thin rounded-md border border-tav-line">
                {cajCargando && (
                  <div className="py-8 text-center text-[13px] text-tav-ink-3">Cargando cajeros…</div>
                )}
                {!cajCargando && cajerosFiltrados.length === 0 && (
                  <div className="py-8 text-center text-[13px] text-tav-ink-3">Sin resultados</div>
                )}
                {cajerosFiltrados.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCajeroId(c.id)}
                    className={cn(
                      'flex w-full items-center gap-3 border-b border-tav-line-2 px-3 py-2.5 text-left transition-colors last:border-0',
                      cajeroId === c.id ? 'bg-tav-blue-50' : 'hover:bg-tav-bg',
                    )}
                  >
                    <SemaforoDot estado={c.semaforo} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-medium text-tav-ink">{c.nombre}</div>
                      <div className="font-mono text-[11.5px] text-tav-ink-3">{c.telefono}</div>
                    </div>
                    <div className="text-right">
                      <div className="tabular-nums text-[13px] font-semibold text-tav-ink-2">
                        {usd(c.saldoCents)}
                      </div>
                      <div className="text-[11px] text-tav-ink-4">deuda</div>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Formulario de cobro */}
          <Card>
            <CardHeader>
              <CardTitle className="text-[15px]">Datos del pago</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={registrar} className="flex flex-col gap-4">
                {cajeroSel && (
                  <div className="flex items-center justify-between rounded-md bg-tav-bg px-3 py-2.5">
                    <div>
                      <div className="text-[12px] text-tav-ink-3">Cajero seleccionado</div>
                      <div className="text-[14px] font-semibold text-tav-ink">{cajeroSel.nombre}</div>
                    </div>
                    <Badge variant="outline">Deuda {usd(cajeroSel.saldoCents)}</Badge>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="metodo">Método</Label>
                  <Select value={metodo} onValueChange={(v) => setMetodo(v as MetodoCobro)}>
                    <SelectTrigger id="metodo">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {METODOS.map((m) => (
                        <SelectItem key={m.valor} value={m.valor}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="monto">
                    Monto {moneda === 'BS' ? '(Bs)' : moneda === 'USDT' ? '(USDT)' : '(USD)'}
                  </Label>
                  <Input
                    id="monto"
                    inputMode="decimal"
                    placeholder={moneda === 'BS' ? '353.896,00' : '500,00'}
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    className="font-mono tabular-nums"
                  />
                </div>

                {requiereTasa && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="tasa">
                      Tasa aplicada <span className="text-tav-red-700">*</span>
                    </Label>
                    <Input
                      id="tasa"
                      inputMode="decimal"
                      placeholder="285,40"
                      value={tasa}
                      onChange={(e) => setTasa(e.target.value)}
                      className="font-mono tabular-nums"
                    />
                    <p className="text-[12px] text-tav-ink-3">
                      La tasa se congela en el registro. Equivalente en USD:{' '}
                      <b className="font-mono text-tav-ink-2">
                        {montoCents && /^\d+([.,]\d+)?$/.test(tasa.trim())
                          ? usd(calcularUsd(montoCents, tasa.trim().replace(',', '.'), moneda))
                          : '—'}
                      </b>
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="nota-cobro">Nota (opcional)</Label>
                  <Textarea
                    id="nota-cobro"
                    rows={2}
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                  />
                </div>

                <Button type="submit" disabled={enviando || !valido} className="h-11">
                  {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Registrar pago'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </PageContent>
    </>
  );
}

/** Convierte monto en BS a USD usando la tasa (string decimal). */
function calcularUsd(montoCents: string, tasa: string, _moneda: string): string {
  const montoBs = Number(montoCents) / 100;
  const t = Number(tasa);
  if (!t) return '0';
  const usdVal = montoBs / t;
  return BigInt(Math.round(usdVal * 100)).toString();
}
