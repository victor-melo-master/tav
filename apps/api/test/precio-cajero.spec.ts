/**
 * Tests del modelo de precios por cajero — Fase 9 (nuevo modelo)
 *
 * Postgres real (tav_test), sin mocks. Reemplaza a tasa-corredor.spec.ts
 * (eliminado junto con PublicacionTasas/PublicacionTasaItem). Cubre:
 *   1. Un cajero puede tener precios distintos por servicio.
 *   2. Fijar precio crea una fila nueva en el historial (no actualiza).
 *   3. El historial registra autor y fecha.
 *   4. Una operación congela el precio vigente; cambiar el precio después
 *      no altera la operación registrada.
 *   5. Una operación nueva usa el precio vigente al confirmar.
 *   6. Un servicio sin precio para el cajero no es ofrecible.
 *   7. Un usuario no admin no puede fijar precios (403).
 *   8. Fijar precio para un servicio desactivado falla.
 *   9. Precio inválido (cero/negativo/no numérico) falla.
 *  10. El cálculo de deuda usa Decimal + ROUND_HALF_UP (igual que el ledger).
 */

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient, Prisma } from '@prisma/client';
import argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { LedgerExceptionFilter } from '../src/ledger-exception.filter';
import { PrecioCajeroService } from '../src/precio-cajero/precio-cajero.service';

const TEST_URL = 'postgresql://tav:tav@localhost:5432/tav_test?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });

const TABLAS = [
  'MovimientoCaja', 'Caja', 'PrecioCajeroServicio',
  'Usuario', 'PerfilCajero', 'PerfilCobrador', 'Operacion', 'Cobro',
  'Movimiento', 'AmpliacionCredito', 'Cierre', 'Atencion', 'Aviso', 'AuditLog',
  'Config', 'Corredor',
];

let app: INestApplication;
let precioCajeroService: PrecioCajeroService;

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

async function crearAdmin(email: string) {
  const password = 'admin-clave';
  const u = await prisma.usuario.create({
    data: { rol: 'admin', nombre: 'Admin', email, passwordHash: await argon2.hash(password) },
  });
  return { id: u.id, email, password };
}

async function crearCajero(email: string, limiteCents = 500_000n) {
  const password = 'clave123';
  const u = await prisma.usuario.create({
    data: {
      rol: 'cajero',
      nombre: 'Cajero Test',
      email,
      passwordHash: await argon2.hash(password),
      perfilCajero: { create: { limiteCents, saldoCents: 0n } },
    },
  });
  return { id: u.id, email, password };
}

async function crearCobrador(email: string) {
  const password = 'clave123';
  const u = await prisma.usuario.create({
    data: {
      rol: 'cobrador',
      nombre: 'Cobrador',
      email,
      passwordHash: await argon2.hash(password),
      perfilCobrador: { create: {} },
    },
  });
  return { id: u.id, email, password };
}

async function login(app: INestApplication, email: string, password: string) {
  const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password });
  return res.body.accessToken;
}

let corredorBsId: string;
let corredorUsdId: string;
let corredorDesactivadoId: string;

function operacionValida(clientUuid: string, corredorId: string) {
  return {
    clientUuid,
    tipo: 'usdt_bs',
    montoOrigenCents: '1000',
    monedaOrigen: 'USDT',
    beneficiario: {
      nombre: 'María González',
      datos: 'Banco: Banesco\nCuenta: 0134...4471\nCédula: V-12345678\nMétodo: pago_movil'
    },
    corredorId,
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
  precioCajeroService = moduleRef.get(PrecioCajeroService);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateTodo();
  await seedConfig();

  // Tres servicios: BS (BCV), USD (efectivo) y uno desactivado (Colombia).
  // Cada uno referencia una caja física por cajaId.
  const cajaBs = await prisma.caja.create({
    data: { esMadre: false, moneda: 'BS', nombre: 'Bolívares en cuenta', pais: 'VEN', saldoCents: 0n },
  });
  const cBs = await prisma.corredor.create({
    data: {
      pais: 'VEN', paisNombre: 'Venezuela', moneda: 'BS', monedaNombre: 'Bolívares',
      formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia',
      servicio: 'bcv', servicioNombre: 'BCV',
      cajaId: cajaBs.id,
      creadoPorId: 'admin-test',
    },
  });
  corredorBsId = cBs.id;

  const cajaUsd = await prisma.caja.create({
    data: { esMadre: false, moneda: 'USD', nombre: 'USD en efectivo', pais: 'VEN', saldoCents: 0n },
  });
  const cUsd = await prisma.corredor.create({
    data: {
      pais: 'VEN', paisNombre: 'Venezuela', moneda: 'USD', monedaNombre: 'Dólares',
      formaEntrega: 'efectivo', formaEntregaNombre: 'Efectivo en mano',
      servicio: 'efectivo', servicioNombre: 'Efectivo en mano',
      cajaId: cajaUsd.id,
      creadoPorId: 'admin-test',
    },
  });
  corredorUsdId = cUsd.id;

  const cajaCop = await prisma.caja.create({
    data: { esMadre: false, moneda: 'COP', nombre: 'Colombia', pais: 'COL', saldoCents: 0n },
  });
  const cDes = await prisma.corredor.create({
    data: {
      pais: 'COL', paisNombre: 'Colombia', moneda: 'COP', monedaNombre: 'Pesos',
      formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia',
      servicio: 'transferencia', servicioNombre: 'Transferencia',
      cajaId: cajaCop.id,
      creadoPorId: 'admin-test', activo: false,
    },
  });
  corredorDesactivadoId = cDes.id;
});

// ─────────────────────────── PRECIOS POR CAJERO ───────────────────────────

describe('PrecioCajeroService — precios por cajero', () => {
  test('un cajero puede tener precios distintos por servicio', async () => {
    const admin = await crearAdmin('admin@tav.test');
    const caj = await crearCajero('cajero1@tav.test');

    await precioCajeroService.fijarPrecio(caj.id, corredorBsId, '240', admin.id);
    await precioCajeroService.fijarPrecio(caj.id, corredorUsdId, '209', admin.id);

    const precios = await precioCajeroService.preciosCajero(caj.id);
    const bs = precios.find((p) => p.servicioId === corredorBsId)!;
    const usd = precios.find((p) => p.servicioId === corredorUsdId)!;
    expect(bs.precioGyd).toBe('240');
    expect(usd.precioGyd).toBe('209');
  });

  test('fijar precio crea una fila nueva en el historial (no actualiza)', async () => {
    const admin = await crearAdmin('admin@tav.test');
    const caj = await crearCajero('cajero1@tav.test');

    await precioCajeroService.fijarPrecio(caj.id, corredorBsId, '240', admin.id);
    await precioCajeroService.fijarPrecio(caj.id, corredorBsId, '250', admin.id);

    const historial = await precioCajeroService.historial(caj.id, corredorBsId);
    expect(historial).toHaveLength(2);
    // Ordenado del más reciente al más viejo.
    expect(historial[0].precioGyd.toString()).toBe('250');
    expect(historial[1].precioGyd.toString()).toBe('240');
  });

  test('el historial registra autor y fecha', async () => {
    const admin = await crearAdmin('admin@tav.test');
    const caj = await crearCajero('cajero1@tav.test');

    await precioCajeroService.fijarPrecio(caj.id, corredorBsId, '240', admin.id);
    const historial = await precioCajeroService.historial(caj.id, corredorBsId);
    expect(historial[0].fijadoPorId).toBe(admin.id);
    expect(historial[0].vigenteDesde).toBeInstanceOf(Date);
  });

  test('un servicio sin precio para el cajero no es ofrecible', async () => {
    const caj = await crearCajero('cajero1@tav.test');
    // No fijamos ningún precio.
    const ofrecibles = await precioCajeroService.serviciosOfrecibles(caj.id);
    expect(ofrecibles).toHaveLength(0);
  });

  test('fijar precio para un servicio desactivado falla', async () => {
    const admin = await crearAdmin('admin@tav.test');
    const caj = await crearCajero('cajero1@tav.test');
    await expect(
      precioCajeroService.fijarPrecio(caj.id, corredorDesactivadoId, '240', admin.id),
    ).rejects.toThrow(/desactivado/i);
  });

  test('precio cero o negativo falla', async () => {
    const admin = await crearAdmin('admin@tav.test');
    const caj = await crearCajero('cajero1@tav.test');
    await expect(
      precioCajeroService.fijarPrecio(caj.id, corredorBsId, '0', admin.id),
    ).rejects.toThrow(/positivo/i);
    await expect(
      precioCajeroService.fijarPrecio(caj.id, corredorBsId, '-5', admin.id),
    ).rejects.toThrow(/positivo/i);
  });

  test('fijar precio para un cajero inexistente falla', async () => {
    const admin = await crearAdmin('admin@tav.test');
    await expect(
      precioCajeroService.fijarPrecio('no-existe', corredorBsId, '240', admin.id),
    ).rejects.toThrow(/cajero/i);
  });

  test('fijar precio para un servicio inexistente falla', async () => {
    const admin = await crearAdmin('admin@tav.test');
    const caj = await crearCajero('cajero1@tav.test');
    await expect(
      precioCajeroService.fijarPrecio(caj.id, 'no-existe', '240', admin.id),
    ).rejects.toThrow(/servicio/i);
  });
});

// ─────────────────────────── CÁLCULO DE DEUDA ───────────────────────────

describe('PrecioCajeroService.calcularDeudaGydCents', () => {
  test('100 USD a 240 = 24.000 GYD (2400000 cents)', () => {
    // 100 USD = 10000 cents. 10000 × 240 = 2.400.000 cents = 24.000 GYD.
    const deuda = PrecioCajeroService.calcularDeudaGydCents(10_000n, new Prisma.Decimal('240'));
    expect(deuda).toBe(2_400_000n);
  });

  test('100 USD a 255.5 = 25.550 GYD (2555000 cents)', () => {
    const deuda = PrecioCajeroService.calcularDeudaGydCents(10_000n, new Prisma.Decimal('255.5'));
    expect(deuda).toBe(2_555_000n);
  });

  test('redondeo half-up: 100 USD a 240.00005 = 2400000.5 → 2400001 cents', () => {
    // 10000 × 240.00005 = 2400000.5 → redondea a 2400001.
    const deuda = PrecioCajeroService.calcularDeudaGydCents(10_000n, new Prisma.Decimal('240.00005'));
    expect(deuda).toBe(2_400_001n);
  });

  test('no usa punto flotante: 285.4 exacto', () => {
    const deuda = PrecioCajeroService.calcularDeudaGydCents(10_000n, new Prisma.Decimal('285.4'));
    expect(deuda).toBe(2_854_000n); // 28540 GYD
  });
});

// ─────────────────────────── OPERACIÓN CONGELA PRECIO ───────────────────────────

describe('Operación congela el precio aplicado', () => {
  test('una operación nueva usa el precio vigente al confirmar', async () => {
    const admin = await crearAdmin('admin@tav.test');
    const caj = await crearCajero('cajero1@tav.test');
    await precioCajeroService.fijarPrecio(caj.id, corredorBsId, '240', admin.id);

    const token = await login(app, caj.email, caj.password);
    const res = await request(app.getHttpServer())
      .post('/cajero/operaciones')
      .set('Authorization', `Bearer ${token}`)
      .send(operacionValida('op-uuid-001', corredorBsId));

    expect(res.status).toBe(201);
    expect(res.body.operacion.tasaAplicada).toBe('240');
  });

  test('cambiar el precio después no altera la operación registrada', async () => {
    const admin = await crearAdmin('admin@tav.test');
    const caj = await crearCajero('cajero1@tav.test');
    await precioCajeroService.fijarPrecio(caj.id, corredorBsId, '240', admin.id);

    const token = await login(app, caj.email, caj.password);
    const res = await request(app.getHttpServer())
      .post('/cajero/operaciones')
      .set('Authorization', `Bearer ${token}`)
      .send(operacionValida('op-uuid-001', corredorBsId));
    const opId = res.body.operacion.id;
    expect(res.body.operacion.tasaAplicada).toBe('240');

    // Cambiar el precio a 250.
    await precioCajeroService.fijarPrecio(caj.id, corredorBsId, '250', admin.id);

    // La operación registrada sigue con el precio congelado (240).
    const op = await prisma.operacion.findUniqueOrThrow({ where: { id: opId } });
    expect(op.tasaAplicada.toString()).toBe('240');
  });

  test('una operación sin precio fijado falla con error claro', async () => {
    const caj = await crearCajero('cajero1@tav.test');
    // No fijamos precio.
    const token = await login(app, caj.email, caj.password);
    const res = await request(app.getHttpServer())
      .post('/cajero/operaciones')
      .set('Authorization', `Bearer ${token}`)
      .send(operacionValida('op-uuid-sin-precio', corredorBsId));
    expect(res.status).toBe(404);
  });

  test('el servidor calcula la deuda: 100 USD a 240 = 24.000 GYD', async () => {
    // El cajero manda solo monto en dólares; el servidor calcula la deuda
    // con el precio vigente. 100 USD = 10000 cents × 240 = 2.400.000 cents
    // = 24.000 GYD. El cliente NO manda totalCents.
    const admin = await crearAdmin('admin@tav.test');
    const caj = await crearCajero('cajero1@tav.test', 100_000_000n);
    await precioCajeroService.fijarPrecio(caj.id, corredorBsId, '240', admin.id);

    const token = await login(app, caj.email, caj.password);
    const res = await request(app.getHttpServer())
      .post('/cajero/operaciones')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...operacionValida('op-deuda-calc', corredorBsId),
        montoOrigenCents: '10000', // 100 USD
      });

    expect(res.status).toBe(201);
    expect(res.body.operacion.tasaAplicada).toBe('240');
    expect(res.body.operacion.totalCents).toBe('2400000'); // 24.000 GYD
    expect(res.body.operacion.montoOrigenCents).toBe('10000');
  });

  test('el servidor deriva la moneda destino del servicio', async () => {
    // El cliente no manda monedaDestino; el servidor la deriva del servicio.
    const admin = await crearAdmin('admin@tav.test');
    const caj = await crearCajero('cajero1@tav.test', 100_000_000n);
    await precioCajeroService.fijarPrecio(caj.id, corredorBsId, '240', admin.id);

    const token = await login(app, caj.email, caj.password);
    const res = await request(app.getHttpServer())
      .post('/cajero/operaciones')
      .set('Authorization', `Bearer ${token}`)
      .send(operacionValida('op-moneda-destino', corredorBsId));

    expect(res.status).toBe(201);
    expect(res.body.operacion.monedaDestino).toBe('BS');
  });

  test('reintento idempotente no crea una segunda deuda', async () => {
    const admin = await crearAdmin('admin@tav.test');
    const caj = await crearCajero('cajero1@tav.test');
    await precioCajeroService.fijarPrecio(caj.id, corredorBsId, '240', admin.id);

    const token = await login(app, caj.email, caj.password);
    const r1 = await request(app.getHttpServer())
      .post('/cajero/operaciones')
      .set('Authorization', `Bearer ${token}`)
      .send(operacionValida('op-dup', corredorBsId));
    const r2 = await request(app.getHttpServer())
      .post('/cajero/operaciones')
      .set('Authorization', `Bearer ${token}`)
      .send(operacionValida('op-dup', corredorBsId));

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r2.body.yaExistia).toBe(true);
    expect(r1.body.operacion.id).toBe(r2.body.operacion.id);

    const movs = await prisma.movimiento.findMany({ where: { cajeroId: caj.id } });
    expect(movs).toHaveLength(1);
  });
});

// ─────────────────────────── AUTORIZACIÓN ───────────────────────────

describe('Autorización de precios', () => {
  test('un cajero no puede fijar precios (403)', async () => {
    const caj = await crearCajero('cajero1@tav.test');
    const token = await login(app, caj.email, caj.password);
    const res = await request(app.getHttpServer())
      .post(`/admin/cajeros/${caj.id}/precios`)
      .set('Authorization', `Bearer ${token}`)
      .send({ servicioId: corredorBsId, precioGyd: '240' });
    expect(res.status).toBe(403);
  });

  test('un cobrador no puede fijar precios (403)', async () => {
    const cob = await crearCobrador('cob1@tav.test');
    const caj = await crearCajero('cajero1@tav.test');
    const token = await login(app, cob.email, cob.password);
    const res = await request(app.getHttpServer())
      .post(`/admin/cajeros/${caj.id}/precios`)
      .set('Authorization', `Bearer ${token}`)
      .send({ servicioId: corredorBsId, precioGyd: '240' });
    expect(res.status).toBe(403);
  });

  test('un admin puede fijar precios', async () => {
    const admin = await crearAdmin('admin@tav.test');
    const caj = await crearCajero('cajero1@tav.test');
    const token = await login(app, admin.email, admin.password);
    const res = await request(app.getHttpServer())
      .post(`/admin/cajeros/${caj.id}/precios`)
      .set('Authorization', `Bearer ${token}`)
      .send({ servicioId: corredorBsId, precioGyd: '240' });
    expect(res.status).toBe(201);
    expect(res.body.precioGyd).toBe('240');
  });

  test('GET /admin/cajeros/:id/precios devuelve los servicios sin precio marcados', async () => {
    const admin = await crearAdmin('admin@tav.test');
    const caj = await crearCajero('cajero1@tav.test');
    await precioCajeroService.fijarPrecio(caj.id, corredorBsId, '240', admin.id);

    const token = await login(app, admin.email, admin.password);
    const res = await request(app.getHttpServer())
      .get(`/admin/cajeros/${caj.id}/precios`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // Dos servicios activos (BS y USD); solo BS tiene precio.
    const bs = res.body.find((p: { servicioId: string }) => p.servicioId === corredorBsId);
    const usd = res.body.find((p: { servicioId: string }) => p.servicioId === corredorUsdId);
    expect(bs.precioGyd).toBe('240');
    expect(usd.precioGyd).toBeNull();
  });

  test('GET /admin/cajeros/:id/precios/historial devuelve los cambios ordenados', async () => {
    const admin = await crearAdmin('admin@tav.test');
    const caj = await crearCajero('cajero1@tav.test');
    await precioCajeroService.fijarPrecio(caj.id, corredorBsId, '240', admin.id);
    await precioCajeroService.fijarPrecio(caj.id, corredorBsId, '250', admin.id);

    const token = await login(app, admin.email, admin.password);
    const res = await request(app.getHttpServer())
      .get(`/admin/cajeros/${caj.id}/precios/historial`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].precioGyd).toBe('250');
    expect(res.body[1].precioGyd).toBe('240');
  });

  test('precio no numérico falla con 400', async () => {
    const admin = await crearAdmin('admin@tav.test');
    const caj = await crearCajero('cajero1@tav.test');
    const token = await login(app, admin.email, admin.password);
    const res = await request(app.getHttpServer())
      .post(`/admin/cajeros/${caj.id}/precios`)
      .set('Authorization', `Bearer ${token}`)
      .send({ servicioId: corredorBsId, precioGyd: 'abc' });
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────── CORREDORES (servicios ofrecibles) ───────────────────────────

describe('GET /cajero/corredores — servicios ofrecibles', () => {
  test('solo devuelve servicios con precio fijado para el cajero', async () => {
    const admin = await crearAdmin('admin@tav.test');
    const caj = await crearCajero('cajero1@tav.test');
    await precioCajeroService.fijarPrecio(caj.id, corredorBsId, '240', admin.id);
    // USD no tiene precio: no debe aparecer.

    const token = await login(app, caj.email, caj.password);
    const res = await request(app.getHttpServer())
      .get('/cajero/corredores')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(corredorBsId);
    expect(res.body[0].precioGyd).toBe('240');
    // No expone margen ni patas (ya no existen).
    expect(res.body[0].margen).toBeUndefined();
    expect(res.body[0].pataBase).toBeUndefined();
    expect(res.body[0].pataDestino).toBeUndefined();
  });

  test('un cajero con dos precios ve dos servicios', async () => {
    const admin = await crearAdmin('admin@tav.test');
    const caj = await crearCajero('cajero1@tav.test');
    await precioCajeroService.fijarPrecio(caj.id, corredorBsId, '240', admin.id);
    await precioCajeroService.fijarPrecio(caj.id, corredorUsdId, '209', admin.id);

    const token = await login(app, caj.email, caj.password);
    const res = await request(app.getHttpServer())
      .get('/cajero/corredores')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body).toHaveLength(2);
  });
});
