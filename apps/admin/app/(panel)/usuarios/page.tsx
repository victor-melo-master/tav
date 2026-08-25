'use client';

import * as React from 'react';
import { Loader2, UserPlus, Check } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { parseUserAmountToCents } from '@/lib/format';
import { PageHeader, PageContent } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Rol = 'cajero' | 'cobrador';

export default function UsuariosPage() {
  const [rol, setRol] = React.useState<Rol>('cajero');
  const [form, setForm] = React.useState({
    nombre: '',
    telefono: '',
    password: '',
    documento: '',
    limite: '',
    zona: '',
    direccion: '',
    notas: '',
  });
  const [creando, setCreando] = React.useState(false);
  const [ultimo, setUltimo] = React.useState<{ nombre: string; telefono: string } | null>(null);

  function set(campo: keyof typeof form, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  const limiteCents = rol === 'cajero' ? parseUserAmountToCents(form.limite) : '0';
  const valido =
    form.nombre.trim() &&
    form.telefono.trim() &&
    form.password.trim().length >= 4 &&
    (rol === 'cobrador' || (limiteCents !== null && BigInt(limiteCents) > 0n));

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!valido) return;
    setCreando(true);
    try {
      await api.crearUsuario({
        nombre: form.nombre.trim(),
        telefono: form.telefono.trim(),
        rol,
        password: form.password,
        documento: form.documento.trim() || undefined,
        limiteCents: rol === 'cajero' ? limiteCents! : undefined,
        zona: form.zona.trim() || undefined,
        direccion: form.direccion.trim() || undefined,
        notas: form.notas.trim() || undefined,
      });
      toast.success(`${rol === 'cajero' ? 'Cajero' : 'Cobrador'} creado`, {
        description: `${form.nombre.trim()} · ${form.telefono.trim()}`,
      });
      setUltimo({ nombre: form.nombre.trim(), telefono: form.telefono.trim() });
      setForm({ nombre: '', telefono: '', password: '', documento: '', limite: '', zona: '', direccion: '', notas: '' });
    } catch (e2) {
      toast.error(e2 instanceof ApiError ? e2.message : 'No se pudo crear el usuario');
    } finally {
      setCreando(false);
    }
  }

  return (
    <>
      <PageHeader
        titulo="Usuarios"
        descripcion="Alta de cajeros y cobradores. Las cuentas las crea el administrador; no hay registro público."
      />

      <PageContent className="max-w-2xl">
        {ultimo && (
          <div className="mb-4 flex items-center gap-2 rounded-md bg-tav-green-50 px-4 py-3 text-[13px] text-tav-green-600">
            <Check className="h-4 w-4" />
            Creado: <b>{ultimo.nombre}</b> · {ultimo.telefono}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-tav-ink-3" /> Nuevo usuario
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={crear} className="flex flex-col gap-4">
              {/* Selector de rol */}
              <div className="flex flex-col gap-1.5">
                <Label>Rol</Label>
                <div className="flex gap-2">
                  {(['cajero', 'cobrador'] as Rol[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRol(r)}
                      className={cn(
                        'flex-1 rounded-md border px-4 py-2.5 text-[14px] font-semibold capitalize transition-colors',
                        rol === r
                          ? 'border-tav-blue bg-tav-blue-50 text-tav-blue-600'
                          : 'border-tav-line bg-tav-surface text-tav-ink-3 hover:bg-tav-bg',
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Campo label="Nombre" id="nombre" value={form.nombre} onChange={(v) => set('nombre', v)} required />
                <Campo label="Teléfono" id="telefono" value={form.telefono} onChange={(v) => set('telefono', v)} placeholder="+58 412-0000000" required />
                <Campo label="Contraseña" id="password" type="password" value={form.password} onChange={(v) => set('password', v)} required />
                <Campo label="Documento" id="documento" value={form.documento} onChange={(v) => set('documento', v)} />
              </div>

              {rol === 'cajero' && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="limite">
                      Límite de crédito (USD) <span className="text-tav-red-700">*</span>
                    </Label>
                    <Input
                      id="limite"
                      inputMode="decimal"
                      placeholder="2.000,00"
                      value={form.limite}
                      onChange={(e) => set('limite', e.target.value)}
                      className="font-mono tabular-nums"
                    />
                  </div>
                  <Campo label="Zona" id="zona" value={form.zona} onChange={(v) => set('zona', v)} />
                  <Campo label="Dirección" id="direccion" value={form.direccion} onChange={(v) => set('direccion', v)} />
                </div>
              )}

              {rol === 'cobrador' && (
                <Campo label="Zona" id="zona-cob" value={form.zona} onChange={(v) => set('zona', v)} />
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="notas">Notas (opcional)</Label>
                <Textarea
                  id="notas"
                  rows={2}
                  value={form.notas}
                  onChange={(e) => set('notas', e.target.value)}
                />
              </div>

              <Button type="submit" disabled={creando || !valido} className="h-11 self-start">
                {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : `Crear ${rol}`}
              </Button>
            </form>
          </CardContent>
        </Card>
      </PageContent>
    </>
  );
}

function Campo({
  label,
  id,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-tav-red-700"> *</span>}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
    </div>
  );
}
