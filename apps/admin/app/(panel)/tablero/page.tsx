'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  Wallet,
  Users,
  Clock,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { gyd } from '@/lib/format';
import type { Resumen } from '@/lib/types';
import { PageHeader, PageContent } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CargandoPagina, ErrorTabla } from '@/components/estados';
import { cn } from '@/lib/utils';

export default function TableroPage() {
  const { data, cargando, error, recargar } = useApi<Resumen>(() => api.resumen(), []);

  if (cargando) return <CargandoPagina label="Cargando tablero…" />;
  if (error)
    return (
      <>
        <PageHeader titulo="Tablero" />
        <PageContent>
          <ErrorTabla mensaje={error} onReintentar={recargar} />
        </PageContent>
      </>
    );
  if (!data) return null;

  const totalCajeros = data.repartoSemaforo.verde + data.repartoSemaforo.ambar + data.repartoSemaforo.rojo;

  return (
    <>
      <PageHeader
        titulo="Tablero"
        descripcion="Totales del día y del mes, cartera pendiente y lo que necesita atención ahora mismo."
        acciones={
          <Button variant="outline" size="sm" onClick={recargar}>
            <RefreshCw className="h-4 w-4" /> Actualizar
          </Button>
        }
      />

      <PageContent className="flex flex-col gap-6">
        {/* Alertas que saltan a la vista */}
        {(data.cierresEsperandoVerificacion > 0 ||
          data.ampliacionesPendientes > 0 ||
          data.cajerosSinConectarse > 0) && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {data.cierresEsperandoVerificacion > 0 && (
              <Link
                href="/cierres"
                className="group flex items-center justify-between rounded-lg border border-tav-gold/40 bg-tav-gold-50 p-4 transition-colors hover:bg-tav-gold-50/70"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-tav-gold/20 text-tav-gold-700">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-tav-gold-700">
                      {data.cierresEsperandoVerificacion} cierre{data.cierresEsperandoVerificacion === 1 ? '' : 's'} esperando
                    </div>
                    <div className="text-[12px] text-tav-gold-700/80">Verificación pendiente</div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-tav-gold-700/60 transition-transform group-hover:translate-x-0.5" />
              </Link>
            )}
            {data.ampliacionesPendientes > 0 && (
              <Link
                href="/ampliaciones"
                className="group flex items-center justify-between rounded-lg border border-tav-blue/30 bg-tav-blue-50 p-4 transition-colors hover:bg-tav-blue-50/70"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-tav-blue/15 text-tav-blue-600">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-tav-blue-600">
                      {data.ampliacionesPendientes} ampliación{data.ampliacionesPendientes === 1 ? '' : 'es'} pendiente{data.ampliacionesPendientes === 1 ? '' : 's'}
                    </div>
                    <div className="text-[12px] text-tav-blue-600/80">Esperando decisión</div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-tav-blue-600/60 transition-transform group-hover:translate-x-0.5" />
              </Link>
            )}
            {data.cajerosSinConectarse > 0 && (
              <Link
                href="/cajeros"
                className="group flex items-center justify-between rounded-lg border border-tav-red/30 bg-tav-red-50 p-4 transition-colors hover:bg-tav-red-50/70"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-tav-red/15 text-tav-red-700">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-tav-red-700">
                      {data.cajerosSinConectarse} cajero{data.cajerosSinConectarse === 1 ? '' : 's'} sin conectarse
                    </div>
                    <div className="text-[12px] text-tav-red-700/80">Hace más de 3 días</div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-tav-red-700/60 transition-transform group-hover:translate-x-0.5" />
              </Link>
            )}
          </div>
        )}

        {/* Totales del día y del mes */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.07em] text-tav-ink-3">
                <TrendingUp className="h-4 w-4" /> Hoy
              </div>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[12px] text-tav-ink-3">Cobrado</div>
                  <div className="mt-0.5 text-[24px] font-bold tabular-nums text-tav-ink">
                    {gyd(data.hoy.cobradoCents)}
                  </div>
                </div>
                <div>
                  <div className="text-[12px] text-tav-ink-3">Operaciones</div>
                  <div className="mt-0.5 text-[24px] font-bold tabular-nums text-tav-ink">
                    {data.hoy.operaciones}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.07em] text-tav-ink-3">
                <TrendingUp className="h-4 w-4" /> Este mes
              </div>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[12px] text-tav-ink-3">Cobrado</div>
                  <div className="mt-0.5 text-[24px] font-bold tabular-nums text-tav-ink">
                    {gyd(data.mes.cobradoCents)}
                  </div>
                </div>
                <div>
                  <div className="text-[12px] text-tav-ink-3">Operaciones</div>
                  <div className="mt-0.5 text-[24px] font-bold tabular-nums text-tav-ink">
                    {data.mes.operaciones}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Cartera + reparto por semáforo */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Cartera — superficie navy como las de dinero del design system */}
          <div
            className="rounded-lg p-5 text-white shadow-tav"
            style={{ background: 'linear-gradient(155deg, #0B1B33, #1B4272)' }}
          >
            <div className="flex items-center gap-2 text-[12px] text-[#9EC0EC]">
              <Wallet className="h-4 w-4" /> Cartera pendiente
            </div>
            <div className="mt-2 text-[30px] font-bold tabular-nums">
              {gyd(data.carteraPendienteCents)}
            </div>
            <div className="mt-1 text-[12px] text-[#9EC0EC]">Total adeudado por cajeros</div>
          </div>

          {/* Reparto por semáforo */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.07em] text-tav-ink-3">
                <Users className="h-4 w-4" /> Cajeros por semáforo
              </div>
              <div className="mt-4 flex flex-col gap-3">
                <RepartoFila
                  dot="bg-tav-green"
                  label="Al día"
                  cuenta={data.repartoSemaforo.verde}
                  total={totalCajeros}
                />
                <RepartoFila
                  dot="bg-tav-gold"
                  label="Por vencer"
                  cuenta={data.repartoSemaforo.ambar}
                  total={totalCajeros}
                />
                <RepartoFila
                  dot="bg-tav-red"
                  label="Vencida"
                  cuenta={data.repartoSemaforo.rojo}
                  total={totalCajeros}
                />
                <div className="mt-1 border-t border-tav-line pt-2 text-[12px] text-tav-ink-3">
                  Total: <b className="text-tav-ink-2">{totalCajeros}</b> cajeros
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </PageContent>
    </>
  );
}

function RepartoFila({
  dot,
  label,
  cuenta,
  total,
}: {
  dot: string;
  label: string;
  cuenta: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((cuenta / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-[13px]">
        <span className="flex items-center gap-2 text-tav-ink-2">
          <span className={cn('inline-block h-2.5 w-2.5 rounded-full', dot)} />
          {label}
        </span>
        <span className="tabular-nums font-semibold text-tav-ink">
          {cuenta} <span className="text-tav-ink-4">· {pct}%</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-tav-line-2">
        <div className={cn('h-full rounded-full', dot)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
