'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  ClipboardCheck,
  Users,
  CreditCard,
  TrendingUp,
  UserPlus,
  Wallet,
  LogOut,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV: { grupo: string; items: NavItem[] }[] = [
  {
    grupo: 'Operación',
    items: [
      { href: '/cierres', label: 'Verificación de cierres', icon: ClipboardCheck },
      { href: '/cajeros', label: 'Cajeros', icon: Users },
      { href: '/ampliaciones', label: 'Ampliaciones de cupo', icon: CreditCard },
      { href: '/tablero', label: 'Tablero', icon: LayoutDashboard },
    ],
  },
  {
    grupo: 'Gestión',
    items: [
      { href: '/tasas', label: 'Tasas', icon: TrendingUp },
      { href: '/usuarios', label: 'Usuarios', icon: UserPlus },
      { href: '/cobros', label: 'Registrar pago', icon: Wallet },
    ],
  },
];

export function PanelShell({ children }: { children: React.ReactNode }) {
  const { usuario, cargando, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // Guard: si no hay sesión (y ya terminó la carga inicial), al login.
  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-tav-ink-3">
        <Loader2 className="h-5 w-5 animate-spin" /> Cargando panel…
      </div>
    );
  }
  if (!usuario) {
    // El AuthProvider ya redirige; esto evita renderizar el panel sin sesión.
    if (typeof window !== 'undefined') router.replace('/login');
    return null;
  }

  return (
    <div className="flex min-h-screen bg-tav-bg">
      {/* Sidebar navy — 246px, sticky, del design system */}
      <aside className="sticky top-0 flex h-screen w-[246px] flex-shrink-0 flex-col bg-tav-navy px-4 py-6 text-white">
        <Link href="/tablero" className="mb-6 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-tav-blue text-[13px] font-bold tracking-wider">
            TAV
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold">Admin</div>
            <div className="font-mono text-[10px] tracking-wider text-[#6B84A3]">CAMBIO · v1</div>
          </div>
        </Link>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto scrollbar-thin">
          {NAV.map((sec) => (
            <div key={sec.grupo} className="mb-2">
              <div className="mb-1 px-2.5 font-mono text-[9.5px] uppercase tracking-[0.15em] text-[#5F7897]">
                {sec.grupo}
              </div>
              {sec.items.map((item) => {
                const activo =
                  pathname === item.href || pathname.startsWith(item.href + '/');
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors',
                      activo
                        ? 'bg-tav-blue font-semibold text-white'
                        : 'text-[#AFC4DA] hover:bg-white/[0.07] hover:text-white',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Usuario + logout abajo */}
        <div className="mt-auto border-t border-white/10 pt-3">
          <div className="mb-2 px-1">
            <div className="truncate text-[13px] font-semibold">{usuario.nombre}</div>
            <div className="truncate font-mono text-[11px] text-[#6B84A3]">{usuario.telefono}</div>
          </div>
          <button
            onClick={() => logout()}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-[#AFC4DA] transition-colors hover:bg-white/[0.07] hover:text-white"
          >
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Contenido principal */}
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
