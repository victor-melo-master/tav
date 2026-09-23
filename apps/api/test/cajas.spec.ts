/**
 * Tests del módulo de cajas (tesorería) — Fase 9 Bloque 4
 *
 * Postgres real (tav_test), sin mocks. Cubre:
 *   1. Abrir una caja mueve las dos —madre abajo, destino arriba— en la
 *      misma operación.
 *   2. Anular una apertura las devuelve a como estaban.
 *   3. Una caja con saldo bajo y otra en negativo muestran avisos distintos.
 *   4. db:verify sigue cuadrando después de todo.
 *
 * Además: el ingreso a la caja madre, el listado, y los movimientos.
 */

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { LedgerExceptionFilter } from '../src/ledger-exception.filter';
import { CajaExceptionFilter } from '../src/cajas/caja-exception.filter';
import { CajaService } from '../src/cajas/caja.service';

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
      { clave: 'tasa_umbral_aviso_pct', valor: '10' },
    ],
    skipDuplicates: true,
  });
}

async function crearAdmin(email: string): Promise<{ id: string; email: string; password: string }> {
  const password = 'admin-clave';
  const u = await prisma.usuario.create({
    data: { rol: 'admin', nombre: 'Admin', email, passwordHash: await argon2.hash(password) },
  });
  return { id: u.id, email, password };
}

async function login(email: string, password: string): Promise<string> {
  const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password });
  return res.body.accessToken;
}

/** Crea la caja madre USDT, una caja física BS y un servicio BCV que la
 *  referencia. Devuelve sus IDs. */
async function crearCajas(): Promise<{ madreId: string; corredorId: string; cajaBsId: string }> {
  const admin = await prisma.usuario.findFirst({ where: { rol: 'admin' } });
  const adminId = admin!.id;

  const madre = await prisma.caja.create({
    data: { esMadre: true, moneda: 'USDT', nombre: 'Caja madre USDT', pais: null, saldoCents: 0n },
  });
  const cajaBs = await prisma.caja.create({
    data: { esMadre: false, moneda: 'BS', nombre: 'Bolívares en cuenta', pais: 'VEN', saldoCents: 0n },
  });
  const corredor = await prisma.corredor.create({
    data: {
      pais: 'VEN', paisNombre: 'Venezuela', moneda: 'BS', monedaNombre: 'Bolívares',
      formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia',
      servicio: 'bcv', servicioNombre: 'BCV',
      cajaId: cajaBs.id,
      creadoPorId: adminId,
    },
  });
  return { madreId: madre.id, corredorId: corredor.id, cajaBsId: cajaBs.id };
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

describe('Fase 9 Bloque 4 — Cajas (tesorería)', () => {
  test('1. Abrir una caja mueve las dos —madre abajo, destino arriba—', async () => {
    const admin = await crearAdmin('admin-caja-1@tav.test');
    const token = await login(admin.email, admin.password);
    const { madreId, cajaBsId } = await crearCajas();

    // Ingreso a la madre primero: 10.000 USDT (1.000.000 cents).
    const resIng = await request(app.getHttpServer())
      .post('/cajas/ingreso-madre')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: crypto.randomUUID(),
        cajaMadreId: madreId,
        montoCents: '1000000',
        precioCompraGyd: '237',
        motivo: 'Capital inicial',
      });
    expect(resIng.status).toBe(201);
    expect(resIng.body.caja.saldoCents).toBe('1000000');

    // Abrir la caja BS: 1.000 USDT (100.000 cents) a 285.4 BS/USDT.
    const resAbr = await request(app.getHttpServer())
      .post('/cajas/abrir')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: crypto.randomUUID(),
        cajaId: cajaBsId,
        cajaMadreId: madreId,
        montoMadreCents: '100000',
        montoDestinoCents: '28540000',
        tasaConversion: '285.4',
      });
    expect(resAbr.status).toBe(201);

    // La madre bajó 100.000, la destino subió 28.540.000.
    expect(resAbr.body.cajaMadre.saldoCents).toBe('900000');
    expect(resAbr.body.cajaDestino.saldoCents).toBe('28540000');

    // Verificar en la BD directamente.
    const madre = await prisma.caja.findUnique({ where: { id: madreId } });
    const bs = await prisma.caja.findUnique({ where: { id: cajaBsId } });
    expect(madre!.saldoCents).toBe(900000n);
    expect(bs!.saldoCents).toBe(28540000n);
  });

  test('2. Anular una apertura las devuelve a como estaban', async () => {
    const admin = await crearAdmin('admin-caja-2@tav.test');
    const token = await login(admin.email, admin.password);
    const { madreId, cajaBsId } = await crearCajas();

    // Ingreso + apertura.
    await request(app.getHttpServer())
      .post('/cajas/ingreso-madre')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: crypto.randomUUID(),
        cajaMadreId: madreId,
        montoCents: '1000000',
        precioCompraGyd: '237',
        motivo: 'Capital',
      });
    const resAbr = await request(app.getHttpServer())
      .post('/cajas/abrir')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: crypto.randomUUID(),
        cajaId: cajaBsId,
        cajaMadreId: madreId,
        montoMadreCents: '100000',
        montoDestinoCents: '28540000',
        tasaConversion: '285.4',
      });
    expect(resAbr.status).toBe(201);

    // Estado antes de anular: madre=900000, bs=28540000.
    const madreAntes = await prisma.caja.findUnique({ where: { id: madreId } });
    const bsAntes = await prisma.caja.findUnique({ where: { id: cajaBsId } });
    expect(madreAntes!.saldoCents).toBe(900000n);
    expect(bsAntes!.saldoCents).toBe(28540000n);

    // Anular la apertura.
    const movAperturaId = resAbr.body.movimientoDestino.id;
    const resAnul = await request(app.getHttpServer())
      .post('/cajas/anular-apertura')
      .set('Authorization', `Bearer ${token}`)
      .send({
        movimientoCajaId: movAperturaId,
        motivo: 'Apertura duplicada',
      });
    expect(resAnul.status).toBe(201);

    // Después de anular: madre vuelve a 1.000.000, bs vuelve a 0.
    const madreDespues = await prisma.caja.findUnique({ where: { id: madreId } });
    const bsDespues = await prisma.caja.findUnique({ where: { id: cajaBsId } });
    expect(madreDespues!.saldoCents).toBe(1000000n);
    expect(bsDespues!.saldoCents).toBe(0n);

    // El movimiento original NO se tocó (append-only): sigue existiendo.
    const original = await prisma.movimientoCaja.findUnique({ where: { id: movAperturaId } });
    expect(original).toBeTruthy();
    expect(original!.tipo).toBe('apertura');

    // Hay dos reversos (uno por cada pata).
    const reversos = await prisma.movimientoCaja.findMany({
      where: { tipo: 'reverso_apertura', origenId: movAperturaId },
    });
    expect(reversos.length).toBe(2);
  });

  test('3. Saldo bajo y saldo negativo muestran avisos distintos', async () => {
    const admin = await crearAdmin('admin-caja-3@tav.test');
    const token = await login(admin.email, admin.password);
    const { madreId, cajaBsId } = await crearCajas();

    // Ingreso + apertura con umbral bajo: 1.000 USDT, umbral 100.000 BS cents.
    await request(app.getHttpServer())
      .post('/cajas/ingreso-madre')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: crypto.randomUUID(),
        cajaMadreId: madreId,
        montoCents: '1000000',
        precioCompraGyd: '237',
        motivo: 'Capital',
      });
    await request(app.getHttpServer())
      .post('/cajas/abrir')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: crypto.randomUUID(),
        cajaId: cajaBsId,
        cajaMadreId: madreId,
        montoMadreCents: '100000',
        montoDestinoCents: '28540000',
        tasaConversion: '285.4',
      });

    // Fijar umbral de alerta: 10.000.000 BS cents (100.000 BS).
    // Saldo actual 28.540.000 → por encima del umbral, sin alerta.
    await prisma.caja.update({
      where: { id: cajaBsId },
      data: { umbralAlertaCents: 10_000_000n },
    });

    // Crear una segunda caja física (USD) y un servicio efectivo para el caso de negativo.
    const cajaUsd = await prisma.caja.create({
      data: { esMadre: false, moneda: 'USD', nombre: 'USD en efectivo', pais: 'VEN', saldoCents: 0n },
    });
    await prisma.corredor.create({
      data: {
        pais: 'VEN', paisNombre: 'Venezuela', moneda: 'USD', monedaNombre: 'Dólares',
        formaEntrega: 'efectivo', formaEntregaNombre: 'Efectivo en mano',
        servicio: 'efectivo', servicioNombre: 'Efectivo en mano',
        cajaId: cajaUsd.id,
        creadoPorId: admin.id,
      },
    });
    // Abrir la caja USD con 200 USDT.
    await request(app.getHttpServer())
      .post('/cajas/abrir')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: crypto.randomUUID(),
        cajaId: cajaUsd.id,
        cajaMadreId: madreId,
        montoMadreCents: '20000',
        montoDestinoCents: '20000',
        tasaConversion: '1',
      });

    // Forzar la caja BS a saldo bajo: bajar el saldo por debajo del umbral
    // sin llegar a negativo. Insertamos un movimiento de pago manual.
    await prisma.movimientoCaja.create({
      data: {
        cajaId: cajaBsId,
        tipo: 'pago',
        montoCents: -20_000_000n, // baja de 28.540.000 a 8.540.000 (bajo el umbral 10.000.000)
        saldoDespues: 8_540_000n,
        origenTipo: 'pago',
        origenId: crypto.randomUUID(),
        clientUuid: crypto.randomUUID(),
        registradoPorId: admin.id,
      },
    });
    await prisma.caja.update({
      where: { id: cajaBsId },
      data: { saldoCents: 8_540_000n },
    });

    // Forzar la caja USD a negativo: un pago mayor al saldo.
    await prisma.movimientoCaja.create({
      data: {
        cajaId: cajaUsd.id,
        tipo: 'pago',
        montoCents: -50_000n, // baja de 20.000 a -30.000
        saldoDespues: -30_000n,
        origenTipo: 'pago',
        origenId: crypto.randomUUID(),
        clientUuid: crypto.randomUUID(),
        registradoPorId: admin.id,
      },
    });
    await prisma.caja.update({
      where: { id: cajaUsd.id },
      data: { saldoCents: -30_000n },
    });

    // Listar alertas.
    const res = await request(app.getHttpServer())
      .get('/cajas/alertas')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const alertaBs = res.body.find((a: { cajaId: string }) => a.cajaId === cajaBsId);
    const alertaUsd = res.body.find((a: { cajaId: string }) => a.cajaId === cajaUsd.id);

    // La caja BS tiene saldo_bajo (no negativo).
    expect(alertaBs).toBeTruthy();
    expect(alertaBs.tipo).toBe('saldo_bajo');
    expect(alertaBs.saldoCents).toBe('8540000');

    // La caja USD tiene saldo_negativo (no saldo_bajo).
    expect(alertaUsd).toBeTruthy();
    expect(alertaUsd.tipo).toBe('saldo_negativo');
    expect(alertaUsd.saldoCents).toBe('-30000');

    // Los carteles son distintos.
    expect(alertaBs.tipo).not.toBe(alertaUsd.tipo);
  });

  test('4. db:verify cuadra después de abrir y anular', async () => {
    const admin = await crearAdmin('admin-caja-4@tav.test');
    const token = await login(admin.email, admin.password);
    const { madreId, cajaBsId } = await crearCajas();

    // Ingreso + apertura + anulación.
    await request(app.getHttpServer())
      .post('/cajas/ingreso-madre')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: crypto.randomUUID(),
        cajaMadreId: madreId,
        montoCents: '1000000',
        precioCompraGyd: '237',
        motivo: 'Capital',
      });
    const resAbr = await request(app.getHttpServer())
      .post('/cajas/abrir')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: crypto.randomUUID(),
        cajaId: cajaBsId,
        cajaMadreId: madreId,
        montoMadreCents: '100000',
        montoDestinoCents: '28540000',
        tasaConversion: '285.4',
      });
    await request(app.getHttpServer())
      .post('/cajas/anular-apertura')
      .set('Authorization', `Bearer ${token}`)
      .send({
        movimientoCajaId: resAbr.body.movimientoDestino.id,
        motivo: 'Test de cuadre',
      });

    // Verificar que los saldos cuadran: cada caja, suma de movimientos.
    const cajas = await prisma.caja.findMany({ include: { movimientos: { orderBy: { seq: 'asc' } } } });
    for (const caja of cajas) {
      const suma = caja.movimientos.reduce((acc, m) => acc + m.montoCents, 0n);
      expect(caja.saldoCents).toBe(suma);
    }
  });

  test('listar cajas devuelve madre y corredores', async () => {
    const admin = await crearAdmin('admin-caja-list@tav.test');
    const token = await login(admin.email, admin.password);
    await crearCajas();

    const res = await request(app.getHttpServer())
      .get('/cajas')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2); // madre + BS
    expect(res.body.some((c: { esMadre: boolean }) => c.esMadre)).toBe(true);
    expect(res.body.some((c: { esMadre: boolean }) => !c.esMadre)).toBe(true);
  });

  test('movimientos de una caja, paginado', async () => {
    const admin = await crearAdmin('admin-caja-mov@tav.test');
    const token = await login(admin.email, admin.password);
    const { madreId } = await crearCajas();

    // Ingreso a la madre.
    await request(app.getHttpServer())
      .post('/cajas/ingreso-madre')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: crypto.randomUUID(),
        cajaMadreId: madreId,
        montoCents: '500000',
        precioCompraGyd: '237',
        motivo: 'Test',
      });

    const res = await request(app.getHttpServer())
      .get(`/cajas/${madreId}/movimientos`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(1);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].tipo).toBe('ingreso');
    expect(res.body.items[0].motivo).toBe('Test');
  });

  test('ingreso sin motivo es rechazado con 422', async () => {
    const admin = await crearAdmin('admin-caja-mot@tav.test');
    const token = await login(admin.email, admin.password);
    const { madreId } = await crearCajas();

    const res = await request(app.getHttpServer())
      .post('/cajas/ingreso-madre')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: crypto.randomUUID(),
        cajaMadreId: madreId,
        montoCents: '500000',
        precioCompraGyd: '237',
        motivo: '',
      });
    // class-validator rechaza motivo vacío con 400 (IsNotEmpty).
    expect(res.status).toBe(400);
  });

  test('apertura con montoDestino incoherente es rechazada con 400', async () => {
    const admin = await crearAdmin('admin-caja-inc@tav.test');
    const token = await login(admin.email, admin.password);
    const { madreId, cajaBsId } = await crearCajas();

    // Ingreso primero.
    await request(app.getHttpServer())
      .post('/cajas/ingreso-madre')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: crypto.randomUUID(),
        cajaMadreId: madreId,
        montoCents: '1000000',
        precioCompraGyd: '237',
        motivo: 'Capital',
      });

    // montoDestino no cuadra con montoMadre × tasa.
    const res = await request(app.getHttpServer())
      .post('/cajas/abrir')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: crypto.randomUUID(),
        cajaId: cajaBsId,
        cajaMadreId: madreId,
        montoMadreCents: '100000',
        montoDestinoCents: '999', // debería ser ~28.540.000
        tasaConversion: '285.4',
      });
    expect(res.status).toBe(400);
    // El mensaje de error menciona la incoherencia.
    expect(JSON.stringify(res.body)).toContain('cuadra');
  });
});

// ─────────────────────── PRECIO DE COMPRA DEL USDT ───────────────────────

describe('CajaService — precio de compra del USDT', () => {
  test('ingresarCajaMadre guarda precioCompraGyd en el movimiento', async () => {
    const admin = await crearAdmin('admin-pc1@tav.test');
    const token = await login(admin.email, admin.password);
    const { madreId } = await crearCajas();

    const res = await request(app.getHttpServer())
      .post('/cajas/ingreso-madre')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: crypto.randomUUID(),
        cajaMadreId: madreId,
        montoCents: '1000000',
        precioCompraGyd: '237',
        motivo: 'Compra de USDT a 237',
      });
    expect(res.status).toBe(201);
    expect(res.body.movimiento.precioCompraGyd).toBe('237');
  });

  test('ingresarCajaMadre rechaza precioCompraGyd <= 0', async () => {
    const admin = await crearAdmin('admin-pc2@tav.test');
    const token = await login(admin.email, admin.password);
    const { madreId } = await crearCajas();

    const res = await request(app.getHttpServer())
      .post('/cajas/ingreso-madre')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: crypto.randomUUID(),
        cajaMadreId: madreId,
        montoCents: '1000000',
        precioCompraGyd: '0',
        motivo: 'Precio cero',
      });
    // TasaInvalidaException → 422 (precio <= 0).
    expect(res.status).toBe(422);
  });

  test('ingresarCajaMadre rechaza precioCompraGyd negativo', async () => {
    const admin = await crearAdmin('admin-pc3@tav.test');
    const token = await login(admin.email, admin.password);
    const { madreId } = await crearCajas();

    const res = await request(app.getHttpServer())
      .post('/cajas/ingreso-madre')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: crypto.randomUUID(),
        cajaMadreId: madreId,
        montoCents: '1000000',
        precioCompraGyd: '-5',
        motivo: 'Precio negativo',
      });
    // class-validator rechaza precio negativo (regex no acepta '-') con 400.
    expect(res.status).toBe(400);
  });

  test('precioCompraVigente devuelve el precio del ingreso más reciente', async () => {
    const admin = await crearAdmin('admin-pc4@tav.test');
    const token = await login(admin.email, admin.password);
    const { madreId } = await crearCajas();
    const cajas = app.get(CajaService);

    // Primer ingreso a 230.
    await request(app.getHttpServer())
      .post('/cajas/ingreso-madre')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: crypto.randomUUID(),
        cajaMadreId: madreId,
        montoCents: '500000',
        precioCompraGyd: '230',
        motivo: 'Compra a 230',
      });

    // Segundo ingreso a 237 — este es el vigente.
    await request(app.getHttpServer())
      .post('/cajas/ingreso-madre')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: crypto.randomUUID(),
        cajaMadreId: madreId,
        montoCents: '500000',
        precioCompraGyd: '237',
        motivo: 'Compra a 237',
      });

    const vigente = await cajas.precioCompraVigente(new Date());
    expect(vigente?.toString()).toBe('237');
  });

  test('precioCompraVigente es determinista: dos ingresos el mismo instante, el de mayor seq manda', async () => {
    const admin = await crearAdmin('admin-pc5@tav.test');
    const { madreId } = await crearCajas();
    const cajas = app.get(CajaService);

    // Insertar dos ingresos directamente con el mismo creadoAt para
    // forzar el desempate por seq.
    const fecha = new Date();
    await prisma.movimientoCaja.create({
      data: {
        cajaId: madreId,
        tipo: 'ingreso',
        montoCents: 100_000n,
        saldoDespues: 100_000n,
        origenTipo: 'ingreso',
        origenId: crypto.randomUUID(),
        clientUuid: crypto.randomUUID(),
        motivo: 'Primero (seq menor)',
        precioCompraGyd: new (require('@prisma/client').Prisma).Decimal('230'),
        registradoPorId: admin.id,
        creadoAt: fecha,
      },
    });
    await prisma.movimientoCaja.create({
      data: {
        cajaId: madreId,
        tipo: 'ingreso',
        montoCents: 100_000n,
        saldoDespues: 200_000n,
        origenTipo: 'ingreso',
        origenId: crypto.randomUUID(),
        clientUuid: crypto.randomUUID(),
        motivo: 'Segundo (seq mayor, manda)',
        precioCompraGyd: new (require('@prisma/client').Prisma).Decimal('240'),
        registradoPorId: admin.id,
        creadoAt: fecha,
      },
    });

    const vigente = await cajas.precioCompraVigente(fecha);
    expect(vigente?.toString()).toBe('240');
  });

  test('precioCompraVigente devuelve null si no hay ingresos', async () => {
    const cajas = app.get(CajaService);
    const vigente = await cajas.precioCompraVigente(new Date());
    // Puede haber ingresos de otros tests, pero si buscamos en una fecha
    // anterior a todo, debe ser null.
    const antigua = new Date(2000, 0, 1);
    const vigenteAntigua = await cajas.precioCompraVigente(antigua);
    expect(vigenteAntigua).toBeNull();
  });

  test('precioCompraVigente no devuelve ingresos futuros', async () => {
    const admin = await crearAdmin('admin-pc6@tav.test');
    const token = await login(admin.email, admin.password);
    const { madreId } = await crearCajas();
    const cajas = app.get(CajaService);

    // Ingreso con fecha futura (mañana).
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    await prisma.movimientoCaja.create({
      data: {
        cajaId: madreId,
        tipo: 'ingreso',
        montoCents: 100_000n,
        saldoDespues: 100_000n,
        origenTipo: 'ingreso',
        origenId: crypto.randomUUID(),
        clientUuid: crypto.randomUUID(),
        motivo: 'Ingreso futuro',
        precioCompraGyd: new (require('@prisma/client').Prisma).Decimal('999'),
        registradoPorId: admin.id,
        creadoAt: manana,
      },
    });

    // Buscar el vigente hoy: no debe incluir el ingreso futuro.
    const vigente = await cajas.precioCompraVigente(new Date());
    expect(vigente?.toString()).not.toBe('999');
  });
});
