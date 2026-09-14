'use client';

import * as React from 'react';
import { Loader2, AlertTriangle, ArrowDownCircle, ArrowUpCircle, Plus, RotateCcw } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { formatoMoneda, formatFecha, formatTasa } from '@/lib/format';
import type {
  Caja,
  AlertaCaja,
  MovimientoCaja,
  IngresoCajaMadreRespuesta,
  AperturaCajaRespuesta,
} from '@/lib/types';
import { PageHeader, PageContent } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { toast } from 'sonner';

export default function CajasPage() {
  const { data: cajas, cargando, error, recargar } = useApi<Caja[]>(() => api.listarCajas(), []);
  const { data: alertas, recargar: recargarAlertas } = useApi<AlertaCaja[]>(
    () => api.alertasCaja(),
    [],
  );

  const madre = cajas?.find((c) => c.esMadre);
  const corredores = cajas?.filter((c) => !c.esMadre) ?? [];

  return (
    <>
      <PageHeader
        titulo="Cajas"
        descripcion="Tesorería: la caja madre de USDT y una caja por corredor. Los saldos cuadran con la suma de movimientos (db:verify)."
      />

      <PageContent className="flex flex-col gap-6">
        {cargando && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-tav-ink-3" />
          </div>
        )}

        {error && (
          <div>
            <p className="text-tav-error">{error}</p>
            <Button onClick={recargar} variant="outline" className="mt-4">Reintentar</Button>
          </div>
        )}

        {!cargando && cajas && (
          <>
            {/* Caja madre */}
            {madre && (
              <CajaMadreCard caja={madre} onCambio={recargar} />
            )}

            {/* Avisos */}
            {alertas && alertas.length > 0 && (
              <div className="flex flex-col gap-2">
                {alertas.map((a) => (
                  <AlertaBanner key={`${a.cajaId}-${a.tipo}`} alerta={a} />
                ))}
              </div>
            )}

            {/* Cajas de corredor */}
            <div className="overflow-hidden rounded-lg border border-tav-line bg-tav-surface shadow-tav">
              <div className="border-b border-tav-line bg-[#FAFBFC] px-4 py-3">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.07em] text-tav-ink-3">
                  Cajas de corredor · {corredores.length}
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 lg:grid-cols-3">
                {corredores.map((c) => (
                  <CajaCorredorCard
                    key={c.id}
                    caja={c}
                    alerta={alertas?.find((a) => a.cajaId === c.id)}
                    madreId={madre?.id}
                    onCambio={recargar}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </PageContent>
    </>
  );
}

// ─────────────────────────── Caja madre ───────────────────────────

function CajaMadreCard({ caja, onCambio }: { caja: Caja; onCambio: () => void }) {
  const [abierta, setAbierta] = React.useState(false);
  const [monto, setMonto] = React.useState('');
  const [motivo, setMotivo] = React.useState('');
  const [enviando, setEnviando] = React.useState(false);

  async function registrar() {
    const cents = monto.replace(/[.,\s]/g, '');
    if (!cents || !motivo.trim()) {
      toast.error('Faltan el monto o el motivo');
      return;
    }
    setEnviando(true);
    try {
      await api.ingresarCajaMadre({
        clientUuid: crypto.randomUUID(),
        cajaMadreId: caja.id,
        montoCents: cents,
        motivo: motivo.trim(),
      });
      toast.success('Ingreso registrado', { description: `${formatoMoneda(cents, 'USDT')} a la caja madre` });
      setAbierta(false);
      setMonto('');
      setMotivo('');
      onCambio();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo registrar el ingreso');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card className="border-2 border-tav-navy/30 bg-tav-navy/5">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            Caja madre · USDT
            <Badge variant="navy">Global</Badge>
          </span>
          <span className="font-mono text-[20px] tabular-nums text-tav-navy">
            {formatoMoneda(caja.saldoCents, caja.moneda)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Button onClick={() => setAbierta(true)} variant="default" className="h-10">
          <Plus className="mr-1.5 h-4 w-4" /> Registrar ingreso
        </Button>

        <Dialog open={abierta} onOpenChange={setAbierta}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ingreso a la caja madre</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="monto-madre">Monto (USDT, centavos)</Label>
                <Input
                  id="monto-madre"
                  inputMode="numeric"
                  placeholder="1000000 (10.000 USDT)"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  className="font-mono tabular-nums"
                />
                <span className="text-[12px] text-tav-ink-3">
                  En centavos: 10.000 USDT = 1.000.000
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="motivo-madre">Motivo (obligatorio)</Label>
                <Input
                  id="motivo-madre"
                  placeholder="Recarga de capital, venta del día…"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setAbierta(false)}>Cancelar</Button>
              <Button onClick={registrar} disabled={enviando}>
                {enviando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Registrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────── Aviso ───────────────────────────

function AlertaBanner({ alerta }: { alerta: AlertaCaja }) {
  const esNegativo = alerta.tipo === 'saldo_negativo';
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border-2 px-4 py-3 ${
        esNegativo
          ? 'border-tav-red/40 bg-tav-red/5 text-tav-red-700'
          : 'border-tav-gold/40 bg-tav-gold/5 text-tav-gold-700'
      }`}
    >
      <AlertTriangle className="h-5 w-5 shrink-0" />
      <div className="flex flex-col">
        <span className="text-[13px] font-bold">
          {esNegativo ? 'Saldo negativo — se pagó plata que no había' : 'Saldo bajo — prepara la recarga'}
        </span>
        <span className="text-[12px] opacity-90">
          {alerta.corredorDescripcion} · {formatoMoneda(alerta.saldoCents, alerta.moneda)}
          {alerta.umbralAlertaCents && !esNegativo && (
            <> · umbral: {formatoMoneda(alerta.umbralAlertaCents, alerta.moneda)}</>
          )}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────── Caja de corredor ───────────────────────────

function CajaCorredorCard({
  caja,
  alerta,
  madreId,
  onCambio,
}: {
  caja: Caja;
  alerta?: AlertaCaja;
  madreId?: string;
  onCambio: () => void;
}) {
  const [abierta, setAbierta] = React.useState(false);
  const [verMovs, setVerMovs] = React.useState(false);

  return (
    <Card className={`flex flex-col gap-0 p-4 ${
      alerta?.tipo === 'saldo_negativo'
        ? 'border-2 border-tav-red/40'
        : alerta?.tipo === 'saldo_bajo'
          ? 'border-2 border-tav-gold/40'
          : 'border border-tav-line'
    }`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[13px] font-bold text-tav-ink">{caja.moneda}</div>
          <div className="text-[11px] text-tav-ink-3">{caja.id.slice(0, 8)}</div>
        </div>
        {alerta && (
          <Badge variant={alerta.tipo === 'saldo_negativo' ? 'rojo' : 'ambar'}>
            {alerta.tipo === 'saldo_negativo' ? 'Negativo' : 'Bajo'}
          </Badge>
        )}
      </div>

      <div className="mt-3 font-mono text-[22px] font-bold tabular-nums">
        {formatoMoneda(caja.saldoCents, caja.moneda)}
      </div>

      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="default"
          className="h-8"
          onClick={() => setAbierta(true)}
          disabled={!madreId}
        >
          <ArrowUpCircle className="mr-1 h-3.5 w-3.5" />
          {caja.saldoCents === '0' ? 'Abrir' : 'Recargar'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => setVerMovs(true)}
        >
          Movimientos
        </Button>
      </div>

      {madreId && (
        <AbrirRecargarDialog
          abierta={abierta}
          setAbierta={setAbierta}
          caja={caja}
          madreId={madreId}
          esApertura={caja.saldoCents === '0'}
          onCambio={onCambio}
        />
      )}

      <MovimientosDialog
        abierta={verMovs}
        setAbierta={setVerMovs}
        caja={caja}
      />
    </Card>
  );
}

// ─────────────────────────── Diálogo abrir/recargar ───────────────────────────

function AbrirRecargarDialog({
  abierta,
  setAbierta,
  caja,
  madreId,
  esApertura,
  onCambio,
}: {
  abierta: boolean;
  setAbierta: (v: boolean) => void;
  caja: Caja;
  madreId: string;
  esApertura: boolean;
  onCambio: () => void;
}) {
  const [montoMadre, setMontoMadre] = React.useState('');
  const [montoDestino, setMontoDestino] = React.useState('');
  const [tasa, setTasa] = React.useState('');
  const [enviando, setEnviando] = React.useState(false);

  async function ejecutar() {
    const mm = montoMadre.replace(/[.,\s]/g, '');
    const md = montoDestino.replace(/[.,\s]/g, '');
    if (!mm || !md || !tasa.trim()) {
      toast.error('Faltan valores');
      return;
    }
    setEnviando(true);
    try {
      const payload = {
        clientUuid: crypto.randomUUID(),
        cajaId: caja.id,
        cajaMadreId: madreId,
        montoMadreCents: mm,
        montoDestinoCents: md,
        tasaConversion: tasa.trim().replace(',', '.'),
      };
      const res: AperturaCajaRespuesta = esApertura
        ? await api.abrirCaja(payload)
        : await api.recargarCaja(payload);
      toast.success(esApertura ? 'Caja abierta' : 'Caja recargada', {
        description: `Madre: ${formatoMoneda(res.cajaMadre.saldoCents, 'USDT')} · ${caja.moneda}: ${formatoMoneda(res.cajaDestino.saldoCents, caja.moneda)}`,
      });
      setAbierta(false);
      setMontoMadre('');
      setMontoDestino('');
      setTasa('');
      onCambio();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'No se pudo abrir/recargar';
      // El DTO valida coherencia aritmética y devuelve 400 con mensaje legible.
      toast.error(msg);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={abierta} onOpenChange={setAbierta}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{esApertura ? 'Abrir' : 'Recargar'} caja · {caja.moneda}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mm">USDT que sale de la madre (centavos)</Label>
            <Input
              id="mm"
              inputMode="numeric"
              placeholder="100000 (1.000 USDT)"
              value={montoMadre}
              onChange={(e) => setMontoMadre(e.target.value)}
              className="font-mono tabular-nums"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="md">Entra en la caja destino (centavos de {caja.moneda})</Label>
            <Input
              id="md"
              inputMode="numeric"
              placeholder="28540000 (285.400 Bs)"
              value={montoDestino}
              onChange={(e) => setMontoDestino(e.target.value)}
              className="font-mono tabular-nums"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tasa">Tasa de conversión (1 USDT = X {caja.moneda})</Label>
            <Input
              id="tasa"
              inputMode="decimal"
              placeholder="285.4"
              value={tasa}
              onChange={(e) => setTasa(e.target.value)}
              className="font-mono tabular-nums"
            />
            <span className="text-[12px] text-tav-ink-3">
              Los tres números deben cuadrar: montoDestino ≈ montoMadre × tasa
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setAbierta(false)}>Cancelar</Button>
          <Button onClick={ejecutar} disabled={enviando}>
            {enviando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {esApertura ? 'Abrir' : 'Recargar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────── Diálogo movimientos ───────────────────────────

function MovimientosDialog({
  abierta,
  setAbierta,
  caja,
}: {
  abierta: boolean;
  setAbierta: (v: boolean) => void;
  caja: Caja;
}) {
  const [movs, setMovs] = React.useState<MovimientoCaja[]>([]);
  const [cargando, setCargando] = React.useState(false);

  React.useEffect(() => {
    if (!abierta) return;
    setCargando(true);
    api.movimientosCaja(caja.id, 1, 50)
      .then((r) => setMovs(r.items))
      .catch(() => setMovs([]))
      .finally(() => setCargando(false));
  }, [abierta, caja.id]);

  return (
    <Dialog open={abierta} onOpenChange={setAbierta}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Movimientos · {caja.moneda}</DialogTitle>
        </DialogHeader>
        {cargando ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-tav-ink-3" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-tav-ink-3 py-6">
                    Sin movimientos
                  </TableCell>
                </TableRow>
              )}
              {movs.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <Badge variant="outline">{m.tipo}</Badge>
                  </TableCell>
                  <TableCell className={`text-right font-mono tabular-nums ${
                    BigInt(m.montoCents) < 0n ? 'text-tav-red-700' : 'text-tav-green-600'
                  }`}>
                    {formatoMoneda(m.montoCents, caja.moneda)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatoMoneda(m.saldoDespues, caja.moneda)}
                  </TableCell>
                  <TableCell className="text-[12px] text-tav-ink-3">
                    {m.motivo ?? '—'}
                  </TableCell>
                  <TableCell className="text-[12px] text-tav-ink-3">
                    {formatFecha(m.creadoAt, true)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
