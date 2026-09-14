'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Check, AlertTriangle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { gyd, usd, bs, formatFecha, formatTasa, parseUserAmountToCents } from '@/lib/format';
import type { Cierre, EstadoCierre } from '@/lib/types';
import { PageHeader, PageContent } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { CargandoPagina, ErrorTabla, VacioTabla } from '@/components/estados';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const ESTILO_ESTADO: Record<EstadoCierre, { label: string; variant: 'navy' | 'verde' | 'ambar' | 'outline' }> = {
  abierto: { label: 'Abierto', variant: 'outline' },
  enviado: { label: 'Enviado', variant: 'navy' },
  verificado: { label: 'Verificado', variant: 'verde' },
  con_diferencia: { label: 'Con diferencia', variant: 'ambar' },
};

const METODO_LABEL: Record<string, string> = {
  efectivo_usd: 'Efectivo USD',
  bolivares: 'Bolívares',
  pago_movil: 'Pago móvil',
  usdt: 'USDT',
};

export default function CierreDetallePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: cierre, cargando, error, recargar } = useApi<Cierre>(
    () => api.cierreDetalle(id),
    [id],
  );

  const [recibidoGydInput, setRecibidoGydInput] = React.useState('');
  const [recibidoUsdInput, setRecibidoUsdInput] = React.useState('');
  const [nota, setNota] = React.useState('');
  const [enviando, setEnviando] = React.useState(false);

  const declaradoGydCents = cierre?.efectivoGydDeclaradoCents ?? '0';
  const declaradoUsdCents = cierre?.efectivoUsdDeclaradoCents ?? '0';
  const recibidoGydCents = React.useMemo(
    () => parseUserAmountToCents(recibidoGydInput),
    [recibidoGydInput],
  );
  const recibidoUsdCents = React.useMemo(
    () => parseUserAmountToCents(recibidoUsdInput),
    [recibidoUsdInput],
  );
  const diferenciaGyd = React.useMemo(() => {
    if (recibidoGydCents === null) return null;
    return BigInt(recibidoGydCents) - BigInt(declaradoGydCents);
  }, [recibidoGydCents, declaradoGydCents]);
  const diferenciaUsd = React.useMemo(() => {
    if (recibidoUsdCents === null) return null;
    return BigInt(recibidoUsdCents) - BigInt(declaradoUsdCents);
  }, [recibidoUsdCents, declaradoUsdCents]);

  const hayDiferencia =
    (diferenciaGyd !== null && diferenciaGyd !== 0n) ||
    (diferenciaUsd !== null && diferenciaUsd !== 0n);
  const notaObligatoria = hayDiferencia;
  const puedeEnviar =
    cierre?.estado === 'enviado' &&
    recibidoGydCents !== null &&
    recibidoUsdCents !== null &&
    (!notaObligatoria || nota.trim().length > 0) &&
    !enviando;

  // Pre-llenar el efectivo recibido con lo declarado al cargar (flujo rápido:
  // el admin normalmente recibe lo mismo; solo cambia si hay descuadre).
  React.useEffect(() => {
    if (cierre && cierre.estado === 'enviado' && !recibidoGydInput) {
      const cents = BigInt(cierre.efectivoGydDeclaradoCents);
      const enteros = cents / 100n;
      const dec = cents % 100n;
      setRecibidoGydInput(`${enteros.toString()},${dec.toString().padStart(2, '0')}`);
    }
  }, [cierre]);
  React.useEffect(() => {
    if (cierre && cierre.estado === 'enviado' && !recibidoUsdInput) {
      const cents = BigInt(cierre.efectivoUsdDeclaradoCents);
      const enteros = cents / 100n;
      const dec = cents % 100n;
      setRecibidoUsdInput(`${enteros.toString()},${dec.toString().padStart(2, '0')}`);
    }
  }, [cierre]);

  async function verificar() {
    if (!cierre || recibidoGydCents === null || recibidoUsdCents === null) return;
    setEnviando(true);
    try {
      const res = await api.verificarCierre(cierre.id, {
        efectivoGydRecibidoCents: recibidoGydCents,
        efectivoUsdRecibidoCents: recibidoUsdCents,
        nota: nota.trim() || undefined,
      });
      const est = res.estado === 'con_diferencia' ? 'con diferencia' : 'verificado';
      const desc =
        diferenciaGyd !== 0n || diferenciaUsd !== 0n
          ? `Diferencia GYD: ${gyd(diferenciaGyd ?? 0n)} · USD: ${usd(diferenciaUsd ?? 0n)}`
          : 'Cuadró perfecto';
      toast.success(`Cierre ${est}`, { description: desc });
      router.push('/cierres');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'No se pudo verificar el cierre';
      toast.error(msg);
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) return <CargandoPagina label="Cargando cierre…" />;
  if (error)
    return (
      <>
        <PageHeader titulo="Cierre" />
        <PageContent>
          <ErrorTabla mensaje={error} onReintentar={recargar} />
        </PageContent>
      </>
    );
  if (!cierre) return null;

  const est = ESTILO_ESTADO[cierre.estado];
  const cobros = cierre.cobros ?? [];
  const efectivoTotal = cobros
    .filter((c) => c.esEfectivo)
    .reduce((acc, c) => acc + BigInt(c.montoBaseCents), 0n);
  const digitalTotal = cobros
    .filter((c) => !c.esEfectivo)
    .reduce((acc, c) => acc + BigInt(c.montoBaseCents), 0n);

  return (
    <>
      <PageHeader
        titulo={`Cierre · ${cierre.cobrador?.usuario.nombre ?? 'Cobrador'}`}
        descripcion={`${formatFecha(cierre.fecha)} · ${cierre.cobrador?.usuario.telefono ?? ''}`}
        acciones={
          <Link href="/cierres">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Button>
          </Link>
        }
      />

      <PageContent className="flex flex-col gap-6">
        {/* Resumen superior */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Card>
            <CardContent className="p-4">
              <div className="text-[12px] font-medium text-tav-ink-3">Estado</div>
              <div className="mt-1.5">
                <Badge variant={est.variant}>{est.label}</Badge>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-[12px] font-medium text-tav-ink-3">Total registrado</div>
              <div className="mt-1 text-[18px] font-semibold tabular-nums">
                {gyd(cierre.totalRegistradoCents)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-[12px] font-medium text-tav-ink-3">Efectivo GYD declarado</div>
              <div className="mt-1 text-[18px] font-semibold tabular-nums">
                {gyd(cierre.efectivoGydDeclaradoCents)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-[12px] font-medium text-tav-ink-3">Efectivo USD declarado</div>
              <div className="mt-1 text-[18px] font-semibold tabular-nums">
                {usd(cierre.efectivoUsdDeclaradoCents)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-[12px] font-medium text-tav-ink-3">Digital</div>
              <div className="mt-1 text-[18px] font-semibold tabular-nums">
                {gyd(cierre.digitalCents)}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          {/* Cobros del día */}
          <div className="overflow-hidden rounded-lg border border-tav-line bg-tav-surface shadow-tav">
            <div className="flex items-center justify-between border-b border-tav-line bg-[#FAFBFC] px-4 py-3">
              <h2 className="text-[13px] font-bold uppercase tracking-[0.07em] text-tav-ink-3">
                Cobros del día ({cobros.length})
              </h2>
              <div className="flex gap-4 text-[12px] text-tav-ink-3">
                <span>Efectivo: <b className="text-tav-ink-2">{gyd(efectivoTotal)}</b></span>
                <span>Digital: <b className="text-tav-ink-2">{gyd(digitalTotal)}</b></span>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hora</TableHead>
                  <TableHead>Cajero</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">USD</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cobros.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="p-0">
                      <VacioTabla mensaje="Este cierre no tiene cobros" />
                    </TableCell>
                  </TableRow>
                )}
                {cobros.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-[12px] text-tav-ink-2">
                      {formatFecha(c.creadoAt, true).split(',')[1]?.trim() ?? '—'}
                    </TableCell>
                    <TableCell className="font-medium text-tav-ink">
                      {c.cajero?.usuario.nombre ?? '—'}
                    </TableCell>
                    <TableCell className="text-tav-ink-2">
                      {METODO_LABEL[c.metodo] ?? c.metodo}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-tav-ink-2">
                      {c.moneda === 'BS' ? bs(c.montoCents) : gyd(c.montoCents)}
                      {c.tasaAplicada ? (
                        <span className="ml-1 text-[11px] text-tav-ink-4">
                          @ {formatTasa(c.tasaAplicada)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {gyd(c.montoBaseCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Panel de verificación */}
          <Card className="h-fit lg:sticky lg:top-6">
            <CardHeader>
              <CardTitle>Verificar cierre</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {cierre.estado !== 'enviado' ? (
                <div className="rounded-md bg-tav-bg p-4 text-[13px] text-tav-ink-3">
                  Este cierre ya fue verificado
                  {cierre.verificadoAt && (
                    <> el {formatFecha(cierre.verificadoAt, true)}</>
                  )}.
                  {cierre.efectivoGydRecibidoCents !== null && cierre.efectivoGydRecibidoCents !== undefined && (
                    <div className="mt-3 space-y-1.5 border-t border-tav-line pt-3">
                      <Fila label="Efectivo GYD recibido" valor={gyd(cierre.efectivoGydRecibidoCents)} />
                      <Fila
                        label="Diferencia GYD"
                        valor={gyd(cierre.diferenciaGydCents ?? '0')}
                        destacado={
                          BigInt(cierre.diferenciaGydCents ?? '0') === 0n ? 'ok' : 'diff'
                        }
                      />
                      <Fila label="Efectivo USD recibido" valor={usd(cierre.efectivoUsdRecibidoCents ?? '0')} />
                      <Fila
                        label="Diferencia USD"
                        valor={usd(cierre.diferenciaUsdCents ?? '0')}
                        destacado={
                          BigInt(cierre.diferenciaUsdCents ?? '0') === 0n ? 'ok' : 'diff'
                        }
                      />
                      {cierre.notaAdmin && (
                        <div className="pt-2">
                          <div className="text-[12px] font-medium text-tav-ink-3">Nota</div>
                          <div className="mt-1 text-[13px] text-tav-ink-2">{cierre.notaAdmin}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="rounded-md bg-tav-blue-50 p-3 text-[13px] text-tav-blue-600">
                    Captura el efectivo que realmente recibiste, por moneda. El sistema
                    cuadra contra lo declarado (GYD {gyd(cierre.efectivoGydDeclaradoCents)} ·
                    USD {usd(cierre.efectivoUsdDeclaradoCents)}).
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="recibido-gyd">Efectivo GYD recibido</Label>
                    <Input
                      id="recibido-gyd"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={recibidoGydInput}
                      onChange={(e) => setRecibidoGydInput(e.target.value)}
                      className="font-mono tabular-nums"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="recibido-usd">Efectivo USD recibido</Label>
                    <Input
                      id="recibido-usd"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={recibidoUsdInput}
                      onChange={(e) => setRecibidoUsdInput(e.target.value)}
                      className="font-mono tabular-nums"
                    />
                  </div>

                  {/* Cálculo en vivo */}
                  <div className="rounded-md border border-tav-line bg-tav-bg p-3 space-y-1.5">
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-tav-ink-3">Declarado GYD</span>
                      <span className="tabular-nums font-medium text-tav-ink-2">
                        {gyd(declaradoGydCents)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-tav-ink-3">Recibido GYD</span>
                      <span className="tabular-nums font-medium text-tav-ink-2">
                        {recibidoGydCents !== null ? gyd(recibidoGydCents) : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-tav-line pt-1.5">
                      <span className="text-[13px] font-semibold text-tav-ink">Diferencia GYD</span>
                      <span
                        className={cn(
                          'tabular-nums text-[15px] font-bold',
                          diferenciaGyd === null
                            ? 'text-tav-ink-4'
                            : diferenciaGyd === 0n
                              ? 'text-tav-green-600'
                              : 'text-tav-red-700',
                        )}
                      >
                        {diferenciaGyd === null ? '—' : gyd(diferenciaGyd)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[13px]">
                      <span className="text-tav-ink-3">Declarado USD</span>
                      <span className="tabular-nums font-medium text-tav-ink-2">
                        {usd(declaradoUsdCents)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-tav-ink-3">Recibido USD</span>
                      <span className="tabular-nums font-medium text-tav-ink-2">
                        {recibidoUsdCents !== null ? usd(recibidoUsdCents) : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-tav-line pt-1.5">
                      <span className="text-[13px] font-semibold text-tav-ink">Diferencia USD</span>
                      <span
                        className={cn(
                          'tabular-nums text-[15px] font-bold',
                          diferenciaUsd === null
                            ? 'text-tav-ink-4'
                            : diferenciaUsd === 0n
                              ? 'text-tav-green-600'
                              : 'text-tav-red-700',
                        )}
                      >
                        {diferenciaUsd === null ? '—' : usd(diferenciaUsd)}
                      </span>
                    </div>
                  </div>

                  {hayDiferencia && (
                    <div className="flex items-start gap-2 rounded-md bg-tav-gold-50 p-3 text-[12.5px] text-tav-gold-700">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        Hay diferencia. La <b>nota es obligatoria</b> para registrar el descuadre.
                      </span>
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="nota">
                      Nota {notaObligatoria ? <span className="text-tav-red-700">*</span> : '(opcional)'}
                    </Label>
                    <Textarea
                      id="nota"
                      placeholder={notaObligatoria ? 'Explica el descuadre…' : 'Comentario opcional…'}
                      value={nota}
                      onChange={(e) => setNota(e.target.value)}
                      rows={3}
                    />
                  </div>

                  <Button
                    onClick={verificar}
                    disabled={!puedeEnviar}
                    className="h-11"
                    variant={hayDiferencia ? 'navy' : 'default'}
                  >
                    {enviando ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Verificando…
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" /> Verificar cierre
                      </>
                    )}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </PageContent>
    </>
  );
}

function Fila({
  label,
  valor,
  destacado,
}: {
  label: string;
  valor: string;
  destacado?: 'ok' | 'diff';
}) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-tav-ink-3">{label}</span>
      <span
        className={cn(
          'tabular-nums font-semibold',
          destacado === 'ok' && 'text-tav-green-600',
          destacado === 'diff' && 'text-tav-red-700',
          !destacado && 'text-tav-ink',
        )}
      >
        {valor}
      </span>
    </div>
  );
}
