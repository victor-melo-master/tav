/**
 * Tests de avisos de abono.
 *
 * Un aviso de abono es solo eso: una notificación del cajero al cobrador de
 * que tiene plata lista. No toca el ledger, no cambia saldo ni cupo.
 */

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient, Prisma } from '@prisma/client';
import argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';

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
  zona?: string;
}): Promise<{ id: string; email: string; password: string }> {
  const password = opts.password ?? 'clave123';
  const passwordHash = await argon2.hash(password);
  const data: Prisma.UsuarioCreateInput = {
    rol: 'cajero',
    nombre: opts.nombre ?? 'Cajero Test',
    email: opts.email,
    passwordHash,
    perfilCajero: {
      create: {
        limiteCents: opts.limiteCents ?? 100_000n,
        saldoCents: opts.saldoCents ?? 0n,
        zona: opts.zona,
      },
    },
  };
  const u = await prisma.usuario.create({ data });
  return { id: u.id, email: opts.email, password };
}

async function crearCobrador(opts: {
  email: string;
  password?: string;
  nombre?: string;
}): Promise<{ id: string; email: string; password: string }> {
  const password = opts.password ?? 'clave123';
  const passwordHash = await argon2.hash(password);
  const data: Prisma.UsuarioCreateInput = {
    rol: 'cobrador',
    nombre: opts.nombre ?? 'Cobrador Test',
    email: opts.email,
    passwordHash,
    perfilCobrador: { create: {} },
  };
  const u = await prisma.usuario.create({ data });
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

describe('Avisos de abono', () => {
  test('crear aviso no mueve el saldo ni el semáforo', async () => {
    const cajero = await crearCajero({
      email: 'cajero-aviso1@tav.test',
      saldoCents: 50_000n,
      limiteCents: 100_000n,
    });
    const token = await login(app, cajero.email, cajero.password);

    const perfilAntes = await prisma.perfilCajero.findUnique({
      where: { usuarioId: cajero.id },
    });

    const res = await request(app.getHttpServer())
      .post('/cajero/avisos-abono')
      .set('Authorization', `Bearer ${token}`)
      .send({ montoCents: '30000', nota: 'Estoy en la oficina' });

    expect(res.status).toBe(201);
    expect(res.body.estado).toBe('enviado');
    expect(res.body.montoCents).toBe('30000');
    expect(res.body.nota).toBe('Estoy en la oficina');

    const perfilDespues = await prisma.perfilCajero.findUnique({
      where: { usuarioId: cajero.id },
    });
    expect(perfilDespues?.saldoCents).toBe(perfilAntes?.saldoCents);
    expect(perfilDespues?.limiteCents).toBe(perfilAntes?.limiteCents);
  });

  test('el cobrador ve el aviso y desaparece tras un cobro', async () => {
    const cajero = await crearCajero({
      email: 'cajero-aviso2@tav.test',
      saldoCents: 80_000n,
      limiteCents: 100_000n,
      zona: 'Centro',
    });
    const cobrador = await crearCobrador({ email: 'cobrador-aviso2@tav.test' });

    const cajeroToken = await login(app, cajero.email, cajero.password);
    const cobradorToken = await login(app, cobrador.email, cobrador.password);

    await request(app.getHttpServer())
      .post('/cajero/avisos-abono')
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({ montoCents: '50000', nota: 'Voy hacia el este' });

    const listaAntes = await request(app.getHttpServer())
      .get('/cobrador/cajeros')
      .set('Authorization', `Bearer ${cobradorToken}`);

    expect(listaAntes.status).toBe(200);
    const cajeroEnLista = listaAntes.body.find((c: any) => c.id === cajero.id);
    expect(cajeroEnLista).toBeDefined();
    expect(cajeroEnLista.aviso).not.toBeNull();
    expect(cajeroEnLista.aviso.montoCents).toBe('50000');
    expect(cajeroEnLista.aviso.nota).toBe('Voy hacia el este');

    const cobro = await request(app.getHttpServer())
      .post('/cobrador/cobros')
      .set('Authorization', `Bearer ${cobradorToken}`)
      .send({
        clientUuid: randomUUID(),
        cajeroId: cajero.id,
        metodo: 'efectivo_gyd',
        montoCents: '10000',
      });
    expect(cobro.status).toBe(201);

    const listaDespues = await request(app.getHttpServer())
      .get('/cobrador/cajeros')
      .set('Authorization', `Bearer ${cobradorToken}`);

    const cajeroDespues = listaDespues.body.find((c: any) => c.id === cajero.id);
    expect(cajeroDespues.aviso).toBeNull();
  });

  test('cancelar un aviso lo oculta del cobrador', async () => {
    const cajero = await crearCajero({
      email: 'cajero-aviso3@tav.test',
      saldoCents: 10_000n,
      limiteCents: 100_000n,
    });
    const cobrador = await crearCobrador({ email: 'cobrador-aviso3@tav.test' });

    const cajeroToken = await login(app, cajero.email, cajero.password);
    const cobradorToken = await login(app, cobrador.email, cobrador.password);

    const aviso = await request(app.getHttpServer())
      .post('/cajero/avisos-abono')
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({ montoCents: '5000' });

    await request(app.getHttpServer())
      .post(`/cajero/avisos-abono/${aviso.body.id}/cancelar`)
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({});

    const lista = await request(app.getHttpServer())
      .get('/cobrador/cajeros')
      .set('Authorization', `Bearer ${cobradorToken}`);

    const cajeroEnLista = lista.body.find((c: any) => c.id === cajero.id);
    expect(cajeroEnLista.aviso).toBeNull();
  });

  test('los avisos mayores a 24h se caducan solos', async () => {
    const cajero = await crearCajero({
      email: 'cajero-aviso4@tav.test',
      saldoCents: 20_000n,
      limiteCents: 100_000n,
    });
    const cobrador = await crearCobrador({ email: 'cobrador-aviso4@tav.test' });

    const cajeroToken = await login(app, cajero.email, cajero.password);
    const cobradorToken = await login(app, cobrador.email, cobrador.password);

    const aviso = await request(app.getHttpServer())
      .post('/cajero/avisos-abono')
      .set('Authorization', `Bearer ${cajeroToken}`)
      .send({ montoCents: '5000' });

    // Simular que pasaron 25 horas.
    await prisma.avisoAbono.update({
      where: { id: aviso.body.id },
      data: { creadoAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });

    const lista = await request(app.getHttpServer())
      .get('/cobrador/cajeros')
      .set('Authorization', `Bearer ${cobradorToken}`);

    const cajeroEnLista = lista.body.find((c: any) => c.id === cajero.id);
    expect(cajeroEnLista.aviso).toBeNull();

    const dbAviso = await prisma.avisoAbono.findUnique({
      where: { id: aviso.body.id },
    });
    expect(dbAviso?.estado).toBe('caducado');
  });
});
