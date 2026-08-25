'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Cabecera de página del panel. Fondo blanco, borde inferior, padding amplio
 * (estilo .hd del design system). Título + descripción + acciones a la derecha.
 */
export function PageHeader({
  titulo,
  descripcion,
  acciones,
  className,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-end justify-between gap-4 border-b border-tav-line bg-tav-surface px-8 py-6',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight text-tav-ink">{titulo}</h1>
        {descripcion && (
          <p className="mt-1 max-w-[66ch] text-sm leading-relaxed text-tav-ink-3">{descripcion}</p>
        )}
      </div>
      {acciones && <div className="flex items-center gap-2">{acciones}</div>}
    </header>
  );
}

/** Contenedor de contenido con padding lateral, como .in del design system. */
export function PageContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-8 py-6', className)}>{children}</div>;
}
