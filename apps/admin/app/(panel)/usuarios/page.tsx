'use client';

import * as React from 'react';
import {
  Loader2,
  UserPlus,
  Check,
  Search,
  Pencil,
  Lock,
  PauseCircle,
  PlayCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import {
  parseUserAmountToCents,
  formatFecha,
} from '@/lib/format';
import { PageHeader, PageContent } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
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
import type { Rol, UsuarioPublico } from '@/lib/types';

const ROLES: { key: Rol | 'todos'; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'admin', label: 'Admin' },
  { key: 'cajero', label: 'Cajero' },
  { key: 'cobrador', label: 'Cobrador' },
  { key: 'pagador', label: 'Pagador' },
];

const ROLES_FORM: Rol[] = ['cajero', 'cobrador', 'pagador', 'admin'];

export default function UsuariosPage() {
  const [q, setQ] = React.useState('');
  const [rolFiltro, setRolFiltro] = React.useState<Rol | 'todos'>('todos');
  const [page, setPage] = React.useState(1);
  const limit = 20;
  const [usuarios, setUsuarios] = React.useState<UsuarioPublico[]>([]);
  const [total, setTotal] = React.useState(0);
  const [cargando, setCargando] = React.useState(false);

  async function cargar() {
    setCargando(true);
    try {
      const res = await api.listarUsuarios({
        q,
        rol: rolFiltro === 'todos' ? undefined : rolFiltro,
        page,
        limit,
      });
      setUsuarios(res.items);
      setTotal(res.total);
    } catch {
      toast.error('No se pudo cargar la lista de usuarios');
    } finally {
      setCargando(false);
    }
  }

  React.useEffect(() => {
    cargar();
  }, [q, rolFiltro, page]);

  return (
    <>
      <PageHeader
        titulo="Usuarios"
        descripcion="Gestión de administradores, cajeros, cobradores y pagadores."
      />

      <PageContent className="flex flex-col gap-6">
        <ListaUsuarios
          q={q}
          setQ={setQ}
          rolFiltro={rolFiltro}
          setRolFiltro={setRolFiltro}
          page={page}
          setPage={setPage}
          limit={limit}
          total={total}
          usuarios={usuarios}
          cargando={cargando}
          onCambio={cargar}
        />

        <FormularioNuevoUsuario onCreado={cargar} />
      </PageContent>
    </>
  );
}

function ListaUsuarios({
  q,
  setQ,
  rolFiltro,
  setRolFiltro,
  page,
  setPage,
  limit,
  total,
  usuarios,
  cargando,
  onCambio,
}: {
  q: string;
  setQ: (v: string) => void;
  rolFiltro: Rol | 'todos';
  setRolFiltro: (v: Rol | 'todos') => void;
  page: number;
  setPage: (v: number) => void;
  limit: number;
  total: number;
  usuarios: UsuarioPublico[];
  cargando: boolean;
  onCambio: () => void;
}) {
  const [editando, setEditando] = React.useState<UsuarioPublico | null>(null);
  const [cambiandoClave, setCambiandoClave] = React.useState<UsuarioPublico | null>(null);
  const totalPaginas = Math.max(1, Math.ceil(total / limit));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lista de usuarios</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Filtros */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-tav-ink-3" />
            <Input
              placeholder="Buscar por nombre, correo o teléfono"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((r) => (
              <Button
                key={r.key}
                size="sm"
                variant={rolFiltro === r.key ? 'default' : 'outline'}
                onClick={() => {
                  setRolFiltro(r.key);
                  setPage(1);
                }}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Tabla */}
        <div className="rounded-md border border-tav-line">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Última vez</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cargando && (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-tav-ink-3">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              )}
              {!cargando && usuarios.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-tav-ink-3">
                    No hay usuarios
                  </TableCell>
                </TableRow>
              )}
              {!cargando &&
                usuarios.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.nombre}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell className="capitalize">{u.rol}</TableCell>
                    <TableCell>{u.telefono ?? '—'}</TableCell>
                    <TableCell>
                      {u.activo ? (
                        <Badge variant="verde">Activo</Badge>
                      ) : (
                        <Badge variant="rojo">Suspendido</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.ultimaVezAt ? formatFecha(u.ultimaVezAt, true) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={() => setEditando(u)}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={() => setCambiandoClave(u)}
                          title="Cambiar contraseña"
                        >
                          <Lock className="h-4 w-4" />
                        </Button>
                        <SuspenderButton usuario={u} onCambio={onCambio} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>

        {/* Paginación */}
        <div className="flex items-center justify-between text-[13px] text-tav-ink-3">
          <span>
            {total} usuario{total === 1 ? '' : 's'} · página {page} de {totalPaginas}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPaginas}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>

      {editando && (
        <EditarUsuarioDialog usuario={editando} onClose={() => setEditando(null)} onCambio={onCambio} />
      )}
      {cambiandoClave && (
        <CambiarContrasenaDialog
          usuario={cambiandoClave}
          onClose={() => setCambiandoClave(null)}
          onCambio={onCambio}
        />
      )}
    </Card>
  );
}

function SuspenderButton({
  usuario,
  onCambio,
}: {
  usuario: UsuarioPublico;
  onCambio: () => void;
}) {
  const [enviando, setEnviando] = React.useState(false);

  async function toggle() {
    setEnviando(true);
    try {
      await api.cambiarEstadoUsuario(usuario.id, !usuario.activo);
      toast.success(usuario.activo ? 'Usuario suspendido' : 'Usuario reactivado');
      onCambio();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo cambiar el estado');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-8 w-8 p-0"
      onClick={toggle}
      disabled={enviando}
      title={usuario.activo ? 'Suspender' : 'Reactivar'}
    >
      {usuario.activo ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
    </Button>
  );
}

function EditarUsuarioDialog({
  usuario,
  onClose,
  onCambio,
}: {
  usuario: UsuarioPublico;
  onClose: () => void;
  onCambio: () => void;
}) {
  const [form, setForm] = React.useState({
    nombre: usuario.nombre,
    email: usuario.email,
    telefono: usuario.telefono ?? '',
    documento: usuario.documento ?? '',
    notas: '',
    zona: usuario.perfilCajero?.zona ?? usuario.perfilCobrador?.zona ?? '',
    direccion: usuario.perfilCajero?.direccion ?? '',
    pais: usuario.perfilPagador?.pais ?? '',
  });
  const [enviando, setEnviando] = React.useState(false);

  async function guardar() {
    const body: Record<string, string | undefined> = {
      nombre: form.nombre.trim() || undefined,
      email: form.email.trim() || undefined,
      telefono: form.telefono.trim() || undefined,
      documento: form.documento.trim() || undefined,
      notas: form.notas.trim() || undefined,
    };
    if (usuario.rol === 'cajero') {
      body.zona = form.zona.trim() || undefined;
      body.direccion = form.direccion.trim() || undefined;
    }
    if (usuario.rol === 'cobrador') {
      body.zona = form.zona.trim() || undefined;
    }
    if (usuario.rol === 'pagador') {
      body.pais = form.pais.trim().toUpperCase() || undefined;
    }

    setEnviando(true);
    try {
      await api.editarUsuario(usuario.id, body);
      toast.success('Usuario actualizado');
      onCambio();
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo actualizar');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar {usuario.rol}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <Campo label="Nombre" value={form.nombre} onChange={(v) => setForm((f) => ({ ...f, nombre: v }))} />
          <Campo label="Correo" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
          <div className="grid grid-cols-2 gap-4">
            <Campo label="Teléfono" value={form.telefono} onChange={(v) => setForm((f) => ({ ...f, telefono: v }))} />
            <Campo label="Documento" value={form.documento} onChange={(v) => setForm((f) => ({ ...f, documento: v }))} />
          </div>
          {usuario.rol === 'cajero' && (
            <div className="grid grid-cols-2 gap-4">
              <Campo label="Zona" value={form.zona} onChange={(v) => setForm((f) => ({ ...f, zona: v }))} />
              <Campo label="Dirección" value={form.direccion} onChange={(v) => setForm((f) => ({ ...f, direccion: v }))} />
            </div>
          )}
          {usuario.rol === 'cobrador' && (
            <Campo label="Zona" value={form.zona} onChange={(v) => setForm((f) => ({ ...f, zona: v }))} />
          )}
          {usuario.rol === 'pagador' && (
            <Campo label="País (ISO-3)" value={form.pais} onChange={(v) => setForm((f) => ({ ...f, pais: v.toUpperCase() }))} />
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-notas">Notas</Label>
            <Textarea
              id="edit-notas"
              rows={2}
              value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={enviando}>
            {enviando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CambiarContrasenaDialog({
  usuario,
  onClose,
  onCambio,
}: {
  usuario: UsuarioPublico;
  onClose: () => void;
  onCambio: () => void;
}) {
  const [nueva, setNueva] = React.useState('');
  const [enviando, setEnviando] = React.useState(false);

  async function guardar() {
    if (!nueva.trim() || nueva.trim().length < 4) {
      toast.error('La contraseña debe tener al menos 4 caracteres');
      return;
    }
    setEnviando(true);
    try {
      await api.cambiarContrasenaAdmin(usuario.id, nueva.trim());
      toast.success('Contraseña actualizada');
      onCambio();
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo cambiar la contraseña');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar contraseña · {usuario.nombre}</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Campo
            label="Nueva contraseña"
            value={nueva}
            onChange={setNueva}
            type="password"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={enviando}>
            {enviando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormularioNuevoUsuario({ onCreado }: { onCreado: () => void }) {
  const [rol, setRol] = React.useState<Rol>('cajero');
  const [form, setForm] = React.useState({
    nombre: '',
    email: '',
    telefono: '',
    password: '',
    documento: '',
    limite: '',
    zona: '',
    direccion: '',
    pais: '',
    notas: '',
  });
  const [creando, setCreando] = React.useState(false);
  const [ultimo, setUltimo] = React.useState<{ nombre: string; email: string } | null>(null);

  function set(campo: keyof typeof form, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  const limiteCents = rol === 'cajero' ? parseUserAmountToCents(form.limite) : '0';
  const valido =
    form.nombre.trim() &&
    form.email.trim() &&
    form.password.trim().length >= 4 &&
    (rol !== 'cajero' || (limiteCents !== null && BigInt(limiteCents) > 0n)) &&
    (rol !== 'pagador' || form.pais.trim().length > 0);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!valido) return;
    setCreando(true);
    try {
      await api.crearUsuario({
        nombre: form.nombre.trim(),
        email: form.email.trim(),
        telefono: form.telefono.trim() || undefined,
        rol,
        password: form.password,
        documento: form.documento.trim() || undefined,
        limiteCents: rol === 'cajero' ? limiteCents! : undefined,
        zona: form.zona.trim() || undefined,
        direccion: form.direccion.trim() || undefined,
        pais: rol === 'pagador' ? form.pais.trim().toUpperCase() : undefined,
        notas: form.notas.trim() || undefined,
      });
      const rolLabel = rol === 'admin' ? 'Administrador' : rol === 'cajero' ? 'Cajero' : rol === 'cobrador' ? 'Cobrador' : 'Pagador';
      toast.success(`${rolLabel} creado`, {
        description: `${form.nombre.trim()} · ${form.email.trim()}`,
      });
      setUltimo({ nombre: form.nombre.trim(), email: form.email.trim() });
      setForm({ nombre: '', email: '', telefono: '', password: '', documento: '', limite: '', zona: '', direccion: '', pais: '', notas: '' });
      onCreado();
    } catch (e2) {
      toast.error(e2 instanceof ApiError ? e2.message : 'No se pudo crear el usuario');
    } finally {
      setCreando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-tav-ink-3" /> Nuevo usuario
        </CardTitle>
      </CardHeader>
      <CardContent>
        {ultimo && (
          <div className="mb-4 flex items-center gap-2 rounded-md bg-tav-green-50 px-4 py-3 text-[13px] text-tav-green-600">
            <Check className="h-4 w-4" />
            Creado: <b>{ultimo.nombre}</b> · {ultimo.email}
          </div>
        )}

        <form onSubmit={crear} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Rol</Label>
            <div className="flex flex-wrap gap-2">
              {ROLES_FORM.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRol(r)}
                  className={cn(
                    'rounded-md border px-4 py-2.5 text-[14px] font-semibold capitalize transition-colors',
                    rol === r
                      ? 'border-tav-blue bg-tav-blue-50 text-tav-blue-600'
                      : 'border-tav-line bg-tav-surface text-tav-ink-3 hover:bg-tav-bg',
                  )}
                >
                  {r === 'admin' ? 'Administrador' : r}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Nombre" value={form.nombre} onChange={(v) => set('nombre', v)} required />
            <Campo label="Correo" value={form.email} onChange={(v) => set('email', v)} type="email" required />
            <Campo label="Teléfono" value={form.telefono} onChange={(v) => set('telefono', v)} placeholder="+58 412-0000000" />
            <Campo label="Contraseña" value={form.password} onChange={(v) => set('password', v)} type="password" required />
            <Campo label="Documento" value={form.documento} onChange={(v) => set('documento', v)} />
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
              <Campo label="Zona" value={form.zona} onChange={(v) => set('zona', v)} />
              <Campo label="Dirección" value={form.direccion} onChange={(v) => set('direccion', v)} />
            </div>
          )}

          {rol === 'cobrador' && <Campo label="Zona" value={form.zona} onChange={(v) => set('zona', v)} />}

          {rol === 'pagador' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pais">
                País (código ISO-3) <span className="text-tav-red-700">*</span>
              </Label>
              <Input
                id="pais"
                placeholder="VEN, BRA, COL, DOM, MEX, ECU..."
                value={form.pais}
                onChange={(e) => set('pais', e.target.value.toUpperCase())}
                className="font-mono uppercase"
              />
              <span className="text-[12px] text-tav-ink-3">
                Define qué cola ve el pagador. Debe coincidir con el país de un corredor.
              </span>
            </div>
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
            {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : `Crear ${rol === 'admin' ? 'administrador' : rol}`}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Campo({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  const id = label.toLowerCase().replace(/\s+/g, '-');
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
