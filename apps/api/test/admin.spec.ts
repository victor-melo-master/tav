/**
 * Tests de la API del administrador — Fase 8A
 *
 * Postgres real (tav_test), sin mocks. La app NestJS se levanta con supertest
 * para probar controladores, guards, filtro de excepciones y DTOs de verdad.
 *
 * Cobertura pedida:
 *   - GET /admin/cajeros lista todos con semáforo, filtros y búsqueda
 *   - GET /admin/cajeros/:id ficha completa con movimientos y operaciones
 *   - PATCH /admin/cajeros/:id/limite cambia el límite y queda en AuditLog
 *   - GET /admin/ampliaciones lista filtradas, pendientes primero
 *   - POST /admin/ampliaciones/:id/aprobar y /rechazar con nota
 *   - Aprobar una ampliación permite una operación que antes se rechazaba
 *   - GET /admin/cierres lista filtradas, enviados primero
 *   - GET /admin/cierres/:id detalle con cobros
 *   - POST /admin/cierres/:id/verificar marca verificado o con_diferencia
 *   - Verificar con diferencia calcula el monto y exige nota
 *   - POST /admin/cobros registra un pago sin cobrador (no toca cierre)
 *   - GET /admin/resumen totales del día y del mes
 *   - Un cobrador y un cajero reciben 403 en todos estos endpoints
 */

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient, Prisma } from '@prisma/client';
import argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { LedgerExceptionFilter } from '../src/ledger-exception.filter';

const TEST_URL = 'postgresql://tav:tav@localhost:5432/tav_test?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });

const TABLAS = [
  'MovimientoCaja', 'Caja', 'PrecioCajeroServicio',
  'Usuario', 'PerfilCajero', 'PerfilCobrador', 'Operacion', 'Cobro',
  'Movimiento', 'AmpliacionCredito', 'Cierre', 'Atencion', 'Aviso', 'AuditLog',
  'Config', 'Corredor',
];

let app: INestApplication;

async function truncateTodo() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLAS.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}

async function seedConfig() {
  await prisma.config.createMany({
    data: [
      { clave: 'semaforo.dias_ambar', valor: '4' },
      { clave: 'semaforo.dias_rojo', valor: '7' },
      { clave: 'semaforo.pct_ambar', valor: '0.75' },
    ],
    skipDuplicates: true,
  });
}

async function crearAdmin(opts: {
  email: string;
  telefono?: string;
  password?: string;
  nombre?: string;
}): Promise<{ id: string; email: string; password: string }> {
  const password = opts.password ?? 'admin-clave';
  const passwordHash = await argon2.hash(password);
  const u = await prisma.usuario.create({
    data: {
      rol: 'admin',
      nombre: opts.nombre ?? 'Admin Test',
      email: opts.email,
      telefono: opts.telefono,
      passwordHash,
    },
  });
  return { id: u.id, email: opts.email, password };
}

async function crearCajero(opts: {
  email: string;
  telefono?: string;
  password?: string;
  nombre?: string;
  limiteCents?: bigint;
  saldoCents?: bigint;
  deudaDesde?: Date | null;
  zona?: string;
}): Promise<{ id: string; email: string; password: string }> {
  const password = opts.password ?? 'clave123';
  const passwordHash = await argon2.hash(password);
  const data: Prisma.UsuarioCreateInput = {
    rol: 'cajero',
    nombre: opts.nombre ?? 'Cajero Test',
    email: opts.email,
    telefono: opts.telefono,
    passwordHash,
    perfilCajero: {
      create: {
        limiteCents: opts.limiteCents ?? 100_000n,
        saldoCents: opts.saldoCents ?? 0n,
        deudaDesde: opts.deudaDesde ?? null,
        zona: opts.zona,
      },
    },
  };
  const u = await prisma.usuario.create({ data });
  // Fijar precio del corredor de test para este cajero. Reemplaza la
  // publicación de tasa global del modelo viejo: ahora el precio es por
  // cajero, y sin precio el cajero no ve el servicio (serviciosOfrecibles).
  if (corredorIdTest) {
    await prisma.precioCajeroServicio.create({
      data: {
        cajeroId: u.id,
        servicioId: corredorIdTest,
        precioGyd: new Prisma.Decimal('1.03'),
        fijadoPorId: 'admin-test',
      },
    });
  }
  return { id: u.id, email: opts.email, password };
}

async function crearCobrador(opts: {
  email: string;
  telefono?: string;
  password?: string;
  nombre?: string;
}): Promise<{ id: string; email: string; password: string }> {
  const password = opts.password ?? 'clave123';
  const passwordHash = await argon2.hash(password);
  const data: Prisma.UsuarioCreateInput = {
    rol: 'cobrador',
    nombre: opts.nombre ?? 'Cobrador Test',
    email: opts.email,
    telefono: opts.telefono,
    passwordHash,
    perfilCobrador: { create: {} },
  };
  const u = await prisma.usuario.create({ data });
  return { id: u.id, email: opts.email, password };
}

async function login(app: INestApplication, email: string, password: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password });
  return res.body.accessToken;
}

let corredorIdTest: string;

function operacionValida(clientUuid: string, overrides?: Record<string, unknown>) {
  return {
    clientUuid,
    montoOrigenCents: '100000',
    monedaOrigen: 'USD',
    beneficiario: {
      nombre: 'María González',
      datos: 'Banco: Banesco\nCuenta: 0134...4471\nCédula: V-12345678\nMétodo: transferencia_gyd'
    },
    corredorId: corredorIdTest,
    ...overrides,
  };
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new LedgerExceptionFilter());
  await app.init();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateTodo();
  await seedConfig();
  // Crear una caja física y un servicio (BCV) que la referencia.
  const caja = await prisma.caja.create({
    data: { esMadre: false, moneda: 'BS', nombre: 'Bolívares en cuenta', pais: 'VEN', saldoCents: 0n },
  });
  const c = await prisma.corredor.create({
    data: {
      pais: 'VEN', paisNombre: 'Venezuela', moneda: 'BS', monedaNombre: 'Bolívares',
      formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia',
      servicio: 'bcv', servicioNombre: 'BCV',
      cajaId: caja.id,
      creadoPorId: 'admin-test',
    },
  });
  corredorIdTest = c.id;
});

// ─────────────────────────── CAJEROS ───────────────────────────

describe('Admin — GET /admin/cajeros', () => {
  test('lista todos los cajeros con semáforo y días sin conectarse', async () => {
    const admin = await crearAdmin({ email: '0414-0000001@tav.test' });
    const token = await login(app, admin.email, admin.password);

    await crearCajero({
      email: '0414-1000001@tav.test',
      nombre: 'Verde',
      limiteCents: 100_000n,
      saldoCents: 0n,
    });

    const hace5dias = new Date(Date.now() - 5 * 86_400_000);
    await crearCajero({
      email: '0414-1000002@tav.test',
      telefono: '0414-1000002',
      nombre: 'Ambar',
      limiteCents: 100_000n,
      saldoCents: 80_000n,
      deudaDesde: hace5dias,
    });

    const res = await request(app.getHttpServer())
      .get('/admin/cajeros')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    // El ámbar (más urgente) sale primero.
    expect(res.body[0].nombre).toBe('Ambar');
    expect(res.body[0].semaforo).toBe('ambar');
    expect(res.body[1].nombre).toBe('Verde');
    expect(res.body[1].semaforo).toBe('verde');
    // Incluye teléfono y días sin conectarse.
    expect(res.body[0].telefono).toBe('0414-1000002');
    expect(res.body[0].diasSinConectarse).toBeNull();
  });

  test('filtra por estado del semáforo', async () => {
    const admin = await crearAdmin({ email: '0414-0000001@tav.test' });
    const token = await login(app, admin.email, admin.password);

    await crearCajero({ email: '0414-1000001@tav.test', nombre: 'Verde', limiteCents: 100_000n });
    await crearCajero({
      email: '0414-1000002@tav.test',
      telefono: '0414-1000002',
      nombre: 'Rojo',
      limiteCents: 100_000n,
      saldoCents: 100_000n,
      deudaDesde: new Date(),
    });

    const res = await request(app.getHttpServer())
      .get('/admin/cajeros?semaforo=rojo')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].nombre).toBe('Rojo');
    expect(res.body[0].bloqueado).toBe(true);
  });

  test('busca por nombre o teléfono', async () => {
    const admin = await crearAdmin({ email: '0414-0000001@tav.test' });
    const token = await login(app, admin.email, admin.password);

    await crearCajero({ email: '0414-1000001@tav.test', nombre: 'Juan Pérez' });
    await crearCajero({ email: '0414-1000002@tav.test',
      telefono: '0414-1000002', nombre: 'María Gómez' });

    const porNombre = await request(app.getHttpServer())
      .get('/admin/cajeros?q=Juan')
      .set('Authorization', `Bearer ${token}`);
    expect(porNombre.status).toBe(200);
    expect(porNombre.body).toHaveLength(1);
    expect(porNombre.body[0].nombre).toBe('Juan Pérez');

    const porTelefono = await request(app.getHttpServer())
      .get('/admin/cajeros?q=1000002')
      .set('Authorization', `Bearer ${token}`);
    expect(porTelefono.status).toBe(200);
    expect(porTelefono.body).toHaveLength(1);
    expect(porTelefono.body[0].nombre).toBe('María Gómez');
  });
});

describe('Admin — GET /admin/cajeros/:id', () => {
  test('ficha completa con movimientos y operaciones', async () => {
    const admin = await crearAdmin({ email: '0414-0000001@tav.test' });
    const token = await login(app, admin.email, admin.password);

    const caj = await crearCajero({ email: '0414-1000001@tav.test', limiteCents: 500_000n });

    // Crear una operación via el endpoint del cajero para tener movimiento.
    const cajToken = await login(app, caj.email, caj.password);
    await request(app.getHttpServer())
      .post('/cajero/operaciones')
      .set('Authorization', `Bearer ${cajToken}`)
      .send(operacionValida('op-ficha-001'));

    const res = await request(app.getHttpServer())
      .get(`/admin/cajeros/${caj.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(caj.id);
    expect(res.body.saldoCents).toBe('103000');
    expect(res.body.limiteCents).toBe('500000');
    expect(res.body.semaforo).toBeTruthy();
    expect(res.body.movimientos).toHaveLength(1);
    expect(res.body.movimientos[0].tipo).toBe('cargo');
    expect(res.body.operaciones).toHaveLength(1);
    expect(res.body.operaciones[0].folio).toMatch(/^TAV-/);
    // No se filtra el passwordHash del usuario anidado.
    expect(res.body.usuario.passwordHash).toBeUndefined();
  });

  test('404 si el cajero no existe', async () => {
    const admin = await crearAdmin({ email: '0414-0000001@tav.test' });
    const token = await login(app, admin.email, admin.password);

    const res = await request(app.getHttpServer())
      .get('/admin/cajeros/no-existe')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NO_ENCONTRADO');
  });
});

// ─────────────────────────── CAMBIAR LÍMITE ───────────────────────────

describe('Admin — PATCH /admin/cajeros/:id/limite', () => {
  test('cambia el límite y queda registrado en AuditLog con valor anterior y nuevo', async () => {
    const admin = await crearAdmin({ email: '0414-0000001@tav.test' });
    const token = await login(app, admin.email, admin.password);

    const caj = await crearCajero({ email: '0414-1000001@tav.test', limiteCents: 100_000n });

    const res = await request(app.getHttpServer())
      .patch(`/admin/cajeros/${caj.id}/limite`)
      .set('Authorization', `Bearer ${token}`)
      .send({ limiteCents: '200000' });

    expect(res.status).toBe(200);
    expect(res.body.limiteCents).toBe('200000');

    // El perfil quedó actualizado.
    const perfil = await prisma.perfilCajero.findUniqueOrThrow({ where: { usuarioId: caj.id } });
    expect(perfil.limiteCents).toBe(200_000n);

    // El AuditLog registró el cambio con valor anterior y nuevo.
    const audit = await prisma.auditLog.findFirst({
      where: { entidad: 'PerfilCajero', entidadId: caj.id },
    });
    expect(audit).not.toBeNull();
    expect(audit!.accion).toBe('cajero.cambiar_limite');
    expect(audit!.actorId).toBe(admin.id);
    expect(audit!.antes).toEqual({ limiteCents: '100000' });
    expect(audit!.despues).toEqual({ limiteCents: '200000' });
  });

  test('404 si el cajero no existe', async () => {
    const admin = await crearAdmin({ email: '0414-0000001@tav.test' });
    const token = await login(app, admin.email, admin.password);

    const res = await request(app.getHttpServer())
      .patch('/admin/cajeros/no-existe/limite')
      .set('Authorization', `Bearer ${token}`)
      .send({ limiteCents: '200000' });

    expect(res.status).toBe(404);
  });
});

// ─────────────────────────── AMPLIACIONES ───────────────────────────

describe('Admin — GET /admin/ampliaciones', () => {
  test('lista filtradas por estado, pendientes primero', async () => {
    const admin = await crearAdmin({ email: '0414-0000001@tav.test' });
    const token = await login(app, admin.email, admin.password);

    const caj = await crearCajero({ email: '0414-1000001@tav.test' });

    // Crear 3 ampliaciones en distintos estados.
    const pendiente = await prisma.ampliacionCredito.create({
      data: { cajeroId: caj.id, montoCents: 50_000n, motivo: 'Cliente grande', estado: 'pendiente' },
    });
    const aprobada = await prisma.ampliacionCredito.create({
      data: {
        cajeroId: caj.id,
        montoCents: 30_000n,
        motivo: 'Otra solicitud',
        estado: 'aprobada',
        resueltaAt: new Date(),
        resueltaPorId: admin.id,
      },
    });
    const rechazada = await prisma.ampliacionCredito.create({
      data: {
        cajeroId: caj.id,
        montoCents: 20_000n,
        motivo: 'Rechazada',
        estado: 'rechazada',
        resueltaAt: new Date(),
        resueltaPorId: admin.id,
      },
    });

    // Sin filtro: trae las 3, pendiente primero.
    const res = await request(app.getHttpServer())
      .get('/admin/ampliaciones')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0].id).toBe(pendiente.id);
    expect(res.body[0].estado).toBe('pendiente');
    expect(res.body[1].id).toBe(aprobada.id);
    expect(res.body[2].id).toBe(rechazada.id);

    // Filtro por estado pendiente: solo la pendiente.
    const resFiltro = await request(app.getHttpServer())
      .get('/admin/ampliaciones?estado=pendiente')
      .set('Authorization', `Bearer ${token}`);
    expect(resFiltro.status).toBe(200);
    expect(resFiltro.body).toHaveLength(1);
    expect(resFiltro.body[0].id).toBe(pendiente.id);
  });
});

describe('Admin — POST /admin/ampliaciones/:id/aprobar y /rechazar', () => {
  test('aprueba una ampliación pendiente con nota', async () => {
    const admin = await crearAdmin({ email: '0414-0000001@tav.test' });
    const token = await login(app, admin.email, admin.password);

    const caj = await crearCajero({ email: '0414-1000001@tav.test' });
    const amp = await prisma.ampliacionCredito.create({
      data: { cajeroId: caj.id, montoCents: 50_000n, motivo: 'Cliente grande' },
    });

    const res = await request(app.getHttpServer())
      .post(`/admin/ampliaciones/${amp.id}/aprobar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nota: 'Aprobado por confianza' });

    expect(res.status).toBe(201);
    expect(res.body.estado).toBe('aprobada');
    expect(res.body.resueltaAt).not.toBeNull();
    expect(res.body.resueltaPorId).toBe(admin.id);
    expect(res.body.notaAdmin).toBe('Aprobado por confianza');
  });

  test('rechaza una ampliación pendiente', async () => {
    const admin = await crearAdmin({ email: '0414-0000001@tav.test' });
    const token = await login(app, admin.email, admin.password);

    const caj = await crearCajero({ email: '0414-1000001@tav.test' });
    const amp = await prisma.ampliacionCredito.create({
      data: { cajeroId: caj.id, montoCents: 50_000n, motivo: 'Cliente grande' },
    });

    const res = await request(app.getHttpServer())
      .post(`/admin/ampliaciones/${amp.id}/rechazar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nota: 'No procede' });

    expect(res.status).toBe(201);
    expect(res.body.estado).toBe('rechazada');
    expect(res.body.notaAdmin).toBe('No procede');
  });

  test('no se puede aprobar una ampliación ya resuelta', async () => {
    const admin = await crearAdmin({ email: '0414-0000001@tav.test' });
    const token = await login(app, admin.email, admin.password);

    const caj = await crearCajero({ email: '0414-1000001@tav.test' });
    const amp = await prisma.ampliacionCredito.create({
      data: {
        cajeroId: caj.id,
        montoCents: 50_000n,
        motivo: 'Ya resuelta',
        estado: 'rechazada',
        resueltaAt: new Date(),
        resueltaPorId: admin.id,
      },
    });

    const res = await request(app.getHttpServer())
      .post(`/admin/ampliaciones/${amp.id}/aprobar`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  test('aprobar una ampliación permite una operación que antes se rechazaba', async () => {
    const admin = await crearAdmin({ email: '0414-0000001@tav.test' });
    const adminToken = await login(app, admin.email, admin.password);

    // Cajero con límite 50.000 y saldo 0. Una operación de 103.000 no cabe.
    const caj = await crearCajero({ email: '0414-1000001@tav.test', limiteCents: 50_000n });
    const cajToken = await login(app, caj.email, caj.password);

    // 1. La operación se rechaza por sin cupo.
    const rechazo = await request(app.getHttpServer())
      .post('/cajero/operaciones')
      .set('Authorization', `Bearer ${cajToken}`)
      .send(operacionValida('op-antes-ampliacion'));
    expect(rechazo.status).toBe(409);
    expect(rechazo.body.code).toBe('SIN_CUPO');

    // 2. El cajero solicita una ampliación de 100.000.
    const sol = await request(app.getHttpServer())
      .post('/cajero/ampliaciones')
      .set('Authorization', `Bearer ${cajToken}`)
      .send({ montoCents: '100000', motivo: 'Cliente grande esperando cambio' });
    expect(sol.status).toBe(201);

    // 3. El admin la aprueba.
    const aprobar = await request(app.getHttpServer())
      .post(`/admin/ampliaciones/${sol.body.id}/aprobar`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nota: 'Aprobado' });
    expect(aprobar.status).toBe(201);
    expect(aprobar.body.estado).toBe('aprobada');

    // 4. La misma operación ahora pasa: límite efectivo = 50.000 + 100.000 = 150.000.
    const aceptada = await request(app.getHttpServer())
      .post('/cajero/operaciones')
      .set('Authorization', `Bearer ${cajToken}`)
      .send(operacionValida('op-despues-ampliacion'));
    expect(aceptada.status).toBe(201);
    expect(aceptada.body.operacion.totalCents).toBe('103000');

    // 5. La ampliación quedó consumida y la operación la referencia.
    const ampFinal = await prisma.ampliacionCredito.findUniqueOrThrow({ where: { id: sol.body.id } });
    expect(ampFinal.estado).toBe('consumida');
    const opConsumida = await prisma.operacion.findUniqueOrThrow({
      where: { id: aceptada.body.operacion.id },
    });
    expect(opConsumida.ampliacionId).toBe(sol.body.id);
  });
});

// ─────────────────────────── CIERRES ───────────────────────────

describe('Admin — GET /admin/cierres', () => {
  test('lista filtradas por estado, enviados primero', async () => {
    const admin = await crearAdmin({ email: '0414-0000001@tav.test' });
    const token = await login(app, admin.email, admin.password);

    const cob = await crearCobrador({ email: '0414-2000001@tav.test' });
    const caj = await crearCajero({ email: '0414-1000001@tav.test', saldoCents: 60_000n, deudaDesde: new Date() });

    // Crear un cierre enviado y uno abierto.
    const cobToken = await login(app, cob.email, cob.password);

    // Cierre 1: registrar un cobro y enviarlo.
    await request(app.getHttpServer())
      .post('/cobrador/cobros')
      .set('Authorization', `Bearer ${cobToken}`)
      .send({
        clientUuid: 'cobro-cierre-1',
        cajeroId: caj.id,
        metodo: 'efectivo_gyd',
        montoCents: '30000',
        
      });

    const cierreActual = await request(app.getHttpServer())
      .get('/cobrador/cierre-actual')
      .set('Authorization', `Bearer ${cobToken}`);

    await request(app.getHttpServer())
      .post(`/cobrador/cierres/${cierreActual.body.id}/enviar`)
      .set('Authorization', `Bearer ${cobToken}`)
      .send({ efectivoDeclaradoCents: '30000',  });

    // Cierre 2: otro cobrador con cierre abierto (sin cobros aún → sin cierre).
    const cob2 = await crearCobrador({ email: '0414-2000002@tav.test' });

    const res = await request(app.getHttpServer())
      .get('/admin/cierres')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].estado).toBe('enviado');
    expect(res.body.items[0].cobrador.usuario.nombre).toBe('Cobrador Test');
    expect(res.body.items[0].cobrosCount).toBe(1);
  });

  test('filtra por estado', async () => {
    const admin = await crearAdmin({ email: '0414-0000001@tav.test' });
    const token = await login(app, admin.email, admin.password);

    const cob = await crearCobrador({ email: '0414-2000001@tav.test' });
    const caj = await crearCajero({ email: '0414-1000001@tav.test', saldoCents: 60_000n, deudaDesde: new Date() });
    const cobToken = await login(app, cob.email, cob.password);

    await request(app.getHttpServer())
      .post('/cobrador/cobros')
      .set('Authorization', `Bearer ${cobToken}`)
      .send({
        clientUuid: 'cobro-filtro-1',
        cajeroId: caj.id,
        metodo: 'efectivo_gyd',
        montoCents: '30000',
        
      });

    const cierreActual = await request(app.getHttpServer())
      .get('/cobrador/cierre-actual')
      .set('Authorization', `Bearer ${cobToken}`);

    await request(app.getHttpServer())
      .post(`/cobrador/cierres/${cierreActual.body.id}/enviar`)
      .set('Authorization', `Bearer ${cobToken}`)
      .send({ efectivoDeclaradoCents: '30000',  });

    const res = await request(app.getHttpServer())
      .get('/admin/cierres?estado=enviado')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].estado).toBe('enviado');

    // Filtro por verificado → 0.
    const resVacio = await request(app.getHttpServer())
      .get('/admin/cierres?estado=verificado')
      .set('Authorization', `Bearer ${token}`);
    expect(resVacio.body.items).toHaveLength(0);
  });
});

describe('Admin — GET /admin/cierres/:id', () => {
  test('detalle con todos los cobros del día', async () => {
    const admin = await crearAdmin({ email: '0414-0000001@tav.test' });
    const token = await login(app, admin.email, admin.password);

    const cob = await crearCobrador({ email: '0414-2000001@tav.test' });
    const caj = await crearCajero({ email: '0414-1000001@tav.test', saldoCents: 60_000n, deudaDesde: new Date() });
    const cobToken = await login(app, cob.email, cob.password);

    await request(app.getHttpServer())
      .post('/cobrador/cobros')
      .set('Authorization', `Bearer ${cobToken}`)
      .send({
        clientUuid: 'cobro-detalle-1',
        cajeroId: caj.id,
        metodo: 'efectivo_gyd',
        montoCents: '30000',
        
      });

    const cierreActual = await request(app.getHttpServer())
      .get('/cobrador/cierre-actual')
      .set('Authorization', `Bearer ${cobToken}`);

    const res = await request(app.getHttpServer())
      .get(`/admin/cierres/${cierreActual.body.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(cierreActual.body.id);
    expect(res.body.cobros).toHaveLength(1);
    expect(res.body.cobros[0].cajero.usuario.nombre).toBe('Cajero Test');
    expect(res.body.cobros[0].montoCents).toBe('30000');
  });
});

describe('Admin — POST /admin/cierres/:id/verificar', () => {
  test('verifica sin diferencia → estado verificado', async () => {
    const admin = await crearAdmin({ email: '0414-0000001@tav.test' });
    const token = await login(app, admin.email, admin.password);

    const cob = await crearCobrador({ email: '0414-2000001@tav.test' });
    const caj = await crearCajero({ email: '0414-1000001@tav.test', saldoCents: 60_000n, deudaDesde: new Date() });
    const cobToken = await login(app, cob.email, cob.password);

    await request(app.getHttpServer())
      .post('/cobrador/cobros')
      .set('Authorization', `Bearer ${cobToken}`)
      .send({
        clientUuid: 'cobro-verificar-ok',
        cajeroId: caj.id,
        metodo: 'efectivo_gyd',
        montoCents: '30000',
      });

    const cierreActual = await request(app.getHttpServer())
      .get('/cobrador/cierre-actual')
      .set('Authorization', `Bearer ${cobToken}`);

    await request(app.getHttpServer())
      .post(`/cobrador/cierres/${cierreActual.body.id}/enviar`)
      .set('Authorization', `Bearer ${cobToken}`)
      .send({ efectivoDeclaradoCents: '30000' });

    const res = await request(app.getHttpServer())
      .post(`/admin/cierres/${cierreActual.body.id}/verificar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ efectivoRecibidoCents: '30000' });

    expect(res.status).toBe(201);
    expect(res.body.estado).toBe('verificado');
    expect(res.body.efectivoRecibidoCents).toBe('30000');
    expect(res.body.diferenciaCents).toBe('0');
    expect(res.body.verificadoPorId).toBe(admin.id);
    expect(res.body.verificadoAt).not.toBeNull();
  });

  test('verifica con diferencia → estado con_diferencia, calcula el monto y exige nota', async () => {
    const admin = await crearAdmin({ email: '0414-0000001@tav.test' });
    const token = await login(app, admin.email, admin.password);

    const cob = await crearCobrador({ email: '0414-2000001@tav.test' });
    const caj = await crearCajero({ email: '0414-1000001@tav.test', saldoCents: 60_000n, deudaDesde: new Date() });
    const cobToken = await login(app, cob.email, cob.password);

    await request(app.getHttpServer())
      .post('/cobrador/cobros')
      .set('Authorization', `Bearer ${cobToken}`)
      .send({
        clientUuid: 'cobro-verificar-dif',
        cajeroId: caj.id,
        metodo: 'efectivo_gyd',
        montoCents: '30000',
      });

    const cierreActual = await request(app.getHttpServer())
      .get('/cobrador/cierre-actual')
      .set('Authorization', `Bearer ${cobToken}`);

    // El cobrador declara 30.000 en efectivo.
    await request(app.getHttpServer())
      .post(`/cobrador/cierres/${cierreActual.body.id}/enviar`)
      .set('Authorization', `Bearer ${cobToken}`)
      .send({ efectivoDeclaradoCents: '30000' });

    // El admin cuenta 29.500 → diferencia de -500.
    const res = await request(app.getHttpServer())
      .post(`/admin/cierres/${cierreActual.body.id}/verificar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ efectivoRecibidoCents: '29500', nota: 'Faltaron 500 en el cuadre' });

    expect(res.status).toBe(201);
    expect(res.body.estado).toBe('con_diferencia');
    expect(res.body.efectivoRecibidoCents).toBe('29500');
    // diferencia = recibido − declarado = 29500 − 30000 = −500
    expect(res.body.diferenciaCents).toBe('-500');
    expect(res.body.notaAdmin).toBe('Faltaron 500 en el cuadre');
  });

  test('verificar con diferencia sin nota → 400', async () => {
    const admin = await crearAdmin({ email: '0414-0000001@tav.test' });
    const token = await login(app, admin.email, admin.password);

    const cob = await crearCobrador({ email: '0414-2000001@tav.test' });
    const caj = await crearCajero({ email: '0414-1000001@tav.test', saldoCents: 60_000n, deudaDesde: new Date() });
    const cobToken = await login(app, cob.email, cob.password);

    await request(app.getHttpServer())
      .post('/cobrador/cobros')
      .set('Authorization', `Bearer ${cobToken}`)
      .send({
        clientUuid: 'cobro-verificar-sinnota',
        cajeroId: caj.id,
        metodo: 'efectivo_gyd',
        montoCents: '30000',
      });

    const cierreActual = await request(app.getHttpServer())
      .get('/cobrador/cierre-actual')
      .set('Authorization', `Bearer ${cobToken}`);

    await request(app.getHttpServer())
      .post(`/cobrador/cierres/${cierreActual.body.id}/enviar`)
      .set('Authorization', `Bearer ${cobToken}`)
      .send({ efectivoDeclaradoCents: '30000' });

    // Diferencia (29500 vs 30000) sin nota → 400.
    const res = await request(app.getHttpServer())
      .post(`/admin/cierres/${cierreActual.body.id}/verificar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ efectivoRecibidoCents: '29500' });

    expect(res.status).toBe(400);
  });

  test('cierre con efectivo GYD se declara y verifica como una sola pila', async () => {
    const admin = await crearAdmin({ email: '0414-0000001@tav.test' });
    const token = await login(app, admin.email, admin.password);

    const cob = await crearCobrador({ email: '0414-2000001@tav.test' });
    const caj = await crearCajero({ email: '0414-1000001@tav.test', saldoCents: 200_000n, deudaDesde: new Date() });
    const cobToken = await login(app, cob.email, cob.password);

    // Dos cobros en efectivo GYD: 40.000 + 5.000 = 45.000.
    await request(app.getHttpServer())
      .post('/cobrador/cobros')
      .set('Authorization', `Bearer ${cobToken}`)
      .send({
        clientUuid: 'cobro-cierre-1',
        cajeroId: caj.id,
        metodo: 'efectivo_gyd',
        montoCents: '40000',
      });
    await request(app.getHttpServer())
      .post('/cobrador/cobros')
      .set('Authorization', `Bearer ${cobToken}`)
      .send({
        clientUuid: 'cobro-cierre-2',
        cajeroId: caj.id,
        metodo: 'efectivo_gyd',
        montoCents: '5000',
      });

    const cierreActual = await request(app.getHttpServer())
      .get('/cobrador/cierre-actual')
      .set('Authorization', `Bearer ${cobToken}`);

    // El cobrador declara 45.000.
    await request(app.getHttpServer())
      .post(`/cobrador/cierres/${cierreActual.body.id}/enviar`)
      .set('Authorization', `Bearer ${cobToken}`)
      .send({ efectivoDeclaradoCents: '45000' });

    // El admin cuenta exactamente eso.
    const res = await request(app.getHttpServer())
      .post(`/admin/cierres/${cierreActual.body.id}/verificar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ efectivoRecibidoCents: '45000' });

    expect(res.status).toBe(201);
    expect(res.body.estado).toBe('verificado');
    expect(res.body.efectivoRecibidoCents).toBe('45000');
    expect(res.body.diferenciaCents).toBe('0');
  });

  test('no se puede verificar un cierre no enviado', async () => {
    const admin = await crearAdmin({ email: '0414-0000001@tav.test' });
    const token = await login(app, admin.email, admin.password);

    const cob = await crearCobrador({ email: '0414-2000001@tav.test' });
    const caj = await crearCajero({ email: '0414-1000001@tav.test', saldoCents: 60_000n, deudaDesde: new Date() });
    const cobToken = await login(app, cob.email, cob.password);

    // Crear un cobro → se abre un cierre en estado 'abierto'.
    await request(app.getHttpServer())
      .post('/cobrador/cobros')
      .set('Authorization', `Bearer ${cobToken}`)
      .send({
        clientUuid: 'cobro-noenviado',
        cajeroId: caj.id,
        metodo: 'efectivo_gyd',
        montoCents: '30000',
        
      });

    const cierreActual = await request(app.getHttpServer())
      .get('/cobrador/cierre-actual')
      .set('Authorization', `Bearer ${cobToken}`);

    const res = await request(app.getHttpServer())
      .post(`/admin/cierres/${cierreActual.body.id}/verificar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ efectivoRecibidoCents: '30000',  });

    expect(res.status).toBe(400);
  });
});

// ─────────────────────────── COBROS DEL ADMIN ───────────────────────────

describe('Admin — POST /admin/cobros', () => {
  test('registra un pago en nombre de un cajero sin cobrador (no toca cierre)', async () => {
    const admin = await crearAdmin({ email: '0414-0000001@tav.test' });
    const token = await login(app, admin.email, admin.password);

    const caj = await crearCajero({
      email: '0414-1000001@tav.test',
      limiteCents: 100_000n,
      saldoCents: 60_000n,
      deudaDesde: new Date(),
    });

    const res = await request(app.getHttpServer())
      .post('/admin/cobros')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: 'cobro-admin-001',
        cajeroId: caj.id,
        metodo: 'efectivo_gyd',
        montoCents: '30000',
      });

    expect(res.status).toBe(201);
    expect(res.body.cobro.folio).toMatch(/^COB-/);
    expect(res.body.cobro.montoCents).toBe('30000');
    expect(res.body.cobro.cobradorId).toBeNull();
    // Sin cobrador → sin cierre.
    expect(res.body.cobro.cierreId).toBeNull();
    expect(res.body.yaExistia).toBe(false);

    // El saldo del cajero bajó.
    const perfil = await prisma.perfilCajero.findUniqueOrThrow({ where: { usuarioId: caj.id } });
    expect(perfil.saldoCents).toBe(30_000n);

    // No se creó ningún cierre.
    const cierres = await prisma.cierre.count();
    expect(cierres).toBe(0);
  });

  test('es idempotente por clientUuid', async () => {
    const admin = await crearAdmin({ email: '0414-0000001@tav.test' });
    const token = await login(app, admin.email, admin.password);

    const caj = await crearCajero({
      email: '0414-1000001@tav.test',
      limiteCents: 100_000n,
      saldoCents: 60_000n,
      deudaDesde: new Date(),
    });

    const body = {
      clientUuid: 'cobro-admin-dup',
      cajeroId: caj.id,
      metodo: 'efectivo_gyd' as const,
      montoCents: '30000',
    };

    const r1 = await request(app.getHttpServer())
      .post('/admin/cobros')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    const r2 = await request(app.getHttpServer())
      .post('/admin/cobros')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r2.body.yaExistia).toBe(true);
    expect(r2.body.cobro.id).toBe(r1.body.cobro.id);

    // El saldo no bajó dos veces.
    const perfil = await prisma.perfilCajero.findUniqueOrThrow({ where: { usuarioId: caj.id } });
    expect(perfil.saldoCents).toBe(30_000n);
  });
});

// ─────────────────────────── TABLERO ───────────────────────────

describe('Admin — GET /admin/resumen', () => {
  test('totales del día: cobrado, operaciones, cartera, semáforo, cierres y ampliaciones', async () => {
    const admin = await crearAdmin({ email: '0414-0000001@tav.test' });
    const token = await login(app, admin.email, admin.password);

    const cob = await crearCobrador({ email: '0414-2000001@tav.test' });
    const caj = await crearCajero({
      email: '0414-1000001@tav.test',
      limiteCents: 100_000n,
      saldoCents: 60_000n,
      deudaDesde: new Date(),
    });
    const cobToken = await login(app, cob.email, cob.password);

    // Un cobro hoy.
    await request(app.getHttpServer())
      .post('/cobrador/cobros')
      .set('Authorization', `Bearer ${cobToken}`)
      .send({
        clientUuid: 'cobro-resumen-1',
        cajeroId: caj.id,
        metodo: 'efectivo_gyd',
        montoCents: '30000',
        
      });

    // Enviar el cierre → queda esperando verificación.
    const cierreActual = await request(app.getHttpServer())
      .get('/cobrador/cierre-actual')
      .set('Authorization', `Bearer ${cobToken}`);
    await request(app.getHttpServer())
      .post(`/cobrador/cierres/${cierreActual.body.id}/enviar`)
      .set('Authorization', `Bearer ${cobToken}`)
      .send({ efectivoDeclaradoCents: '30000',  });

    // Una ampliación pendiente (directo en DB para no loguear al cajero,
    // que actualizaría su ultimaVezAt y rompería el conteo de "sin conectarse").
    await prisma.ampliacionCredito.create({
      data: { cajeroId: caj.id, montoCents: 50_000n, motivo: 'Cliente grande' },
    });

    const res = await request(app.getHttpServer())
      .get('/admin/resumen')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // Cobrado hoy: 30000 (el cobro).
    expect(res.body.hoy.cobradoCents).toBe('30000');
    // Operaciones hoy: 0 (no creamos operaciones).
    expect(res.body.hoy.operaciones).toBe(0);
    // Cartera pendiente: 60000 − 30000 = 30000 (el saldo tras el cobro).
    expect(res.body.carteraPendienteCents).toBe('30000');
    // Reparto semáforo: 1 cajero (30000/100000 = 0.3 → verde).
    expect(res.body.repartoSemaforo.verde + res.body.repartoSemaforo.ambar + res.body.repartoSemaforo.rojo).toBe(1);
    // 1 cierre esperando verificación.
    expect(res.body.cierresEsperandoVerificacion).toBe(1);
    // 1 ampliación pendiente.
    expect(res.body.ampliacionesPendientes).toBe(1);
    // Cajeros sin conectarse >3 días: el cajero tiene ultimaVezAt null → cuenta.
    expect(res.body.cajerosSinConectarse).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────── 403 PARA CAJERO Y COBRADOR ───────────────────────────

describe('Admin — un cajero y un cobrador reciben 403 en todos los endpoints', () => {
  // Lista de endpoints a probar. Para los que requieren body o param, se
  // manda algo plausible: el guard de roles rechaza ANTES de que el body
  // se valide, así que el contenido no importa.
  const endpoints: Array<{
    method: 'get' | 'post' | 'patch' | 'delete';
    path: string;
    body?: Record<string, unknown>;
  }> = [
    { method: 'post', path: '/admin/usuarios', body: { nombre: 'x', email: 'x@tav.test', rol: 'cajero', password: 'x', limiteCents: '100' } },
    { method: 'get', path: '/admin/cajeros' },
    { method: 'get', path: '/admin/cajeros/fake-id' },
    { method: 'patch', path: '/admin/cajeros/fake-id/limite', body: { limiteCents: '100' } },
    { method: 'get', path: '/admin/ampliaciones' },
    { method: 'post', path: '/admin/ampliaciones/fake-id/aprobar', body: {} },
    { method: 'post', path: '/admin/ampliaciones/fake-id/rechazar', body: {} },
    { method: 'get', path: '/admin/cierres' },
    { method: 'get', path: '/admin/cierres/fake-id' },
    { method: 'post', path: '/admin/cierres/fake-id/verificar', body: { efectivoRecibidoCents: '100',  } },
    { method: 'post', path: '/admin/cobros', body: { clientUuid: 'x', cajeroId: 'x', metodo: 'efectivo_gyd', montoCents: '100' } },
    { method: 'get', path: '/admin/resumen' },
  ];

  for (const ep of endpoints) {
    test(`cajero 403 en ${ep.method.toUpperCase()} ${ep.path}`, async () => {
      const caj = await crearCajero({ email: '0414-1000001@tav.test' });
      const token = await login(app, caj.email, caj.password);

      const req = request(app.getHttpServer())[ep.method](ep.path).set(
        'Authorization',
        `Bearer ${token}`,
      );
      if (ep.body) req.send(ep.body);

      const res = await req;
      expect(res.status).toBe(403);
    });

    test(`cobrador 403 en ${ep.method.toUpperCase()} ${ep.path}`, async () => {
      const cob = await crearCobrador({ email: '0414-2000001@tav.test' });
      const token = await login(app, cob.email, cob.password);

      const req = request(app.getHttpServer())[ep.method](ep.path).set(
        'Authorization',
        `Bearer ${token}`,
      );
      if (ep.body) req.send(ep.body);

      const res = await req;
      expect(res.status).toBe(403);
    });
  }
});

// ─────────────────────────── UNICIDAD ───────────────────────────

describe('Admin — unicidad de email y teléfono', () => {
  test('dos usuarios distintos pueden compartir el mismo teléfono', async () => {
    const telefono = '0414-9990000';
    await prisma.usuario.create({
      data: {
        rol: 'cajero',
        nombre: 'Cajero Tel',
        email: 'cajero-tel@tav.test',
        telefono,
        passwordHash: 'x',
        perfilCajero: { create: { limiteCents: 100_000n } },
      },
    });
    await prisma.usuario.create({
      data: {
        rol: 'cobrador',
        nombre: 'Cobrador Tel',
        email: 'cobrador-tel@tav.test',
        telefono,
        passwordHash: 'x',
        perfilCobrador: { create: {} },
      },
    });
    const users = await prisma.usuario.findMany({ where: { telefono } });
    expect(users).toHaveLength(2);
  });

  test('email duplicado devuelve 409 desde POST /admin/usuarios', async () => {
    const admin = await crearAdmin({ email: 'admin-unicidad@tav.test' });
    const token = await login(app, admin.email, admin.password);

    const res1 = await request(app.getHttpServer())
      .post('/admin/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Cajero Uno',
        email: 'duplicado-admin@tav.test',
        rol: 'cajero',
        password: 'clave123',
        limiteCents: '100',
      });
    expect(res1.status).toBe(201);

    const res2 = await request(app.getHttpServer())
      .post('/admin/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Cajero Dos',
        email: 'duplicado-admin@tav.test',
        rol: 'cajero',
        password: 'clave123',
        limiteCents: '100',
      });
    expect(res2.status).toBe(409);
  });

  test('prisma.usuario.create con email duplicado lanza P2002', async () => {
    await prisma.usuario.create({
      data: {
        rol: 'cajero',
        nombre: 'Email Dup 1',
        email: 'dup-prisma@tav.test',
        passwordHash: 'x',
        perfilCajero: { create: { limiteCents: 100_000n } },
      },
    });
    await expect(
      prisma.usuario.create({
        data: {
          rol: 'cobrador',
          nombre: 'Email Dup 2',
          email: 'dup-prisma@tav.test',
          passwordHash: 'x',
          perfilCobrador: { create: {} },
        },
      }),
    ).rejects.toThrow(/P2002|Unique constraint/);
  });
});

// ─────────────────── MOVIMIENTOS DIARIOS ───────────────────

describe('Admin — GET /admin/movimientos-diarios', () => {
  test('devuelve las operaciones del día con precio de venta, compra, margen y %', async () => {
    const admin = await crearAdmin({ email: 'admin-movdiarios@tav.test' });
    const token = await login(app, admin.email, admin.password);

    // Crear una caja madre y un ingreso con precioCompraGyd = 237.
    const madre = await prisma.caja.create({
      data: { esMadre: true, moneda: 'USDT', nombre: 'Caja madre USDT', saldoCents: 0n },
    });
    const adminUser = await prisma.usuario.create({
      data: { id: crypto.randomUUID(), rol: 'admin', nombre: 'Admin', email: 'admin-pc-mov@tav.test', passwordHash: 'x' },
    });
    await prisma.movimientoCaja.create({
      data: {
        cajaId: madre.id,
        tipo: 'ingreso',
        montoCents: 1_000_000n,
        saldoDespues: 1_000_000n,
        origenTipo: 'ingreso',
        origenId: crypto.randomUUID(),
        clientUuid: crypto.randomUUID(),
        motivo: 'Compra a 237',
        precioCompraGyd: new Prisma.Decimal('237'),
        registradoPorId: adminUser.id,
      },
    });

    // Crear un cajero y una operación de 100 USD a 240 GYD/USD.
    const caj = await crearCajero({ email: '0414-2000001@tav.test', limiteCents: 100_000_000n });
    const op = await prisma.operacion.create({
      data: {
        folio: 'TAV-TEST-MOV-1',
        clientUuid: crypto.randomUUID(),
        cajeroId: caj.id,
        montoOrigenCents: 10_000n, // 100 USD
        monedaOrigen: 'USD',
        tasaAplicada: new Prisma.Decimal('240'),
        totalCents: 2_400_000n, // 24.000 GYD
        montoDestinoCents: 0n,
        monedaDestino: 'BS',
        precioCompraGyd: new Prisma.Decimal('237'),
        beneficiario: { nombre: 'María', datos: 'Banco: Banesco\nCuenta: 0123\nCédula: V123\nMétodo: transferencia_gyd' },
        corredorId: corredorIdTest,
        creadaPorId: caj.id,
      },
    });

    const res = await request(app.getHttpServer())
      .get('/admin/movimientos-diarios')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.operaciones).toHaveLength(1);

    const item = res.body.operaciones[0];
    expect(item.folio).toBe('TAV-TEST-MOV-1');
    expect(item.cajero).toBe('Cajero Test');
    expect(item.montoUsdCents).toBe('10000');
    expect(Number(item.precioVenta)).toBe(240);
    expect(Number(item.precioCompra)).toBe(237);
    // Margen = (240 - 237) × 100 USD = 3 × 100 = 300 GYD = 30.000 GYD cents.
    expect(item.margenGydCents).toBe('30000');
    // % = 240 / 237 - 1 ≈ 0.01266 (1,27%).
    const pct = Number(item.pctMargen);
    expect(pct).toBeCloseTo(240 / 237 - 1, 5);

    // Totales: 100 USD movidos, 300 GYD de ganancia, 1,27% promedio.
    expect(res.body.totales.operaciones).toBe(1);
    expect(res.body.totales.usdCents).toBe('10000');
    expect(res.body.totales.gananciaGydCents).toBe('30000');
    expect(Number(res.body.totales.pctPromedioPonderado)).toBeCloseTo(240 / 237 - 1, 5);
  });

  test('operación sin precio de compra se muestra con margen vacío y no entra en totales', async () => {
    const admin = await crearAdmin({ email: 'admin-movdiarios2@tav.test' });
    const token = await login(app, admin.email, admin.password);

    const caj = await crearCajero({ email: '0414-2000002@tav.test', limiteCents: 100_000_000n });
    await prisma.operacion.create({
      data: {
        folio: 'TAV-TEST-MOV-2',
        clientUuid: crypto.randomUUID(),
        cajeroId: caj.id,
        montoOrigenCents: 5_000n, // 50 USD
        monedaOrigen: 'USD',
        tasaAplicada: new Prisma.Decimal('250'),
        totalCents: 1_250_000n,
        montoDestinoCents: 0n,
        monedaDestino: 'BS',
        precioCompraGyd: null, // sin precio de compra
        beneficiario: { nombre: 'Juan', datos: 'Banco: Mercantil\nCuenta: 0456\nCédula: V456\nMétodo: transferencia' },
        corredorId: corredorIdTest,
        creadaPorId: caj.id,
      },
    });

    const res = await request(app.getHttpServer())
      .get('/admin/movimientos-diarios')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.operaciones).toHaveLength(1);

    const item = res.body.operaciones[0];
    expect(item.precioCompra).toBeNull();
    expect(item.margenGydCents).toBeNull();
    expect(item.pctMargen).toBeNull();

    // No entra en los totales: ganancia 0, % null.
    expect(res.body.totales.gananciaGydCents).toBe('0');
    expect(res.body.totales.pctPromedioPonderado).toBeNull();
  });

  test('filtra por fecha: solo las operaciones de ese día', async () => {
    const admin = await crearAdmin({ email: 'admin-movdiarios3@tav.test' });
    const token = await login(app, admin.email, admin.password);

    const caj = await crearCajero({ email: '0414-2000003@tav.test', limiteCents: 100_000_000n });

    // Operación de hoy.
    await prisma.operacion.create({
      data: {
        folio: 'TAV-TEST-MOV-3',
        clientUuid: crypto.randomUUID(),
        cajeroId: caj.id,
        montoOrigenCents: 10_000n,
        monedaOrigen: 'USD',
        tasaAplicada: new Prisma.Decimal('240'),
        totalCents: 2_400_000n,
        montoDestinoCents: 0n,
        monedaDestino: 'BS',
        precioCompraGyd: new Prisma.Decimal('237'),
        beneficiario: { nombre: 'Hoy', datos: 'Banco: X\nCuenta: 1\nCédula: V1\nMétodo: efectivo' },
        corredorId: corredorIdTest,
        creadaPorId: caj.id,
      },
    });

    // Operación de ayer (fuera del rango).
    const ayer = new Date(Date.now() - 2 * 86_400_000);
    await prisma.operacion.create({
      data: {
        folio: 'TAV-TEST-MOV-4',
        clientUuid: crypto.randomUUID(),
        cajeroId: caj.id,
        montoOrigenCents: 10_000n,
        monedaOrigen: 'USD',
        tasaAplicada: new Prisma.Decimal('240'),
        totalCents: 2_400_000n,
        montoDestinoCents: 0n,
        monedaDestino: 'BS',
        precioCompraGyd: new Prisma.Decimal('237'),
        beneficiario: { nombre: 'Ayer', datos: 'Banco: X\nCuenta: 2\nCédula: V2\nMétodo: efectivo' },
        corredorId: corredorIdTest,
        creadaPorId: caj.id,
        creadaAt: ayer,
      },
    });

    const res = await request(app.getHttpServer())
      .get('/admin/movimientos-diarios')
      .set('Authorization', `Bearer ${token}`);

    // Solo la operación de hoy.
    expect(res.body.operaciones).toHaveLength(1);
    expect(res.body.operaciones[0].folio).toBe('TAV-TEST-MOV-3');
  });
});
