/**
 * Tests de autenticación y roles — Fase 3
 *
 * Postgres real (tav_test), sin mocks. La app NestJS se levanta con
 * supertest para probar guards, tokens y controladores de verdad.
 *
 * Cobertura pedida:
 *   - login correcto
 *   - contraseña incorrecta
 *   - token expirado
 *   - refresh válido e inválido
 *   - cajero recibe 403 al llamar un endpoint @Roles('admin')
 */

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient, Prisma } from '@prisma/client';
import argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { JwtService } from '@nestjs/jwt';

const TEST_URL = 'postgresql://tav:tav@localhost:5432/tav_test?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });

const TABLAS = [
  'Usuario', 'PerfilCajero', 'PerfilCobrador', 'Operacion', 'Cobro',
  'Movimiento', 'AmpliacionCredito', 'Cierre', 'Atencion', 'Aviso', 'AuditLog',
  'Config',
];

let app: INestApplication;
let jwtService: JwtService;

async function truncateTodo() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLAS.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}

async function crearUsuario(opts: {
  rol: 'admin' | 'cajero' | 'cobrador';
  email: string;
  telefono?: string;
  password: string;
  nombre?: string;
  limiteCents?: bigint;
}): Promise<{ id: string; email: string; password: string }> {
  const passwordHash = await argon2.hash(opts.password);
  const data: Prisma.UsuarioCreateInput = {
    rol: opts.rol,
    nombre: opts.nombre ?? opts.rol,
    email: opts.email,
    telefono: opts.telefono,
    passwordHash,
  };
  if (opts.rol === 'cajero') {
    data.perfilCajero = { create: { limiteCents: opts.limiteCents ?? 100_000n } };
  } else if (opts.rol === 'cobrador') {
    data.perfilCobrador = { create: {} };
  }
  const u = await prisma.usuario.create({ data });
  return { id: u.id, email: opts.email, password: opts.password };
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  jwtService = moduleRef.get(JwtService);
  await app.init();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateTodo();
});

// ─────────────────────────── LOGIN ───────────────────────────

describe('Auth — login', () => {
  test('login correcto devuelve access + refresh y datos del usuario', async () => {
    const u = await crearUsuario({
      rol: 'cajero',
      email: '0414-1111111@tav.test',
      password: 'clave123',
      limiteCents: 100_000n,
    });

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: u.email, password: u.password });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.usuario.id).toBe(u.id);
    expect(res.body.usuario.rol).toBe('cajero');
    expect(res.body.usuario.nombre).toBe('cajero');
    // no se filtra el hash
    expect(res.body.usuario.passwordHash).toBeUndefined();
    // perfil cajero incluido
    expect(res.body.usuario.perfilCajero).toBeTruthy();
    expect(res.body.usuario.perfilCajero.limiteCents).toBe('100000');
  });

  test('contraseña incorrecta devuelve 401', async () => {
    await crearUsuario({
      rol: 'cajero',
      email: '0414-2222222@tav.test',
      password: 'clave-correcta',
    });

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: '0414-2222222@tav.test', password: 'clave-incorrecta' });

    expect(res.status).toBe(401);
  });

  test('teléfono inexistente devuelve 401 (no revela si existe)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'inexistente@tav.test', password: 'x' });

    expect(res.status).toBe(401);
  });
});

// ─────────────────────────── TOKEN EXPIRADO ───────────────────────────

describe('Auth — token expirado', () => {
  test('access token expirado devuelve 401', async () => {
    const u = await crearUsuario({
      rol: 'cajero',
      email: '0414-3333333@tav.test',
      password: 'clave',
    });

    // firmar un token que ya expiró (expira en 1 segundo, esperamos)
    const token = await jwtService.signAsync(
      { sub: u.id, rol: 'cajero', nombre: 'cajero' },
      { expiresIn: '1s' },
    );
    await new Promise((r) => setTimeout(r, 1500));

    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });
});

// ─────────────────────────── REFRESH ───────────────────────────

describe('Auth — refresh', () => {
  test('refresh válido devuelve tokens nuevos', async () => {
    const u = await crearUsuario({
      rol: 'cajero',
      email: '0414-4444444@tav.test',
      password: 'clave',
    });

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: u.email, password: u.password });

    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    // el refresh token nuevo debe ser válido (verificable con /auth/me)
    const meRes = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(meRes.status).toBe(200);
  });

  test('refresh inválido (basura) devuelve 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'esto-no-es-un-jwt' });

    expect(res.status).toBe(401);
  });

  test('refresh con token firmado con otro secreto devuelve 401', async () => {
    const otroJwt = new JwtService({
      secret: 'otro-secreto-totalmente-diferente',
    });

    const token = await otroJwt.signAsync({ sub: 'x', rol: 'cajero', nombre: 'x' });

    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: token });

    expect(res.status).toBe(401);
  });
});

// ─────────────────────────── ROLES (403) ───────────────────────────

describe('Auth — roles', () => {
  test('cajero recibe 403 al llamar POST /admin/usuarios', async () => {
    const u = await crearUsuario({
      rol: 'cajero',
      email: '0414-5555555@tav.test',
      password: 'clave',
      limiteCents: 100_000n,
    });

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: u.email, password: u.password });

    const res = await request(app.getHttpServer())
      .post('/admin/usuarios')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({
        nombre: 'Nuevo Cajero',
        email: '0414-9999999@tav.test',
        rol: 'cajero',
        password: 'clave123',
        limiteCents: '50000',
      });

    expect(res.status).toBe(403);
  });

  test('admin puede llamar POST /admin/usuarios y crea un cajero', async () => {
    const admin = await crearUsuario({
      rol: 'admin',
      email: '0414-6666666@tav.test',
      password: 'admin-clave',
    });

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: admin.email, password: admin.password });

    const res = await request(app.getHttpServer())
      .post('/admin/usuarios')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({
        nombre: 'Cajero Nuevo',
        email: '0414-7777777@tav.test',
        rol: 'cajero',
        password: 'clave123',
        limiteCents: '50000',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.rol).toBe('cajero');
    expect(res.body.perfilCajero.limiteCents).toBe('50000');
    expect(res.body.passwordHash).toBeUndefined();
    // creadoPorId sale del JWT del admin
    expect(res.body.creadoPorId).toBe(admin.id);
  });

  test('sin token, endpoint protegido devuelve 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/usuarios')
      .send({
        nombre: 'x',
        email: 'x@tav.test',
        rol: 'cajero',
        password: 'x',
        limiteCents: '100',
      });

    expect(res.status).toBe(401);
  });
});

// ─────────────────────────── ME ───────────────────────────

describe('Auth — me', () => {
  test('GET /auth/me devuelve el usuario sin datos sensibles', async () => {
    const u = await crearUsuario({
      rol: 'cajero',
      email: '0414-8888888@tav.test',
      password: 'clave',
      limiteCents: 100_000n,
    });

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: u.email, password: u.password });

    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(u.id);
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.body.perfilCajero.limiteCents).toBe('100000');
  });
});

// ─────────────────────────── LOGOUT REAL ───────────────────────────

describe('Auth — logout real (tokenVersion)', () => {
  test('logout invalida el refresh token anterior', async () => {
    const u = await crearUsuario({
      rol: 'cajero',
      email: '0414-logout1@tav.test',
      password: 'clave',
    });

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: u.email, password: u.password });

    // logout incrementa tokenVersion
    const out = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(out.status).toBe(201);

    // el refresh anterior ya no sirve: tokenVersion no coincide
    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });

    expect(res.status).toBe(401);
  });

  test('logout-all invalida todas las sesiones', async () => {
    const u = await crearUsuario({
      rol: 'cajero',
      email: '0414-logout2@tav.test',
      password: 'clave',
    });

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: u.email, password: u.password });

    const out = await request(app.getHttpServer())
      .post('/auth/logout-all')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(out.status).toBe(201);

    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });

    expect(res.status).toBe(401);
  });

  test('tras logout, un login nuevo emite tokens que sí funcionan', async () => {
    const u = await crearUsuario({
      rol: 'cajero',
      email: '0414-logout3@tav.test',
      password: 'clave',
    });

    const login1 = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: u.email, password: u.password });

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${login1.body.accessToken}`);

    // login de nuevo → tokenVersion nueva en el payload
    const login2 = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: u.email, password: u.password });

    const refresh = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: login2.body.refreshToken });

    expect(refresh.status).toBe(201);
  });
});


