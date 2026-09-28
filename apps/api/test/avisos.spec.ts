/**
 * Tests de notificaciones (avisos del sistema + manuales del cobrador).
 *
 * Se evalúan al consultar las listas, sin cron. Un episodio no se duplica.
 */

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { LedgerExceptionFilter } from '../src/ledger-exception.filter';

const TEST_URL = 'postgresql://tav:tav@localhost:5432/tav_test?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });

const TABLAS = [
  'Usuario', 'PerfilCajero', 'PerfilCobrador', 'Operacion', 'Cobro',
  'Movimiento', 'AmpliacionCredito', 'Cierre', 'Atencion', 'Aviso', 'AvisoAbono',
  'AuditLog', 'Config',
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
  email: string;
  password?: string;
  nombre?: string;
  limiteCents?: bigint;
  saldoCents?: bigint;
  deudaDesde?: Date | null;
  ultimaVezAt?: Date | null;
  zona?: string;
}): Promise<{ id: string; email: string; password: string }> {
  const password = opts.password ?? 'clave123';
  const passwordHash = await argon2.hash(password);
  const u = await prisma.usuario.create({
    data: {
      rol: 'cajero',
      nombre: opts.nombre ?? 'Cajero Test',
      email: opts.email,
      passwordHash,
      ultimaVezAt: opts.ultimaVezAt ?? null,
      perfilCajero: {
        create: {
          limiteCents: opts.limiteCents ?? 100_000n,
          saldoCents: opts.saldoCents ?? 0n,
          deudaDesde: opts.deudaDesde ?? null,
          zona: opts.zona,
        },
      },
    },
  });
  return { id: u.id, email: opts.email, password };
}

async function crearCobrador(opts: {
  email: string;
  password?: string;
  nombre?: string;
}): Promise<{ id: string; email: string; password: string }> {
  const password = opts.password ?? 'clave123';
  const passwordHash = await argon2.hash(password);
  const u = await prisma.usuario.create({
    data: {
      rol: 'cobrador',
      nombre: opts.nombre ?? 'Cobrador Test',
      email: opts.email,
      passwordHash,
      perfilCobrador: { create: {} },
    },
  });
  return { id: u.id, email: opts.email, password };
}

async function crearAdmin(opts: {
  email: string;
  password?: string;
  nombre?: string;
}): Promise<{ id: string; email: string; password: string }> {
  const password = opts.password ?? 'clave123';
  const passwordHash = await argon2.hash(password);
  const u = await prisma.usuario.create({
    data: {
      rol: 'admin',
      nombre: opts.nombre ?? 'Admin Test',
      email: opts.email,
      passwordHash,
    },
  });
  return { id: u.id, email: opts.email, password };
}

async function login(appInstance: INestApplication, email: string, password: string): Promise<string> {
  const res = await request(appInstance.getHttpServer())
    .post('/auth/login')
    .send({ email, password });
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

describe('Avisos del sistema', () => {
  test('no se duplican al consultar varias veces', async () => {
    const hace7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const cajero = await crearCajero({
      email: 'cajero-avisos1@tav.test',
      saldoCents: 100_000n,
      limiteCents: 100_000n,
      deudaDesde: hace7,
    });
    const token = await login(app, cajero.email, cajero.password);

    const r1 = await request(app.getHttpServer())
      .get('/cajero/avisos')
      .set('Authorization', `Bearer ${token}`);
    expect(r1.status).toBe(200);
    expect(r1.body.length).toBeGreaterThanOrEqual(1);

    const r2 = await request(app.getHttpServer())
      .get('/cajero/avisos')
      .set('Authorization', `Bearer ${token}`);
    expect(r2.status).toBe(200);
    expect(r2.body.length).toBe(r1.body.length);
    expect(r2.body.map((a: any) => a.id).sort()).toEqual(
      r1.body.map((a: any) => a.id).sort(),
    );
  });

  test('el mismo aviso llega al cajero y al cobrador', async () => {
    const hace7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const cajero = await crearCajero({
      email: 'cajero-avisos2@tav.test',
      saldoCents: 50_000n,
      limiteCents: 100_000n,
      deudaDesde: hace7,
    });
    const cobrador = await crearCobrador({ email: 'cobrador-avisos2@tav.test' });

    const cajeroToken = await login(app, cajero.email, cajero.password);
    const cobradorToken = await login(app, cobrador.email, cobrador.password);

    const rCajero = await request(app.getHttpServer())
      .get('/cajero/avisos')
      .set('Authorization', `Bearer ${cajeroToken}`);
    const rCobrador = await request(app.getHttpServer())
      .get('/cobrador/avisos')
      .set('Authorization', `Bearer ${cobradorToken}`);

    expect(rCajero.status).toBe(200);
    expect(rCobrador.status).toBe(200);
    expect(rCajero.body.length).toBeGreaterThanOrEqual(1);
    expect(rCobrador.body.length).toBeGreaterThanOrEqual(1);

    const idCajero = rCajero.body.find((a: any) => a.tipo === 'vencido')?.id;
    const idCobrador = rCobrador.body.find((a: any) => a.tipo === 'vencido')?.id;
    expect(idCajero).toBeDefined();
    expect(idCajero).toBe(idCobrador);
  });

  test('marcar leído queda registrado y el admin lo ve', async () => {
    const hace7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const cajero = await crearCajero({
      email: 'cajero-avisos3@tav.test',
      saldoCents: 50_000n,
      limiteCents: 100_000n,
      deudaDesde: hace7,
    });
    const admin = await crearAdmin({ email: 'admin-avisos3@tav.test' });

    const cajeroToken = await login(app, cajero.email, cajero.password);
    const adminToken = await login(app, admin.email, admin.password);

    const lista = await request(app.getHttpServer())
      .get('/cajero/avisos')
      .set('Authorization', `Bearer ${cajeroToken}`);
    const aviso = lista.body[0];

    const leer = await request(app.getHttpServer())
      .post(`/cajero/avisos/${aviso.id}/leer`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({});
    expect(leer.status).toBe(201);
    expect(leer.body.leidoAt).not.toBeNull();

    const ficha = await request(app.getHttpServer())
      .get(`/admin/cajeros/${cajero.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ficha.status).toBe(200);
    const enFicha = ficha.body.avisos.find((a: any) => a.id === aviso.id);
    expect(enFicha).toBeDefined();
    expect(enFicha.leidoAt).not.toBeNull();
  });

  test('se resuelven automáticamente cuando desaparece la condición', async () => {
    const cajero = await crearCajero({
      email: 'cajero-avisos4@tav.test',
      saldoCents: 100_000n,
      limiteCents: 100_000n,
    });
    const token = await login(app, cajero.email, cajero.password);

    const antes = await request(app.getHttpServer())
      .get('/cajero/avisos')
      .set('Authorization', `Bearer ${token}`);
    expect(antes.body.some((a: any) => a.tipo === 'sin_cupo')).toBe(true);

    await prisma.perfilCajero.update({
      where: { usuarioId: cajero.id },
      data: { saldoCents: 0n },
    });

    const despues = await request(app.getHttpServer())
      .get('/cajero/avisos')
      .set('Authorization', `Bearer ${token}`);
    expect(despues.body.some((a: any) => a.tipo === 'sin_cupo')).toBe(false);
  });

  test('el admin recibe alerta cuando un cajero no se conecta 3 días', async () => {
    const hace4 = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    const cajero = await crearCajero({
      email: 'cajero-avisos5@tav.test',
      ultimaVezAt: hace4,
    });
    const admin = await crearAdmin({ email: 'admin-avisos5@tav.test' });
    const adminToken = await login(app, admin.email, admin.password);

    const ficha = await request(app.getHttpServer())
      .get(`/admin/cajeros/${cajero.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ficha.status).toBe(200);
    expect(ficha.body.avisos.some((a: any) => a.tipo === 'sin_conexion')).toBe(true);
  });
});

describe('Avisos manuales del cobrador', () => {
  test('el cajero lo recibe y al leerlo se resuelve', async () => {
    const cajero = await crearCajero({
      email: 'cajero-manual1@tav.test',
    });
    const cobrador = await crearCobrador({
      email: 'cobrador-manual1@tav.test',
    });

    const cajeroToken = await login(app, cajero.email, cajero.password);
    const cobradorToken = await login(app, cobrador.email, cobrador.password);

    const envio = await request(app.getHttpServer())
      .post('/cobrador/avisos')
      .set('Authorization', `Bearer ${cobradorToken}`)
      .send({
        cajeroId: cajero.id,
        titulo: 'Pasa mañana',
        cuerpo: 'Estoy en la zona este.',
      });
    expect(envio.status).toBe(201);
    const avisoId = envio.body.id;

    const lista = await request(app.getHttpServer())
      .get('/cajero/avisos')
      .set('Authorization', `Bearer ${cajeroToken}`);
    expect(lista.body.some((a: any) => a.id === avisoId)).toBe(true);

    const leer = await request(app.getHttpServer())
      .post(`/cajero/avisos/${avisoId}/leer`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({});
    expect(leer.status).toBe(201);
    expect(leer.body.resueltoAt).not.toBeNull();

    const lista2 = await request(app.getHttpServer())
      .get('/cajero/avisos')
      .set('Authorization', `Bearer ${cajeroToken}`);
    expect(lista2.body.some((a: any) => a.id === avisoId)).toBe(false);
  });
});
