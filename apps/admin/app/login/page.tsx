'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function LoginPage() {
  const { usuario, login, cargando } = useAuth();
  const router = useRouter();
  const [telefono, setTelefono] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [enviando, setEnviando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Si ya hay sesión, manda al tablero.
  React.useEffect(() => {
    if (!cargando && usuario) router.replace('/tablero');
  }, [usuario, cargando, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await login(telefono.trim(), password);
      toast.success('Sesión iniciada');
      router.replace('/tablero');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'No se pudo iniciar sesión';
      setError(msg);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-tav-bg px-4">
      <div className="w-full max-w-sm">
        {/* Marca */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-tav-blue text-lg font-bold tracking-wider text-white">
            TAV
          </div>
          <div className="text-center">
            <h1 className="text-[22px] font-semibold tracking-tight text-tav-ink">Panel de administración</h1>
            <p className="mt-1 text-sm text-tav-ink-3">Casa de cambio · libro de cuentas</p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-lg border border-tav-line bg-tav-surface p-6 shadow-tav"
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="telefono">Teléfono</Label>
              <Input
                id="telefono"
                type="tel"
                autoComplete="username"
                placeholder="+58 412-0000001"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <p className="rounded-md bg-tav-red-50 px-3 py-2 text-[13px] font-medium text-tav-red-700">
                {error}
              </p>
            )}

            <Button type="submit" disabled={enviando || cargando} className="mt-1 h-11">
              {enviando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Entrando…
                </>
              ) : (
                'Entrar'
              )}
            </Button>
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-tav-ink-4">
          Las cuentas las crea el administrador. Si no puedes entrar, contacta al responsable.
        </p>
      </div>
    </div>
  );
}
