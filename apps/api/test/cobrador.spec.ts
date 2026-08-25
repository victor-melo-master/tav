/**
 * Tests de la API del cobrador — Fase 7A
 *
 * Postgres real (tav_test), sin mocks. La app NestJS se levanta con supertest
 * para probar controladores, guards, filtro de excepciones y DTOs de verdad.
 *
 * Cobertura pedida:
 *   - GET /cobrador/cajeros lista todos los cajeros ordenados por urgencia
 *   - POST /cobrador/cobros registra un cobro (idempotente por clientUuid)
 *   - POST /cobrador/cobros/:id/anular anula con motivo (mín 10 caracteres)
 *   - Un cobrador no puede anular el cobro de otro
 *   - GET /cobrador/cierre-actual devuelve el cierre de hoy
 *   - POST /cobrador/cierres/:id/enviar cierra el día
 *   - Enviar un cierre con cobros pendientes falla
 *   - GET /cobrador/cierres historial paginado
 *   - POST /cobrador/atenciones marca atención
 *   - DELETE /cobrador/atenciones/:cajeroId libera atención
 *   - Dos cobradores pueden marcar atención sobre cajeros distintos sin interferirse
 *   - POST /cobrador/avisos envía aviso manual
 *   - Un cajero recibe 403 en todos estos endpoints
 */

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient, Prisma } from '@prisma/client';
import argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { LedgerExceptionFilter } from '../src/ledger-exception.filter';

const TEST_URL = 'postgresql://tav:tav@localhost:5432/tav_test?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });

const TABLAS = [
  'Usuario', 'PerfilCajero', 'PerfilCobrador', 'Tasa', 'Operacion', 'Cobro',
  'Movimiento', 'AmpliacionCredito', 'Cierre', 'Atencion', 'Aviso', 'AuditLog',
  'Config',
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

async function crearCajero(opts: {
  telefono: string;
  password?: string;
  nombre?: string;
  limiteCents?: bigint;
  saldoCents?: bigint;
  deudaDesde?: Date | null;
  zona?: string;
}): Promise<{ id: string; telefono: string; password: string }> {
  const password = opts.password ?? 'clave123';
  const passwordHash = await argon2.hash(password);
  const data: Prisma.UsuarioCreateInput = {
    rol: 'cajero',
    nombre: opts.nombre ?? 'Cajero Test',
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
  return { id: u.id, telefono: opts.telefono, password };
}

async function crearCobrador(opts: {
  telefono: string;
  password?: string;
  nombre?: string;
  zona?: string;
}): Promise<{ id: string; telefono: string; password: string }> {
  const password = opts.password ?? 'clave123';
  const passwordHash = await argon2.hash(password);
  const data: Prisma.UsuarioCreateInput = {
    rol: 'cobrador',
    nombre: opts.nombre ?? 'Cobrador Test',
    telefono: opts.telefono,
    passwordHash,
    perfilCobrador: {
      create: { zona: opts.zona },
    },
  };
  const u = await prisma.usuario.create({ data });
  return { id: u.id, telefono: opts.telefono, password };
}

async function login(app: INestApplication, telefono: string, password: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ telefono, password });
  return res.body.accessToken;
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
});

// ─────────────────────────── CAJEROS ───────────────────────────

describe('Cobrador — GET /cobrador/cajeros', () => {
  test('lista todos los cajeros ordenados por urgencia', async () => {
    const cob = await crearCobrador({ telefono: '0414-2000001' });
    const token = await login(app, cob.telefono, cob.password);

    // Cajero verde: saldo 0, sin deuda
    const c1 = await crearCajero({
      telefono: '0414-1000001',
      nombre: 'Verde',
      limiteCents: 100_000n,
      saldoCents: 0n,
    });

    // Cajero rojo por cupo: saldo = límite (pct = 1.0)
    const c2 = await crearCajero({
      telefono: '0414-1000002',
      nombre: 'Bloqueado',
      limiteCents: 100_000n,
      saldoCents: 100_000n,
      deudaDesde: new Date(),
    });

    // Cajero ámbar por días: deuda de 5 días
    const hace5dias = new Date(Date.now() - 5 * 86_400_000);
    const c3 = await crearCajero({
      telefono: '0414-1000003',
      nombre: 'Ambar',
      limiteCents: 100_000n,
      saldoCents: 50_000n,
      deudaDesde: hace5dias,
    });

    const res = await request(app.getHttpServer())
      .get('/cobrador/cajeros')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    // Bloqueado primero, luego ámbar, luego verde.
    expect(res.body[0].nombre).toBe('Bloqueado');
    expect(res.body[0].bloqueado).toBe(true);
    expect(res.body[1].nombre).toBe('Ambar');
    expect(res.body[1].semaforo).toBe('ambar');
    expect(res.body[2].nombre).toBe('Verde');
    expect(res.body[2].semaforo).toBe('verde');
  });

  test('incluye días sin conectarse y atención activa', async () => {
    const cob = await crearCobrador({ telefono: '0414-2000001' });
    const token = await login(app, cob.telefono, cob.password);

    const hace3dias = new Date(Date.now() - 3 * 86_400_000);
    const c = await crearCajero({ telefono: '0414-1000001', nombre: 'Cajero' });

    // Marcar última vez conectado hace 3 días.
    await prisma.usuario.update({
      where: { id: c.id },
      data: { ultimaVezAt: hace3dias },
    });

    // Marcar atención.
    await prisma.atencion.create({
      data: { cajeroId: c.id, cobradorId: cob.id },
    });

    const res = await request(app.getHttpServer())
      .get('/cobrador/cajeros')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body[0].diasSinConectarse).toBe(3);
    expect(res.body[0].atendidoPor).not.toBeNull();
    expect(res.body[0].atendidoPor.cobradorId).toBe(cob.id);
    expect(res.body[0].atendidoPor.nombre).toBe('Cobrador Test');
  });
});

// ─────────────────────────── COBROS ───────────────────────────

describe('Cobrador — POST /cobrador/cobros', () => {
  test('registra un cobro en efectivo USD', async () => {
    const cob = await crearCobrador({ telefono: '0414-2000001' });
    const token = await login(app, cob.telefono, cob.password);

    const caj = await crearCajero({
      telefono: '0414-1000001',
      limiteCents: 100_000n,
      saldoCents: 60_000n,
      deudaDesde: new Date(),
    });

    const res = await request(app.getHttpServer())
      .post('/cobrador/cobros')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: 'cobro-uuid-001',
        cajeroId: caj.id,
        metodo: 'efectivo_usd',
        montoCents: '30000',
        moneda: 'USD',
      });

    expect(res.status).toBe(201);
    expect(res.body.cobro.folio).toMatch(/^COB-/);
    expect(res.body.cobro.montoUsdCents).toBe('30000');
    expect(res.body.cobro.esEfectivo).toBe(true);
    expect(res.body.yaExistia).toBe(false);

    // El saldo del cajero bajó.
    const perfil = await prisma.perfilCajero.findUnique({ where: { usuarioId: caj.id } });
    expect(perfil!.saldoCents).toBe(30_000n);
  });

  test('es idempotente por clientUuid', async () => {
    const cob = await crearCobrador({ telefono: '0414-2000001' });
    const token = await login(app, cob.telefono, cob.password);

    const caj = await crearCajero({
      telefono: '0414-1000001',
      limiteCents: 100_000n,
      saldoCents: 60_000n,
      deudaDesde: new Date(),
    });

    const body = {
      clientUuid: 'cobro-uuid-dup',
      cajeroId: caj.id,
      metodo: 'efectivo_usd' as const,
      montoCents: '30000',
      moneda: 'USD',
    };

    const r1 = await request(app.getHttpServer())
      .post('/cobrador/cobros')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

    const r2 = await request(app.getHttpServer())
      .post('/cobrador/cobros')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r2.body.yaExistia).toBe(true);
    expect(r2.body.cobro.id).toBe(r1.body.cobro.id);

    // El saldo no bajó dos veces.
    const perfil = await prisma.perfilCajero.findUnique({ where: { usuarioId: caj.id } });
    expect(perfil!.saldoCents).toBe(30_000n);
  });

  test('registra un cobro en bolívares con tasa', async () => {
    const cob = await crearCobrador({ telefono: '0414-2000001' });
    const token = await login(app, cob.telefono, cob.password);

    const caj = await crearCajero({
      telefono: '0414-1000001',
      limiteCents: 100_000n,
      saldoCents: 60_000n,
      deudaDesde: new Date(),
    });

    // 2_854_000 centavos de BS con tasa 285.4 → 10_000 centavos USD.
    const res = await request(app.getHttpServer())
      .post('/cobrador/cobros')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: 'cobro-bs-001',
        cajeroId: caj.id,
        metodo: 'bolivares',
        montoCents: '2854000',
        moneda: 'BS',
        tasaAplicada: '285.4',
      });

    expect(res.status).toBe(201);
    expect(res.body.cobro.montoUsdCents).toBe('10000');
    expect(res.body.cobro.esEfectivo).toBe(false);
  });

  test('rechaza cobro en BS sin tasa', async () => {
    const cob = await crearCobrador({ telefono: '0414-2000001' });
    const token = await login(app, cob.telefono, cob.password);

    const caj = await crearCajero({
      telefono: '0414-1000001',
      limiteCents: 100_000n,
      saldoCents: 60_000n,
    });

    const res = await request(app.getHttpServer())
      .post('/cobrador/cobros')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: 'cobro-bs-notasa',
        cajeroId: caj.id,
        metodo: 'bolivares',
        montoCents: '2854000',
        moneda: 'BS',
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('TASA_REQUERIDA');
  });
});

// ─────────────────────────── ANULAR COBRO ───────────────────────────

describe('Cobrador — POST /cobrador/cobros/:id/anular', () => {
  test('anula un cobro propio con motivo válido', async () => {
    const cob = await crearCobrador({ telefono: '0414-2000001' });
    const token = await login(app, cob.telefono, cob.password);

    const caj = await crearCajero({
      telefono: '0414-1000001',
      limiteCents: 100_000n,
      saldoCents: 60_000n,
      deudaDesde: new Date(),
    });

    const cobroRes = await request(app.getHttpServer())
      .post('/cobrador/cobros')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: 'cobro-anular-001',
        cajeroId: caj.id,
        metodo: 'efectivo_usd',
        montoCents: '30000',
        moneda: 'USD',
      });

    const res = await request(app.getHttpServer())
      .post(`/cobrador/cobros/${cobroRes.body.cobro.id}/anular`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'El cajero pagó dos veces el mismo monto' });

    expect(res.status).toBe(200);
    expect(res.body.anuladoAt).not.toBeNull();
    expect(res.body.motivoAnulacion).toBe('El cajero pagó dos veces el mismo monto');

    // El saldo volvió a subir.
    const perfil = await prisma.perfilCajero.findUnique({ where: { usuarioId: caj.id } });
    expect(perfil!.saldoCents).toBe(60_000n);
  });

  test('un cobrador no puede anular el cobro de otro', async () => {
    const cob1 = await crearCobrador({ telefono: '0414-2000001', nombre: 'Cob1' });
    const cob2 = await crearCobrador({ telefono: '0414-2000002', nombre: 'Cob2' });
    const token1 = await login(app, cob1.telefono, cob1.password);
    const token2 = await login(app, cob2.telefono, cob2.password);

    const caj = await crearCajero({
      telefono: '0414-1000001',
      limiteCents: 100_000n,
      saldoCents: 60_000n,
      deudaDesde: new Date(),
    });

    // Cob1 registra el cobro.
    const cobroRes = await request(app.getHttpServer())
      .post('/cobrador/cobros')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        clientUuid: 'cobro-cross-001',
        cajeroId: caj.id,
        metodo: 'efectivo_usd',
        montoCents: '30000',
        moneda: 'USD',
      });

    // Cob2 intenta anularlo.
    const res = await request(app.getHttpServer())
      .post(`/cobrador/cobros/${cobroRes.body.cobro.id}/anular`)
      .set('Authorization', `Bearer ${token2}`)
      .send({ motivo: 'Motivo suficientemente largo' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NO_ENCONTRADO');
  });

  test('rechaza motivo menor de 10 caracteres', async () => {
    const cob = await crearCobrador({ telefono: '0414-2000001' });
    const token = await login(app, cob.telefono, cob.password);

    const caj = await crearCajero({
      telefono: '0414-1000001',
      limiteCents: 100_000n,
      saldoCents: 60_000n,
    });

    const cobroRes = await request(app.getHttpServer())
      .post('/cobrador/cobros')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: 'cobro-motivo-001',
        cajeroId: caj.id,
        metodo: 'efectivo_usd',
        montoCents: '30000',
        moneda: 'USD',
      });

    const res = await request(app.getHttpServer())
      .post(`/cobrador/cobros/${cobroRes.body.cobro.id}/anular`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'corto' });

    expect(res.status).toBe(400);
  });
});

// ─────────────────────────── CIERRES ───────────────────────────

describe('Cobrador — Cierres', () => {
  test('GET /cobrador/cierre-actual devuelve estructura vacía sin cobros', async () => {
    const cob = await crearCobrador({ telefono: '0414-2000001' });
    const token = await login(app, cob.telefono, cob.password);

    const res = await request(app.getHttpServer())
      .get('/cobrador/cierre-actual')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBeNull();
    expect(res.body.estado).toBe('abierto');
    expect(res.body.cobros).toHaveLength(0);
  });

  test('GET /cobrador/cierre-actual devuelve el cierre con cobros', async () => {
    const cob = await crearCobrador({ telefono: '0414-2000001' });
    const token = await login(app, cob.telefono, cob.password);

    const caj = await crearCajero({
      telefono: '0414-1000001',
      limiteCents: 100_000n,
      saldoCents: 60_000n,
      deudaDesde: new Date(),
    });

    await request(app.getHttpServer())
      .post('/cobrador/cobros')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: 'cobro-cierre-001',
        cajeroId: caj.id,
        metodo: 'efectivo_usd',
        montoCents: '30000',
        moneda: 'USD',
      });

    const res = await request(app.getHttpServer())
      .get('/cobrador/cierre-actual')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).not.toBeNull();
    expect(res.body.cobros).toHaveLength(1);
    expect(res.body.totalRegistradoCents).toBe('30000');
  });

  test('POST /cobrador/cierres/:id/enviar cierra el día', async () => {
    const cob = await crearCobrador({ telefono: '0414-2000001' });
    const token = await login(app, cob.telefono, cob.password);

    const caj = await crearCajero({
      telefono: '0414-1000001',
      limiteCents: 100_000n,
      saldoCents: 60_000n,
      deudaDesde: new Date(),
    });

    // Cobro en efectivo.
    await request(app.getHttpServer())
      .post('/cobrador/cobros')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: 'cobro-enviar-001',
        cajeroId: caj.id,
        metodo: 'efectivo_usd',
        montoCents: '30000',
        moneda: 'USD',
      });

    // Cobro digital.
    await request(app.getHttpServer())
      .post('/cobrador/cobros')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: 'cobro-enviar-002',
        cajeroId: caj.id,
        metodo: 'pago_movil',
        montoCents: '20000',
        moneda: 'USD',
      });

    const cierreRes = await request(app.getHttpServer())
      .get('/cobrador/cierre-actual')
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app.getHttpServer())
      .post(`/cobrador/cierres/${cierreRes.body.id}/enviar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ efectivoDeclaradoCents: '30000' });

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('enviado');
    expect(res.body.efectivoDeclaradoCents).toBe('30000');
    expect(res.body.digitalCents).toBe('20000');
    expect(res.body.totalRegistradoCents).toBe('50000');
    expect(res.body.enviadoAt).not.toBeNull();
  });

  test('enviar un cierre con cobros sin sincronizar falla', async () => {
    const cob = await crearCobrador({ telefono: '0414-2000001' });
    const token = await login(app, cob.telefono, cob.password);

    const caj = await crearCajero({
      telefono: '0414-1000001',
      limiteCents: 100_000n,
      saldoCents: 60_000n,
      deudaDesde: new Date(),
    });

    await request(app.getHttpServer())
      .post('/cobrador/cobros')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: 'cobro-pendiente-001',
        cajeroId: caj.id,
        metodo: 'efectivo_usd',
        montoCents: '30000',
        moneda: 'USD',
      });

    // Marcar el cobro como sin sincronizar (simular offline).
    await prisma.cobro.updateMany({
      where: { clientUuid: 'cobro-pendiente-001' },
      data: { sincronizadoAt: null },
    });

    const cierreRes = await request(app.getHttpServer())
      .get('/cobrador/cierre-actual')
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app.getHttpServer())
      .post(`/cobrador/cierres/${cierreRes.body.id}/enviar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ efectivoDeclaradoCents: '30000' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CIERRE_NO_ABIERTO');
  });

  test('GET /cobrador/cierres historial paginado', async () => {
    const cob = await crearCobrador({ telefono: '0414-2000001' });
    const token = await login(app, cob.telefono, cob.password);

    const caj = await crearCajero({
      telefono: '0414-1000001',
      limiteCents: 100_000n,
      saldoCents: 60_000n,
    });

    // Crear un cierre con un cobro.
    await request(app.getHttpServer())
      .post('/cobrador/cobros')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: 'cobro-historial-001',
        cajeroId: caj.id,
        metodo: 'efectivo_usd',
        montoCents: '30000',
        moneda: 'USD',
      });

    const res = await request(app.getHttpServer())
      .get('/cobrador/cierres')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });
});

// ─────────────────────────── ATENCIONES ───────────────────────────

describe('Cobrador — Atenciones', () => {
  test('marca y libera atención sobre un cajero', async () => {
    const cob = await crearCobrador({ telefono: '0414-2000001' });
    const token = await login(app, cob.telefono, cob.password);

    const caj = await crearCajero({ telefono: '0414-1000001' });

    const marcar = await request(app.getHttpServer())
      .post('/cobrador/atenciones')
      .set('Authorization', `Bearer ${token}`)
      .send({ cajeroId: caj.id });

    expect(marcar.status).toBe(201);
    expect(marcar.body.cajeroId).toBe(caj.id);
    expect(marcar.body.cobradorId).toBe(cob.id);
    expect(marcar.body.liberadaAt).toBeNull();

    const liberar = await request(app.getHttpServer())
      .delete(`/cobrador/atenciones/${caj.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(liberar.status).toBe(200);
    expect(liberar.body.liberadaAt).not.toBeNull();
  });

  test('dos cobradores pueden marcar atención sobre cajeros distintos sin interferirse', async () => {
    const cob1 = await crearCobrador({ telefono: '0414-2000001', nombre: 'Cob1' });
    const cob2 = await crearCobrador({ telefono: '0414-2000002', nombre: 'Cob2' });
    const token1 = await login(app, cob1.telefono, cob1.password);
    const token2 = await login(app, cob2.telefono, cob2.password);

    const caj1 = await crearCajero({ telefono: '0414-1000001', nombre: 'Caj1' });
    const caj2 = await crearCajero({ telefono: '0414-1000002', nombre: 'Caj2' });

    const r1 = await request(app.getHttpServer())
      .post('/cobrador/atenciones')
      .set('Authorization', `Bearer ${token1}`)
      .send({ cajeroId: caj1.id });

    const r2 = await request(app.getHttpServer())
      .post('/cobrador/atenciones')
      .set('Authorization', `Bearer ${token2}`)
      .send({ cajeroId: caj2.id });

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r1.body.cobradorId).toBe(cob1.id);
    expect(r2.body.cobradorId).toBe(cob2.id);
  });

  test('un cobrador no puede marcar atención sobre un cajero ya atendido por otro', async () => {
    const cob1 = await crearCobrador({ telefono: '0414-2000001', nombre: 'Cob1' });
    const cob2 = await crearCobrador({ telefono: '0414-2000002', nombre: 'Cob2' });
    const token1 = await login(app, cob1.telefono, cob1.password);
    const token2 = await login(app, cob2.telefono, cob2.password);

    const caj = await crearCajero({ telefono: '0414-1000001' });

    await request(app.getHttpServer())
      .post('/cobrador/atenciones')
      .set('Authorization', `Bearer ${token1}`)
      .send({ cajeroId: caj.id });

    const r2 = await request(app.getHttpServer())
      .post('/cobrador/atenciones')
      .set('Authorization', `Bearer ${token2}`)
      .send({ cajeroId: caj.id });

    expect(r2.status).toBe(409);
    expect(r2.body.code).toBe('ATENCION_EN_USO');
  });
});

// ─────────────────────────── AVISOS ───────────────────────────

describe('Cobrador — POST /cobrador/avisos', () => {
  test('envía un aviso manual a un cajero', async () => {
    const cob = await crearCobrador({ telefono: '0414-2000001' });
    const token = await login(app, cob.telefono, cob.password);

    const caj = await crearCajero({ telefono: '0414-1000001' });

    const res = await request(app.getHttpServer())
      .post('/cobrador/avisos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cajeroId: caj.id,
        titulo: 'Recordatorio de pago',
        cuerpo: 'Recuerda abonar para mantener tu semáforo en verde.',
      });

    expect(res.status).toBe(201);
    expect(res.body.tipo).toBe('cobro_manual');
    expect(res.body.titulo).toBe('Recordatorio de pago');
    expect(res.body.enviadoPorId).toBe(cob.id);
    expect(res.body.leidoAt).toBeNull();
  });
});

// ─────────────────────────── 403 PARA CAJERO ───────────────────────────

describe('Cobrador — un cajero recibe 403 en todos los endpoints', () => {
  test('403 en GET /cobrador/cajeros', async () => {
    const caj = await crearCajero({ telefono: '0414-1000001' });
    const token = await login(app, caj.telefono, caj.password);

    const res = await request(app.getHttpServer())
      .get('/cobrador/cajeros')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  test('403 en POST /cobrador/cobros', async () => {
    const caj = await crearCajero({ telefono: '0414-1000001' });
    const token = await login(app, caj.telefono, caj.password);

    const res = await request(app.getHttpServer())
      .post('/cobrador/cobros')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: 'x',
        cajeroId: 'x',
        metodo: 'efectivo_usd',
        montoCents: '1000',
        moneda: 'USD',
      });

    expect(res.status).toBe(403);
  });

  test('403 en POST /cobrador/cobros/:id/anular', async () => {
    const caj = await crearCajero({ telefono: '0414-1000001' });
    const token = await login(app, caj.telefono, caj.password);

    const res = await request(app.getHttpServer())
      .post('/cobrador/cobros/fake-id/anular')
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Motivo suficientemente largo' });

    expect(res.status).toBe(403);
  });

  test('403 en GET /cobrador/cierre-actual', async () => {
    const caj = await crearCajero({ telefono: '0414-1000001' });
    const token = await login(app, caj.telefono, caj.password);

    const res = await request(app.getHttpServer())
      .get('/cobrador/cierre-actual')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  test('403 en POST /cobrador/cierres/:id/enviar', async () => {
    const caj = await crearCajero({ telefono: '0414-1000001' });
    const token = await login(app, caj.telefono, caj.password);

    const res = await request(app.getHttpServer())
      .post('/cobrador/cierres/fake-id/enviar')
      .set('Authorization', `Bearer ${token}`)
      .send({ efectivoDeclaradoCents: '1000' });

    expect(res.status).toBe(403);
  });

  test('403 en GET /cobrador/cierres', async () => {
    const caj = await crearCajero({ telefono: '0414-1000001' });
    const token = await login(app, caj.telefono, caj.password);

    const res = await request(app.getHttpServer())
      .get('/cobrador/cierres')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  test('403 en POST /cobrador/atenciones', async () => {
    const caj = await crearCajero({ telefono: '0414-1000001' });
    const token = await login(app, caj.telefono, caj.password);

    const res = await request(app.getHttpServer())
      .post('/cobrador/atenciones')
      .set('Authorization', `Bearer ${token}`)
      .send({ cajeroId: 'fake' });

    expect(res.status).toBe(403);
  });

  test('403 en DELETE /cobrador/atenciones/:cajeroId', async () => {
    const caj = await crearCajero({ telefono: '0414-1000001' });
    const token = await login(app, caj.telefono, caj.password);

    const res = await request(app.getHttpServer())
      .delete('/cobrador/atenciones/fake')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  test('403 en POST /cobrador/avisos', async () => {
    const caj = await crearCajero({ telefono: '0414-1000001' });
    const token = await login(app, caj.telefono, caj.password);

    const res = await request(app.getHttpServer())
      .post('/cobrador/avisos')
      .set('Authorization', `Bearer ${token}`)
      .send({ cajeroId: 'fake', titulo: 'x', cuerpo: 'x' });

    expect(res.status).toBe(403);
  });
});
