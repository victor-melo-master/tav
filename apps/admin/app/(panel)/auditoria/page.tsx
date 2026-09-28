'use client';

import * as React from 'react';
import { RefreshCw, ChevronLeft, ChevronRight, ScrollText } from 'lucide-react';
import { api } from '@/lib/api';
import { formatFecha } from '@/lib/format';
import type { AuditLogItem, PaginaAuditoria } from '@/lib/types';
import { PageHeader, PageContent } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

const ACCIONES = [
  'usuario.crear',
  'usuario.editar',
  'usuario.activar',
  'usuario.suspender',
  'usuario.cambiar_contrasena',
  'cajero.cambiar_limite',
  'ampliacion.aprobada',
  'ampliacion.rechazada',
  'cierre.verificar',
  'cobro.admin.registrar',
  'precio_cajero.fijar',
  'caja.crear',
  'caja.ingreso_madre',
  'caja.apertura',
  'caja.recarga',
  'caja.retiro',
  'caja.deposito',
  'caja.anular_apertura',
  'corredor.crear',
  'corredor.editar',
  'corredor.activar',
  'corredor.desactivar',
];

const ENTIDADES = [
  'Usuario',
  'PerfilCajero',
  'AmpliacionCredito',
  'Cierre',
  'Cobro',
  'PrecioCajeroServicio',
  'Caja',
  'MovimientoCaja',
  'Corredor',
];

const LIMIT = 50;

function JsonMini({ titulo, datos }: { titulo: string; datos: Record<string, unknown> | null }) {
  if (!datos || Object.keys(datos).length === 0) return null;
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.07em] text-tav-ink-3">
        {titulo}
      </div>
      <pre className="mt-0.5 overflow-x-auto whitespace-pre-wrap text-[11px] text-tav-ink-2">
        {JSON.stringify(datos, null, 2)}
      </pre>
    </div>
  );
}

function FilaLog({ item }: { item: AuditLogItem }) {
  return (
    <>
      <TableRow>
        <TableCell className="whitespace-nowrap font-mono text-[12px] tabular-nums text-tav-ink-2">
          {formatFecha(item.creadoAt, true)}
        </TableCell>
        <TableCell>
          <div className="text-[13px] font-medium text-tav-ink">
            {item.actor?.nombre ?? '—'}
          </div>
          <div className="text-[11px] text-tav-ink-3">{item.actor?.email ?? ''}</div>
        </TableCell>
        <TableCell className="font-mono text-[12px]">{item.accion}</TableCell>
        <TableCell>
          <div className="text-[13px]">{item.entidad}</div>
          <div className="max-w-[180px] truncate font-mono text-[11px] text-tav-ink-3" title={item.entidadId}>
            {item.entidadId.slice(0, 8)}…
          </div>
        </TableCell>
        <TableCell className="text-[12px]">
          <details className="cursor-pointer">
            <summary className="text-tav-green-600 hover:underline">ver cambios</summary>
            <div className="mt-2 flex flex-col gap-2 rounded-md bg-tav-bg p-2">
              <JsonMini titulo="Antes" datos={item.antes} />
              <JsonMini titulo="Después" datos={item.despues} />
            </div>
          </details>
        </TableCell>
      </TableRow>
    </>
  );
}

export default function AuditoriaPage() {
  const [accion, setAccion] = React.useState<string>('');
  const [entidad, setEntidad] = React.useState<string>('');
  const [fechaDesde, setFechaDesde] = React.useState('');
  const [fechaHasta, setFechaHasta] = React.useState('');
  const [page, setPage] = React.useState(1);

  const [data, setData] = React.useState<PaginaAuditoria | null>(null);
  const [cargando, setCargando] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const cargar = React.useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await api.listarAuditoria({
        accion: accion || undefined,
        entidad: entidad || undefined,
        fechaDesde: fechaDesde || undefined,
        fechaHasta: fechaHasta || undefined,
        page,
        limit: LIMIT,
      });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando la auditoría');
    } finally {
      setCargando(false);
    }
  }, [accion, entidad, fechaDesde, fechaHasta, page]);

  React.useEffect(() => {
    void cargar();
  }, [cargar]);

  const totalPaginas = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  return (
    <>
      <PageHeader
        titulo="Auditoría"
        descripcion="Registro de todas las acciones administrativas. Solo inserción: nadie puede editar ni borrar estos registros."
        acciones={
          <Button variant="outline" size="sm" onClick={cargar}>
            <RefreshCw className="h-4 w-4" /> Actualizar
          </Button>
        }
      />

      <PageContent className="flex flex-col gap-6">
        <Card>
          <CardContent className="flex flex-wrap items-end gap-4 p-4">
            <div className="flex flex-col gap-1.5">
              <Label className="flex items-center gap-1.5">
                <ScrollText className="h-4 w-4" /> Acción
              </Label>
              <Select
                value={accion}
                onValueChange={(v) => {
                  setAccion(v === '__todas__' ? '' : v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todas__">Todas</SelectItem>
                  {ACCIONES.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Entidad</Label>
              <Select
                value={entidad}
                onValueChange={(v) => {
                  setEntidad(v === '__todas__' ? '' : v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todas__">Todas</SelectItem>
                  {ENTIDADES.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="desde">Desde</Label>
              <Input
                id="desde"
                type="date"
                value={fechaDesde}
                onChange={(e) => {
                  setFechaDesde(e.target.value);
                  setPage(1);
                }}
                className="w-40 font-mono tabular-nums"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hasta">Hasta</Label>
              <Input
                id="hasta"
                type="date"
                value={fechaHasta}
                onChange={(e) => {
                  setFechaHasta(e.target.value);
                  setPage(1);
                }}
                className="w-40 font-mono tabular-nums"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Entidad</TableHead>
                  <TableHead>Cambios</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cargando && (
                  <TableRow>
                    <TableCell colSpan={5} className="p-0">
                      <CargandoTabla />
                    </TableCell>
                  </TableRow>
                )}
                {!cargando && error && (
                  <TableRow>
                    <TableCell colSpan={5} className="p-0">
                      <ErrorTabla mensaje={error} onReintentar={cargar} />
                    </TableCell>
                  </TableRow>
                )}
                {!cargando && !error && (data?.items.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="p-0">
                      <VacioTabla mensaje="No hay registros con estos filtros." />
                    </TableCell>
                  </TableRow>
                )}
                {!cargando &&
                  !error &&
                  data?.items.map((item) => <FilaLog key={item.id} item={item} />)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {data && data.total > 0 && (
          <div className="flex items-center justify-between text-[13px] text-tav-ink-3">
            <span>
              {data.total} registro{data.total === 1 ? '' : 's'} — página {data.page} de {totalPaginas}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" /> Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPaginas}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </PageContent>
    </>
  );
}
