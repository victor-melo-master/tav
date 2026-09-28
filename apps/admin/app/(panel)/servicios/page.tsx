'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Power, PowerOff, RefreshCw } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import type { Caja, Corredor } from '@/lib/types';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

type ModoCaja = 'existente' | 'nueva';

export default function ServiciosPage() {
  const router = useRouter();
  const { data: servicios, cargando, error, recargar } = useApi<Corredor[]>(() => api.listarCorredores(), []);
  const { data: cajas, recargar: recargarCajas } = useApi<Caja[]>(() => api.listarCajas(), []);

  const [dialogoAbierto, setDialogoAbierto] = React.useState(false);
  const [guardando, setGuardando] = React.useState(false);

  const [modoCaja, setModoCaja] = React.useState<ModoCaja>('existente');
  const [cajaId, setCajaId] = React.useState('');
  const [nombreCaja, setNombreCaja] = React.useState('');
  const [monedaCaja, setMonedaCaja] = React.useState('');
  const [paisCaja, setPaisCaja] = React.useState('');

  const [pais, setPais] = React.useState('');
  const [paisNombre, setPaisNombre] = React.useState('');
  const [moneda, setMoneda] = React.useState('');
  const [monedaNombre, setMonedaNombre] = React.useState('');
  const [formaEntrega, setFormaEntrega] = React.useState('');
  const [formaEntregaNombre, setFormaEntregaNombre] = React.useState('');
  const [servicio, setServicio] = React.useState('');
  const [servicioNombre, setServicioNombre] = React.useState('');

  const cajasFisicas = React.useMemo(() => (cajas ?? []).filter((c) => !c.esMadre), [cajas]);

  const activos = React.useMemo(() => (servicios ?? []).filter((s) => s.activo), [servicios]);
  const inactivos = React.useMemo(() => (servicios ?? []).filter((s) => !s.activo), [servicios]);

  function resetFormulario() {
    setModoCaja('existente');
    setCajaId('');
    setNombreCaja('');
    setMonedaCaja('');
    setPaisCaja('');
    setPais('');
    setPaisNombre('');
    setMoneda('');
    setMonedaNombre('');
    setFormaEntrega('');
    setFormaEntregaNombre('');
    setServicio('');
    setServicioNombre('');
  }

  function abrirDialogo() {
    resetFormulario();
    setDialogoAbierto(true);
  }

  async function crearCajaSiHaceFalta(): Promise<string> {
    if (modoCaja === 'existente') {
      if (!cajaId) throw new Error('Elige una caja existente');
      return cajaId;
    }
    if (!nombreCaja.trim() || !monedaCaja.trim()) {
      throw new Error('La nueva caja necesita nombre y moneda');
    }
    const caja = await api.crearCaja({
      nombre: nombreCaja.trim(),
      moneda: monedaCaja.trim(),
      pais: paisCaja.trim() || undefined,
    });
    await recargarCajas();
    return caja.id;
  }

  async function guardar() {
    if (
      !pais.trim() ||
      !paisNombre.trim() ||
      !moneda.trim() ||
      !monedaNombre.trim() ||
      !formaEntrega.trim() ||
      !formaEntregaNombre.trim() ||
      !servicio.trim() ||
      !servicioNombre.trim()
    ) {
      toast.error('Completa todos los campos del servicio');
      return;
    }

    setGuardando(true);
    try {
      const cajaElegidaId = await crearCajaSiHaceFalta();
      await api.crearCorredor({
        pais: pais.trim(),
        paisNombre: paisNombre.trim(),
        moneda: moneda.trim(),
        monedaNombre: monedaNombre.trim(),
        formaEntrega: formaEntrega.trim(),
        formaEntregaNombre: formaEntregaNombre.trim(),
        servicio: servicio.trim(),
        servicioNombre: servicioNombre.trim(),
        cajaId: cajaElegidaId,
      });
      toast.success('Servicio creado', {
        description: `${paisNombre} · ${servicioNombre}`,
      });
      setDialogoAbierto(false);
      resetFormulario();
      await recargar();

      // Un servicio recién creado no lo ve ningún cajero hasta que tenga precio.
      // Llevamos directo a la lista de cajeros para fijar precios.
      toast('Ahora fíjale precio a cada cajero', {
        description: 'El servicio no aparecerá en la app hasta entonces.',
      });
      router.push('/cajeros');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo crear el servicio');
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActivo(s: Corredor) {
    try {
      if (s.activo) {
        await api.desactivarCorredor(s.id);
        toast.success('Servicio desactivado');
      } else {
        await api.activarCorredor(s.id);
        toast.success('Servicio activado');
      }
      await recargar();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo cambiar el estado');
    }
  }

  return (
    <>
      <PageHeader
        titulo="Servicios"
        descripcion="Países, monedas y formas de entrega que ven los cajeros. Un servicio nuevo no aparece en la app hasta que tenga precio asignado."
        acciones={
          <Button onClick={abrirDialogo}>
            <Plus className="mr-1.5 h-4 w-4" /> Nuevo servicio
          </Button>
        }
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
            <Button onClick={recargar} variant="outline" className="mt-4">
              <RefreshCw className="mr-1.5 h-4 w-4" /> Reintentar
            </Button>
          </div>
        )}

        {!cargando && servicios && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-[13px] font-bold uppercase tracking-[0.07em] text-tav-ink-3">
                  Activos · {activos.length}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {activos.length === 0 ? (
                  <p className="py-6 text-center text-sm text-tav-ink-3">No hay servicios activos</p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {activos.map((s) => (
                      <ServicioCard key={s.id} servicio={s} onToggle={() => toggleActivo(s)} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {inactivos.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-[13px] font-bold uppercase tracking-[0.07em] text-tav-ink-3">
                    Inactivos · {inactivos.length}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 opacity-70">
                    {inactivos.map((s) => (
                      <ServicioCard key={s.id} servicio={s} onToggle={() => toggleActivo(s)} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </PageContent>

      <Dialog open={dialogoAbierto} onOpenChange={setDialogoAbierto}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crear servicio</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-5 py-2">
            <section className="flex flex-col gap-3 rounded-lg border border-tav-line bg-tav-bg p-4">
              <h3 className="text-[13px] font-semibold text-tav-ink">Caja de la que descuenta</h3>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={modoCaja === 'existente' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setModoCaja('existente')}
                >
                  Existente
                </Button>
                <Button
                  type="button"
                  variant={modoCaja === 'nueva' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setModoCaja('nueva')}
                >
                  Nueva
                </Button>
              </div>

              {modoCaja === 'existente' ? (
                <div className="flex flex-col gap-1.5">
                  <Label>Elige una caja física</Label>
                  <Select value={cajaId} onValueChange={setCajaId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar caja..." />
                    </SelectTrigger>
                    <SelectContent>
                      {cajasFisicas.length === 0 && (
                        <SelectItem value="_vacío" disabled>
                          No hay cajas físicas
                        </SelectItem>
                      )}
                      {cajasFisicas.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nombre} · {c.moneda}{c.pais ? ` · ${c.pais}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <Label htmlFor="nombre-caja">Nombre de la caja</Label>
                    <Input
                      id="nombre-caja"
                      value={nombreCaja}
                      onChange={(e) => setNombreCaja(e.target.value)}
                      placeholder="Ej: Soles Perú"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="moneda-caja">Moneda (código)</Label>
                    <Input
                      id="moneda-caja"
                      value={monedaCaja}
                      onChange={(e) => setMonedaCaja(e.target.value.toUpperCase())}
                      placeholder="PEN"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 md:col-span-3">
                    <Label htmlFor="pais-caja">País (opcional, código)</Label>
                    <Input
                      id="pais-caja"
                      value={paisCaja}
                      onChange={(e) => setPaisCaja(e.target.value.toUpperCase())}
                      placeholder="PER"
                    />
                  </div>
                </div>
              )}
            </section>

            <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pais">Código país</Label>
                <Input
                  id="pais"
                  value={pais}
                  onChange={(e) => setPais(e.target.value.toUpperCase())}
                  placeholder="PER"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="paisNombre">Nombre del país</Label>
                <Input
                  id="paisNombre"
                  value={paisNombre}
                  onChange={(e) => setPaisNombre(e.target.value)}
                  placeholder="Perú"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="moneda">Código moneda</Label>
                <Input
                  id="moneda"
                  value={moneda}
                  onChange={(e) => setMoneda(e.target.value.toUpperCase())}
                  placeholder="PEN"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="monedaNombre">Nombre de la moneda</Label>
                <Input
                  id="monedaNombre"
                  value={monedaNombre}
                  onChange={(e) => setMonedaNombre(e.target.value)}
                  placeholder="Soles"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="formaEntrega">Código forma de entrega</Label>
                <Input
                  id="formaEntrega"
                  value={formaEntrega}
                  onChange={(e) => setFormaEntrega(e.target.value)}
                  placeholder="transferencia"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="formaEntregaNombre">Nombre visible</Label>
                <Input
                  id="formaEntregaNombre"
                  value={formaEntregaNombre}
                  onChange={(e) => setFormaEntregaNombre(e.target.value)}
                  placeholder="Transferencia"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="servicio">Código interno del servicio</Label>
                <Input
                  id="servicio"
                  value={servicio}
                  onChange={(e) => setServicio(e.target.value)}
                  placeholder="bcp / yape / interbank"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="servicioNombre">Nombre visible del servicio</Label>
                <Input
                  id="servicioNombre"
                  value={servicioNombre}
                  onChange={(e) => setServicioNombre(e.target.value)}
                  placeholder="BCP"
                />
              </div>
            </section>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogoAbierto(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando}>
              {guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Crear servicio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ServicioCard({
  servicio,
  onToggle,
}: {
  servicio: Corredor;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-tav-line bg-tav-surface p-4 shadow-tav">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[14px] font-semibold text-tav-ink">
            {servicio.monedaNombre} · {servicio.servicioNombre}
          </div>
          <div className="text-[12px] text-tav-ink-3">
            {servicio.paisNombre} · {servicio.formaEntregaNombre}
          </div>
        </div>
        <Badge variant={servicio.activo ? 'verde' : 'outline'}>
          {servicio.activo ? 'Activo' : 'Inactivo'}
        </Badge>
      </div>

      <div className="text-[12px] text-tav-ink-3">
        Caja: {servicio.caja?.nombre ?? '—'} · {servicio.caja?.moneda ?? servicio.moneda}
      </div>

      <Button
        variant={servicio.activo ? 'outline' : 'default'}
        size="sm"
        className="h-8"
        onClick={onToggle}
      >
        {servicio.activo ? (
          <>
            <PowerOff className="mr-1.5 h-3.5 w-3.5" /> Desactivar
          </>
        ) : (
          <>
            <Power className="mr-1.5 h-3.5 w-3.5" /> Activar
          </>
        )}
      </Button>
    </div>
  );
}
