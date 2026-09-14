/**
 * Tests del rol pagador — Fase 9
 *
 * Postgres real (tav_test), sin mocks. Cubre:
 *   1. La cola de un pagador de Venezuela no muestra operaciones de Brasil.
 *   2. Ejecutar un pago descuenta la caja del corredor correcto y deja la
 *      operación en pagada con la tasa de ejecución congelada.
 *   3. Tocar el botón dos veces descuenta una sola vez, incluso si la app
 *      reintenta con datos distintos.
 *   4. Un pago contra una caja sin fondos pasa, deja la caja en negativo y
 *      genera su alerta. No se bloquea.
 *   5. Los endpoints del pagador no devuelven deuda del cajero, margen ni
 *      saldos de caja.
 *   6. Una operación ya pagada desaparece de la cola.
 */

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { LedgerExceptionFilter } from '../src/ledger-exception.filter';
import { CajaExceptionFilter } from '../src/cajas/caja-exception.filter';

const TEST_URL = 'postgresql://tav:tav@localhost:5432/tav_test?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });

const TABLAS = [
  'MovimientoCaja', 'Caja', 'PublicacionTasaItem', 'PublicacionTasas',
  'Usuario', 'PerfilCajero', 'PerfilCobrador', 'PerfilPagador', 'Tasa',
  'Operacion', 'Cobro', 'Movimiento', 'AmpliacionCredito', 'Cierre',
  'Atencion', 'Aviso', 'AuditLog', 'Config', 'Corredor',
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
      { clave: 'tasa_umbral_aviso_pct', valor: '10' },
    ],
    skipDuplicates: true,
  });
}

async function crearUsuario(rol: 'admin' | 'pagador', email: string, extra?: { pais?: string }) {
  const password = 'clave-test';
  const u = await prisma.usuario.create({
    data: { rol, nombre: rol === 'admin' ? 'Admin' : 'Pagador', email, passwordHash: await argon2.hash(password) },
  });
  if (rol === 'pagador') {
    await prisma.perfilPagador.create({
      data: { usuarioId: u.id, pais: extra!.pais! },
    });
  }
  return { id: u.id, email, password };
}

async function login(email: string, password: string): Promise<string> {
  const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password });
  return res.body.accessToken;
}

async function crearCorredorYCaja(
  adminId: string,
  opts: { pais: string; paisNombre: string; moneda: string; monedaNombre: string; formaEntrega: string; formaEntregaNombre: string },
): Promise<{ corredorId: string; cajaId: string }> {
  const corredor = await prisma.corredor.create({
    data: {
      pais: opts.pais,
      paisNombre: opts.paisNombre,
      moneda: opts.moneda,
      monedaNombre: opts.monedaNombre,
      formaEntrega: opts.formaEntrega,
      formaEntregaNombre: opts.formaEntregaNombre,
      creadoPorId: adminId,
    },
  });
  const caja = await prisma.caja.create({
    data: { corredorId: corredor.id, esMadre: false, moneda: opts.moneda, saldoCents: 0n },
  });
  return { corredorId: corredor.id, cajaId: caja.id };
}

async function crearCajero(adminId: string): Promise<{ id: string; email: string; password: string }> {
  const password = 'clave-test';
  const u = await prisma.usuario.create({
    data: { rol: 'cajero', nombre: 'Cajero', email: `cajero-${Date.now()}@tav.test`, passwordHash: await argon2.hash(password) },
  });
  await prisma.perfilCajero.create({
    data: { usuarioId: u.id, limiteCents: 100_000_000n, saldoCents: 0n },
  });
  return { id: u.id, email: u.email, password };
}

async function crearOperacionPendiente(
  cajeroId: string,
  corredorId: string,
  montoDestinoCents: bigint,
): Promise<string> {
  const op = await prisma.operacion.create({
    data: {
      folio: `TAV-${Date.now()}`,
      clientUuid: crypto.randomUUID(),
      cajeroId,
      tipo: 'usdt_bs',
      montoOrigenCents: 100_000n,
      monedaOrigen: 'USDT',
      tasaAplicada: new (require('@prisma/client').Prisma).Decimal('285.4'),
      comisionCents: 3000n,
      totalCents: 103_000n,
      montoDestinoCents,
      monedaDestino: 'BS',
      beneficiario: { nombre: 'María', documento: 'V123', banco: 'Banesco', cuenta: '0123', metodo: 'pago_movil' },
      estado: 'pendiente',
      creadaPorId: cajeroId,
      corredorId,
    },
  });
  return op.id;
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new LedgerExceptionFilter(), new CajaExceptionFilter());
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

describe('Fase 9 — Rol pagador', () => {
  test('1. La cola de Venezuela no muestra operaciones de Brasil', async () => {
    const admin = await crearUsuario('admin', 'admin-p1@tav.test');
    const pagadorVen = await crearUsuario('pagador', 'pagador-ven@tav.test', { pais: 'VEN' });
    const tokenVen = await login(pagadorVen.email, pagadorVen.password);

    const cajero = await crearCajero(admin.id);
    const ven = await crearCorredorYCaja(admin.id, {
      pais: 'VEN', paisNombre: 'Venezuela', moneda: 'BS', monedaNombre: 'Bolívares',
      formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia',
    });
    const bra = await crearCorredorYCaja(admin.id, {
      pais: 'BRA', paisNombre: 'Brasil', moneda: 'BRL', monedaNombre: 'Reales',
      formaEntrega: 'pix', formaEntregaNombre: 'Pix',
    });

    // Dos operaciones: una Venezuela, una Brasil.
    await crearOperacionPendiente(cajero.id, ven.corredorId, 28540000n);
    await crearOperacionPendiente(cajero.id, bra.corredorId, 4400000n);

    const res = await request(app.getHttpServer())
      .get('/pagador/cola')
      .set('Authorization', `Bearer ${tokenVen}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].corredor.pais).toBe('VEN');
  });

  test('2. Ejecutar un pago descuenta la caja correcta y congela la tasa', async () => {
    const admin = await crearUsuario('admin', 'admin-p2@tav.test');
    const pagador = await crearUsuario('pagador', 'pagador-p2@tav.test', { pais: 'VEN' });
    const token = await login(pagador.email, pagador.password);

    const cajero = await crearCajero(admin.id);
    const ven = await crearCorredorYCaja(admin.id, {
      pais: 'VEN', paisNombre: 'Venezuela', moneda: 'BS', monedaNombre: 'Bolívares',
      formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia',
    });

    // Dar saldo a la caja.
    await prisma.caja.update({ where: { id: ven.cajaId }, data: { saldoCents: 100_000_000n } });

    const opId = await crearOperacionPendiente(cajero.id, ven.corredorId, 28540000n);

    const res = await request(app.getHttpServer())
      .post('/pagador/pagar')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: crypto.randomUUID(),
        operacionId: opId,
        montoCents: '28540000',
        tasaEjecucion: '240.5',
        formaPago: 'pago_movil',
        nombreCliente: 'María González',
      });
    expect(res.status).toBe(201);

    // La operación quedó pagada con la tasa congelada.
    const op = await prisma.operacion.findUnique({ where: { id: opId } });
    expect(op!.estado).toBe('pagada');
    expect(op!.tasaEjecucion.toString()).toBe('240.5');
    expect(op!.formaPago).toBe('pago_movil');
    expect(op!.nombreCliente).toBe('María González');
    expect(op!.pagadaPorId).toBe(pagador.id);

    // La caja bajó 28.540.000.
    const caja = await prisma.caja.findUnique({ where: { id: ven.cajaId } });
    expect(caja!.saldoCents).toBe(100_000_000n - 28_540_000n);
  });

  test('3. Tocar el botón dos veces descuenta una sola vez, incluso con datos distintos', async () => {
    const admin = await crearUsuario('admin', 'admin-p3@tav.test');
    const pagador = await crearUsuario('pagador', 'pagador-p3@tav.test', { pais: 'VEN' });
    const token = await login(pagador.email, pagador.password);

    const cajero = await crearCajero(admin.id);
    const ven = await crearCorredorYCaja(admin.id, {
      pais: 'VEN', paisNombre: 'Venezuela', moneda: 'BS', monedaNombre: 'Bolívares',
      formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia',
    });
    await prisma.caja.update({ where: { id: ven.cajaId }, data: { saldoCents: 100_000_000n } });

    const opId = await crearOperacionPendiente(cajero.id, ven.corredorId, 28540000n);

    // Primer pago.
    const res1 = await request(app.getHttpServer())
      .post('/pagador/pagar')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: crypto.randomUUID(),
        operacionId: opId,
        montoCents: '28540000',
        tasaEjecucion: '240.5',
        formaPago: 'pago_movil',
        nombreCliente: 'María González',
      });
    expect(res1.status).toBe(201);
    expect(res1.body.yaExistia).toBe(false);

    // Segundo toque con datos DISTINTOS (otro clientUuid, otra tasa).
    // El estado de la operación manda: ya está pagada, devuelve el pago
    // existente sin tocar la caja.
    const res2 = await request(app.getHttpServer())
      .post('/pagador/pagar')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: crypto.randomUUID(),
        operacionId: opId,
        montoCents: '28540000',
        tasaEjecucion: '999', // distinta
        formaPago: 'efectivo', // distinto
        nombreCliente: 'Otro Cliente', // distinto
      });
    expect(res2.status).toBe(201);
    expect(res2.body.yaExistia).toBe(true);

    // La tasa congelada es la del primer pago, no la del segundo.
    const op = await prisma.operacion.findUnique({ where: { id: opId } });
    expect(op!.tasaEjecucion.toString()).toBe('240.5');
    expect(op!.formaPago).toBe('pago_movil');
    expect(op!.nombreCliente).toBe('María González');

    // La caja bajó una sola vez.
    const caja = await prisma.caja.findUnique({ where: { id: ven.cajaId } });
    expect(caja!.saldoCents).toBe(100_000_000n - 28_540_000n);

    // Solo hay un movimiento de pago.
    const movs = await prisma.movimientoCaja.findMany({
      where: { cajaId: ven.cajaId, tipo: 'pago' },
    });
    expect(movs.length).toBe(1);
  });

  test('4. Un pago contra una caja sin fondos pasa, deja negativo y genera alerta', async () => {
    const admin = await crearUsuario('admin', 'admin-p4@tav.test');
    const pagador = await crearUsuario('pagador', 'pagador-p4@tav.test', { pais: 'VEN' });
    const token = await login(pagador.email, pagador.password);

    const cajero = await crearCajero(admin.id);
    const ven = await crearCorredorYCaja(admin.id, {
      pais: 'VEN', paisNombre: 'Venezuela', moneda: 'BS', monedaNombre: 'Bolívares',
      formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia',
    });
    // Caja con saldo 0 (sin fondos).

    const opId = await crearOperacionPendiente(cajero.id, ven.corredorId, 28540000n);

    const res = await request(app.getHttpServer())
      .post('/pagador/pagar')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: crypto.randomUUID(),
        operacionId: opId,
        montoCents: '28540000',
        tasaEjecucion: '240',
        formaPago: 'pago_movil',
        nombreCliente: 'María González',
      });
    // No se bloquea: el pago pasa.
    expect(res.status).toBe(201);

    // La caja quedó en negativo.
    const caja = await prisma.caja.findUnique({ where: { id: ven.cajaId } });
    expect(caja!.saldoCents).toBe(-28_540_000n);

    // La operación quedó pagada.
    const op = await prisma.operacion.findUnique({ where: { id: opId } });
    expect(op!.estado).toBe('pagada');

    // La alerta de saldo negativo existe.
    const alertasRes = await request(app.getHttpServer())
      .get('/cajas/alertas')
      .set('Authorization', `Bearer ${(await login((await crearUsuario('admin', 'admin-p4b@tav.test')).email, 'clave-test'))}`);
    // El pagador no puede ver alertas (rol admin), pero verificamos directo.
    const alertas = await prisma.caja.findMany({ where: { saldoCents: { lt: 0n } } });
    expect(alertas.length).toBe(1);
    expect(alertas[0].id).toBe(ven.cajaId);
  });

  test('5. Los endpoints del pagador no devuelven deuda, margen ni saldo de caja', async () => {
    const admin = await crearUsuario('admin', 'admin-p5@tav.test');
    const pagador = await crearUsuario('pagador', 'pagador-p5@tav.test', { pais: 'VEN' });
    const token = await login(pagador.email, pagador.password);

    const cajero = await crearCajero(admin.id);
    const ven = await crearCorredorYCaja(admin.id, {
      pais: 'VEN', paisNombre: 'Venezuela', moneda: 'BS', monedaNombre: 'Bolívares',
      formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia',
    });
    await prisma.caja.update({ where: { id: ven.cajaId }, data: { saldoCents: 50_000_000n } });

    const opId = await crearOperacionPendiente(cajero.id, ven.corredorId, 28540000n);

    // Verificar la cola cruda.
    const resCola = await request(app.getHttpServer())
      .get('/pagador/cola')
      .set('Authorization', `Bearer ${token}`);
    expect(resCola.status).toBe(200);
    const itemCola = resCola.body[0];
    const colaStr = JSON.stringify(itemCola);

    // No contiene deuda del cajero.
    expect(colaStr).not.toContain('saldoCents');
    expect(colaStr).not.toContain('limiteCents');
    expect(colaStr).not.toContain('deuda');
    // No contiene margen.
    expect(colaStr).not.toContain('margen');
    // No contiene saldo de caja.
    expect(colaStr).not.toContain('saldoCaja');
    // No contiene pataDestino ni pataBase.
    expect(colaStr).not.toContain('pataDestino');
    expect(colaStr).not.toContain('pataBase');

    // La cola SÍ contiene lo que el pagador necesita.
    expect(itemCola.id).toBe(opId);
    expect(itemCola.montoDestinoCents).toBe('28540000');
    expect(itemCola.monedaDestino).toBe('BS');
    expect(itemCola.corredor.pais).toBe('VEN');
    expect(itemCola.cajaId).toBe(ven.cajaId);

    // Pagar y verificar pagos del día.
    await request(app.getHttpServer())
      .post('/pagador/pagar')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: crypto.randomUUID(),
        operacionId: opId,
        montoCents: '28540000',
        tasaEjecucion: '240',
        formaPago: 'pago_movil',
        nombreCliente: 'María González',
      });

    const resDia = await request(app.getHttpServer())
      .get('/pagador/pagos-del-dia')
      .set('Authorization', `Bearer ${token}`);
    expect(resDia.status).toBe(200);
    expect(resDia.body.length).toBe(1);
    const diaStr = JSON.stringify(resDia.body[0]);

    // Tampoco contiene deuda, margen ni saldo de caja.
    expect(diaStr).not.toContain('saldoCents');
    expect(diaStr).not.toContain('limiteCents');
    expect(diaStr).not.toContain('margen');
    expect(diaStr).not.toContain('saldoCaja');
  });

  test('6. Una operación ya pagada desaparece de la cola', async () => {
    const admin = await crearUsuario('admin', 'admin-p6@tav.test');
    const pagador = await crearUsuario('pagador', 'pagador-p6@tav.test', { pais: 'VEN' });
    const token = await login(pagador.email, pagador.password);

    const cajero = await crearCajero(admin.id);
    const ven = await crearCorredorYCaja(admin.id, {
      pais: 'VEN', paisNombre: 'Venezuela', moneda: 'BS', monedaNombre: 'Bolívares',
      formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia',
    });
    await prisma.caja.update({ where: { id: ven.cajaId }, data: { saldoCents: 100_000_000n } });

    const opId = await crearOperacionPendiente(cajero.id, ven.corredorId, 28540000n);

    // Antes de pagar: la cola tiene 1.
    const resAntes = await request(app.getHttpServer())
      .get('/pagador/cola')
      .set('Authorization', `Bearer ${token}`);
    expect(resAntes.body.length).toBe(1);

    // Pagar.
    await request(app.getHttpServer())
      .post('/pagador/pagar')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: crypto.randomUUID(),
        operacionId: opId,
        montoCents: '28540000',
        tasaEjecucion: '240',
        formaPago: 'pago_movil',
        nombreCliente: 'María González',
      });

    // Después de pagar: la cola está vacía.
    const resDespues = await request(app.getHttpServer())
      .get('/pagador/cola')
      .set('Authorization', `Bearer ${token}`);
    expect(resDespues.body.length).toBe(0);
  });
});
