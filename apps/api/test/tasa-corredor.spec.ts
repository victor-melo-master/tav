/**
 * Tests de tasas por corredor — Fase 9 Bloque 3
 *
 * Postgres real (tav_test), sin mocks. Cubre los seis casos pedidos:
 *   1. Mover la pata base recalcula todos los corredores.
 *   2. Publicar tasas nuevas no altera operaciones registradas antes.
 *   3. Un corredor sin tasa publicada no aparece en la lista del cajero.
 *   4. Un corredor desactivado tampoco, pero sus operaciones viejas siguen consultables.
 *   5. El endpoint del cajero no devuelve margen ni pata destino.
 *   6. Una operación con corredorId nace en pendiente y la deuda sube.
 *
 * Además: previsualizar avisa de corredores omitidos y desviaciones.
 */

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient, Prisma } from '@prisma/client';
import argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { LedgerExceptionFilter } from '../src/ledger-exception.filter';
import { TasaCorredorService } from '../src/tasa/tasa-corredor.service';

const TEST_URL = 'postgresql://tav:tav@localhost:5432/tav_test?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });

const TABLAS = [
  'MovimientoCaja', 'Caja', 'PublicacionTasaItem', 'PublicacionTasas',
  'Usuario', 'PerfilCajero', 'PerfilCobrador', 'Tasa', 'Operacion', 'Cobro',
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

async function seedTasas() {
  await prisma.tasa.createMany({
    data: [
      { id: crypto.randomUUID(), par: 'GYD_GYD', valor: 1.0, creadaPorId: 'admin-test' },
      { id: crypto.randomUUID(), par: 'USD_GYD', valor: 1.0, creadaPorId: 'admin-test' },
      { id: crypto.randomUUID(), par: 'USDT_GYD', valor: 1.0, creadaPorId: 'admin-test' },
      { id: crypto.randomUUID(), par: 'BS_GYD', valor: 0.732314, creadaPorId: 'admin-test' },
    ],
  });
}

async function crearAdmin(email: string): Promise<{ id: string; email: string; password: string }> {
  const password = 'admin-clave';
  const u = await prisma.usuario.create({
    data: { rol: 'admin', nombre: 'Admin', email, passwordHash: await argon2.hash(password) },
  });
  return { id: u.id, email, password };
}

async function crearCajero(email: string, limiteCents = 500_000n): Promise<{ id: string; email: string; password: string }> {
  const password = 'clave123';
  const u = await prisma.usuario.create({
    data: {
      rol: 'cajero', nombre: 'Cajero', email, passwordHash: await argon2.hash(password),
      perfilCajero: { create: { limiteCents, saldoCents: 0n } },
    },
  });
  return { id: u.id, email, password };
}

async function login(email: string, password: string): Promise<string> {
  const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password });
  return res.body.accessToken;
}

/** Crea los seis corredores iniciales con sus cajas. */
async function crearCorredores(): Promise<{ id: string; moneda: string; paisNombre: string }[]> {
  const specs = [
    { pais: 'VEN', paisNombre: 'Venezuela', moneda: 'BS', monedaNombre: 'Bolívares', formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia' },
    { pais: 'VEN', paisNombre: 'Venezuela', moneda: 'USD', monedaNombre: 'Dólares', formaEntrega: 'efectivo', formaEntregaNombre: 'Efectivo en mano' },
    { pais: 'BRA', paisNombre: 'Brasil', moneda: 'BRL', monedaNombre: 'Reales', formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia (Pix)' },
    { pais: 'COL', paisNombre: 'Colombia', moneda: 'COP', monedaNombre: 'Pesos colombianos', formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia' },
    { pais: 'DOM', paisNombre: 'Rep. Dominicana', moneda: 'DOP', monedaNombre: 'Pesos dominicanos', formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia' },
    { pais: 'MEX', paisNombre: 'México', moneda: 'MXN', monedaNombre: 'Pesos mexicanos', formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia' },
  ];
  const out: { id: string; moneda: string; paisNombre: string }[] = [];
  for (const s of specs) {
    const c = await prisma.corredor.create({
      data: { ...s, creadoPorId: 'admin-test' },
    });
    await prisma.caja.create({
      data: { corredorId: c.id, esMadre: false, moneda: s.moneda, saldoCents: 0n },
    });
    out.push({ id: c.id, moneda: c.moneda, paisNombre: c.paisNombre });
  }
  return out;
}

/** Payload de publicación con los seis corredores. */
function publicacionPayload(corredores: { id: string }[], pataBase: string, pataDestinoPorMoneda: Record<string, string>, margen = '2.5') {
  return {
    pataBase,
    items: corredores.map((c) => ({
      corredorId: c.id,
      pataDestino: pataDestinoPorMoneda[c.id] ?? '1',
      margen,
    })),
  };
}

function operacionConCorredor(clientUuid: string, corredorId: string) {
  return {
    clientUuid,
    tipo: 'usdt_bs',
    montoOrigenCents: '100000',
    monedaOrigen: 'USDT',
    comisionCents: '0',
    totalCents: '100000',
    monedaDestino: 'BS',
    beneficiario: { nombre: 'María', documento: 'V-123', banco: 'Banesco', cuenta: '0134...4471', metodo: 'pago_movil' },
    corredorId,
  };
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
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
  await seedTasas();
});

describe('Fase 9 Bloque 3 — Tasas por corredor', () => {
  test('1. Mover la pata base recalcula todos los corredores', async () => {
    const admin = await crearAdmin('admin-tasas-1@tav.test');
    const token = await login(admin.email, admin.password);
    const corredores = await crearCorredores();

    // Primera publicación: pata base 208, pata destino BS=285, margen 2.5%.
    const patas1: Record<string, string> = {};
    for (const c of corredores) patas1[c.id] = c.moneda === 'BS' ? '285' : '1';
    await request(app.getHttpServer())
      .post('/admin/tasas-corredor/publicar')
      .set('Authorization', `Bearer ${token}`)
      .send(publicacionPayload(corredores, '208', patas1));

    // Segunda publicación: pata base 250 (subió). Todo lo demás igual.
    await request(app.getHttpServer())
      .post('/admin/tasas-corredor/publicar')
      .set('Authorization', `Bearer ${token}`)
      .send(publicacionPayload(corredores, '250', patas1));

    // El cajero ve la tasa recalculada.
    const caj = await crearCajero('cajero-tasas-1@tav.test');
    const tokCaj = await login(caj.email, caj.password);
    const res = await request(app.getHttpServer())
      .get('/cajero/corredores')
      .set('Authorization', `Bearer ${tokCaj}`);

    expect(res.status).toBe(200);
    const corredorBs = res.body.find((c: { moneda: string }) => c.moneda === 'BS');
    expect(corredorBs).toBeTruthy();
    // tasaCotizada = (285 / 250) × (1 − 0.025) = 1.14 × 0.975 = 1.1115
    // Prisma serializa Decimal sin ceros sobrantes: "1.1115", no "1.11150000".
    expect(corredorBs.tasaCotizada).toBe('1.1115');
    // Ningún corredor quedó con la tasa vieja (285/208 × 0.975 = 1.33593750).
    expect(res.body.some((c: { tasaCotizada: string }) => c.tasaCotizada === '1.33593750')).toBe(false);
  });

  test('2. Publicar tasas nuevas no altera operaciones registradas antes', async () => {
    const admin = await crearAdmin('admin-tasas-2@tav.test');
    const token = await login(admin.email, admin.password);
    const corredores = await crearCorredores();
    const corredorBs = corredores.find((c) => c.moneda === 'BS')!;

    // Publicar tasa inicial.
    const patas: Record<string, string> = {};
    for (const c of corredores) patas[c.id] = c.moneda === 'BS' ? '285' : '1';
    await request(app.getHttpServer())
      .post('/admin/tasas-corredor/publicar')
      .set('Authorization', `Bearer ${token}`)
      .send(publicacionPayload(corredores, '208', patas));

    // Registrar una operación con esa tasa.
    const caj = await crearCajero('cajero-tasas-2@tav.test');
    const tokCaj = await login(caj.email, caj.password);
    const resOp = await request(app.getHttpServer())
      .post('/cajero/operaciones')
      .set('Authorization', `Bearer ${tokCaj}`)
      .send(operacionConCorredor('op-fase9-2', corredorBs.id));
    expect(resOp.status).toBe(201);
    const tasaOriginal = resOp.body.operacion.tasaAplicada;

    // Publicar una tasa nueva (pata base distinta).
    await request(app.getHttpServer())
      .post('/admin/tasas-corredor/publicar')
      .set('Authorization', `Bearer ${token}`)
      .send(publicacionPayload(corredores, '300', patas));

    // La operación vieja conserva su tasa congelada.
    const resDetalle = await request(app.getHttpServer())
      .get('/cajero/operaciones')
      .set('Authorization', `Bearer ${tokCaj}`);
    expect(resDetalle.body.items[0].tasaAplicada).toBe(tasaOriginal);
    // Operacion.tasaAplicada es Decimal(18,6): 1.33593750 se redondea a 1.335938.
    expect(resDetalle.body.items[0].tasaAplicada).toBe('1.335938');
  });

  test('3. Un corredor sin tasa publicada no aparece en la lista del cajero', async () => {
    const admin = await crearAdmin('admin-tasas-3@tav.test');
    const token = await login(admin.email, admin.password);
    const corredores = await crearCorredores();

    // Publicar solo 5 de los 6 corredores (omitimos Brasil).
    const sinBrasil = corredores.filter((c) => c.moneda !== 'BRL');
    const patas: Record<string, string> = {};
    for (const c of sinBrasil) patas[c.id] = c.moneda === 'BS' ? '285' : '1';
    await request(app.getHttpServer())
      .post('/admin/tasas-corredor/publicar')
      .set('Authorization', `Bearer ${token}`)
      .send(publicacionPayload(sinBrasil, '208', patas));

    const caj = await crearCajero('cajero-tasas-3@tav.test');
    const tokCaj = await login(caj.email, caj.password);
    const res = await request(app.getHttpServer())
      .get('/cajero/corredores')
      .set('Authorization', `Bearer ${tokCaj}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(5);
    expect(res.body.find((c: { moneda: string }) => c.moneda === 'BRL')).toBeUndefined();
  });

  test('4. Un corredor desactivado no aparece, pero sus operaciones viejas siguen consultables', async () => {
    const admin = await crearAdmin('admin-tasas-4@tav.test');
    const token = await login(admin.email, admin.password);
    const corredores = await crearCorredores();
    const corredorBs = corredores.find((c) => c.moneda === 'BS')!;

    // Publicar tasa con todos.
    const patas: Record<string, string> = {};
    for (const c of corredores) patas[c.id] = c.moneda === 'BS' ? '285' : '1';
    await request(app.getHttpServer())
      .post('/admin/tasas-corredor/publicar')
      .set('Authorization', `Bearer ${token}`)
      .send(publicacionPayload(corredores, '208', patas));

    // Registrar una operación contra el corredor BS.
    const caj = await crearCajero('cajero-tasas-4@tav.test');
    const tokCaj = await login(caj.email, caj.password);
    await request(app.getHttpServer())
      .post('/cajero/operaciones')
      .set('Authorization', `Bearer ${tokCaj}`)
      .send(operacionConCorredor('op-fase9-4', corredorBs.id));

    // Desactivar el corredor BS (vía BD: no hay endpoint de desactivar en este bloque).
    await prisma.corredor.update({
      where: { id: corredorBs.id },
      data: { activo: false, desactivadoAt: new Date(), desactivadoPorId: admin.id },
    });

    // No aparece en la lista del cajero.
    const resLista = await request(app.getHttpServer())
      .get('/cajero/corredores')
      .set('Authorization', `Bearer ${tokCaj}`);
    expect(resLista.status).toBe(200);
    expect(resLista.body.find((c: { moneda: string }) => c.moneda === 'BS')).toBeUndefined();

    // Pero la operación vieja sigue consultable.
    const resOps = await request(app.getHttpServer())
      .get('/cajero/operaciones')
      .set('Authorization', `Bearer ${tokCaj}`);
    expect(resOps.body.items.length).toBe(1);
    expect(resOps.body.items[0].corredorId).toBe(corredorBs.id);
  });

  test('5. El endpoint del cajero no devuelve margen ni pata destino', async () => {
    const admin = await crearAdmin('admin-tasas-5@tav.test');
    const token = await login(admin.email, admin.password);
    const corredores = await crearCorredores();

    const patas: Record<string, string> = {};
    for (const c of corredores) patas[c.id] = c.moneda === 'BS' ? '285' : '1';
    await request(app.getHttpServer())
      .post('/admin/tasas-corredor/publicar')
      .set('Authorization', `Bearer ${token}`)
      .send(publicacionPayload(corredores, '208', patas));

    const caj = await crearCajero('cajero-tasas-5@tav.test');
    const tokCaj = await login(caj.email, caj.password);
    const res = await request(app.getHttpServer())
      .get('/cajero/corredores')
      .set('Authorization', `Bearer ${tokCaj}`);

    expect(res.status).toBe(200);
    for (const c of res.body) {
      expect(c).not.toHaveProperty('margen');
      expect(c).not.toHaveProperty('pataDestino');
      expect(c).not.toHaveProperty('pataBase');
      expect(c.tasaCotizada).toBeTruthy();
    }
  });

  test('6. Una operación con corredorId nace en pendiente y la deuda sube', async () => {
    const admin = await crearAdmin('admin-tasas-6@tav.test');
    const token = await login(admin.email, admin.password);
    const corredores = await crearCorredores();
    const corredorBs = corredores.find((c) => c.moneda === 'BS')!;

    const patas: Record<string, string> = {};
    for (const c of corredores) patas[c.id] = c.moneda === 'BS' ? '285' : '1';
    await request(app.getHttpServer())
      .post('/admin/tasas-corredor/publicar')
      .set('Authorization', `Bearer ${token}`)
      .send(publicacionPayload(corredores, '208', patas));

    const caj = await crearCajero('cajero-tasas-6@tav.test', 500_000n);
    const tokCaj = await login(caj.email, caj.password);

    const res = await request(app.getHttpServer())
      .post('/cajero/operaciones')
      .set('Authorization', `Bearer ${tokCaj}`)
      .send(operacionConCorredor('op-fase9-6', corredorBs.id));

    expect(res.status).toBe(201);
    expect(res.body.operacion.estado).toBe('pendiente');
    expect(res.body.operacion.corredorId).toBe(corredorBs.id);

    // La deuda subió por el monto enviado (100.000 GYD cents).
    const resumen = await request(app.getHttpServer())
      .get('/cajero/resumen')
      .set('Authorization', `Bearer ${tokCaj}`);
    expect(resumen.body.saldoCents).toBe('100000');
  });

  test('previsualizar avisa de corredores omitidos y desviaciones', async () => {
    const admin = await crearAdmin('admin-tasas-prev@tav.test');
    const token = await login(admin.email, admin.password);
    const corredores = await crearCorredores();

    // Primera publicación con pata base 208.
    const patas: Record<string, string> = {};
    for (const c of corredores) patas[c.id] = c.moneda === 'BS' ? '285' : '1';
    await request(app.getHttpServer())
      .post('/admin/tasas-corredor/publicar')
      .set('Authorization', `Bearer ${token}`)
      .send(publicacionPayload(corredores, '208', patas));

    // Previsualizar una publicación que omite Brasil y cambia la pata base a 300 (>10%).
    const sinBrasil = corredores.filter((c) => c.moneda !== 'BRL');
    const res = await request(app.getHttpServer())
      .post('/admin/tasas-corredor/previsualizar')
      .set('Authorization', `Bearer ${token}`)
      .send(publicacionPayload(sinBrasil, '300', patas));

    expect(res.status).toBe(200);
    const avisos = res.body.avisos;
    // Debe avisar del corredor omitido.
    expect(avisos.some((a: { tipo: string }) => a.tipo === 'corredor_omitido')).toBe(true);
    // Debe avisar de la desviación de la pata base.
    expect(avisos.some((a: { tipo: string }) => a.tipo === 'desviacion_pata_base')).toBe(true);
  });

  test('margen fuera de rango es rechazado', async () => {
    const admin = await crearAdmin('admin-tasas-marg@tav.test');
    const token = await login(admin.email, admin.password);
    const corredores = await crearCorredores();

    const patas: Record<string, string> = {};
    for (const c of corredores) patas[c.id] = '285';
    const payload = publicacionPayload(corredores, '208', patas, '150'); // margen 150% > 100

    const res = await request(app.getHttpServer())
      .post('/admin/tasas-corredor/publicar')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(400);
  });

  test('7. Redondeo del monto destino: half-up en el centavo exacto', () => {
    // Caso A: producto que cae EXACTAMENTE en medio centavo → sube (half-up).
    // montoGydCents = 1 centavo, tasaCotizada = 1.5 → producto = 1.5 centavos.
    // round_half_up(1.5) = 2 (sube, no trunca a 1).
    const a = TasaCorredorService.calcularMontoDestinoCents(1n, new Prisma.Decimal('1.5'));
    expect(a).toBe(2n);

    // Caso B: muchos decimales donde truncar y redondear dan resultados distintos.
    // montoGydCents = 100, tasaCotizada = 1.99999999 → producto = 199.999999.
    // truncar = 199, round_half_up = 200.
    const truncado = 199n;
    const redondeado = TasaCorredorService.calcularMontoDestinoCents(
      100n,
      new Prisma.Decimal('1.99999999'),
    );
    expect(redondeado).toBe(200n);
    expect(redondeado).not.toBe(truncado);

    // Caso C: 0.4999... baja (no sube). round_half_up(0.4999) = 0.
    const c = TasaCorredorService.calcularMontoDestinoCents(1n, new Prisma.Decimal('0.4999'));
    expect(c).toBe(0n);

    // Caso D: monto grande con tasa que genera fracción justa sobre medio.
    // montoGydCents = 1_000_000, tasaCotizada = 0.004555 → producto = 4555.0.
    // round_half_up = 4555.
    const d = TasaCorredorService.calcularMontoDestinoCents(
      1_000_000n,
      new Prisma.Decimal('0.004555'),
    );
    expect(d).toBe(4555n);
  });

  test('8. Corredor USD en efectivo: monto grande no se desvía del cálculo exacto', () => {
    // El corredor de USD en efectivo tiene la tasa más pequeña:
    // 1 GYD ≈ 0,00455 USD. Con pataBase=208 y pataDestino=1 (1 USDT = 1 USD),
    // margen 0%, tasaCotizada = 1/208 = 0.00480769230...
    //
    // Un monto grande: 1.000.000 GYD (100.000.000 centavos).
    // Cálculo exacto en Decimal: 100.000.000 × (1/208) = 480.769,230769...
    // round_half_up = 480.769 centavos = 4.807,69 USD.
    const pataBase = new Prisma.Decimal('208');
    const pataDestino = new Prisma.Decimal('1');
    const margen = new Prisma.Decimal('0');
    const tasaCotizada = TasaCorredorService.calcularTasaCotizada(pataBase, pataDestino, margen);

    const montoGydCents = 100_000_000n; // 1.000.000,00 GYD
    const montoDestinoCents = TasaCorredorService.calcularMontoDestinoCents(montoGydCents, tasaCotizada);

    // Cálculo de referencia en Decimal puro, sin pasar por el servicio.
    const esperado = new Prisma.Decimal(montoGydCents.toString())
      .mul(tasaCotizada)
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
    expect(montoDestinoCents).toBe(BigInt(esperado.toString()));

    // Verificar que no se desvía: el error relativo debe ser cero.
    // 100.000.000 / 208 = 480769.230769... → redondeado a 480769.
    expect(montoDestinoCents).toBe(480769n);

    // Y con un monto aún mayor: 10.000.000 GYD (1.000.000.000 centavos).
    const montoGydCents2 = 1_000_000_000n;
    const montoDestinoCents2 = TasaCorredorService.calcularMontoDestinoCents(montoGydCents2, tasaCotizada);
    const esperado2 = new Prisma.Decimal(montoGydCents2.toString())
      .mul(tasaCotizada)
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
    expect(montoDestinoCents2).toBe(BigInt(esperado2.toString()));
    // 1.000.000.000 / 208 = 4.807.692,30769... → redondeado a 4.807.692.
    expect(montoDestinoCents2).toBe(4807692n);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Test 8: el servidor es la autoridad de la tasa y el monto destino.
//
// El cliente manda corredorId y montoOrigenCents. La tasa sale de la
// publicación vigente; el monto destino lo calcula el servidor con
// Decimal + ROUND_HALF_UP. Si el cliente manda tasaAplicada o
// montoDestinoCents falsos, se ignoran (de hecho, ya no van en el DTO).
//
// Este test verifica el cierre del hueco: antes, el backend confiaba en
// los valores del cliente. Ahora no.
// ───────────────────────────────────────────────────────────────────────────
describe('Fase 9 — El servidor es la autoridad de la tasa y el monto destino', () => {
  test('8. El servidor ignora valores falsos del cliente y usa la tasa publicada', async () => {
    const admin = await crearAdmin('admin-autoridad-1@tav.test');
    const token = await login(admin.email, admin.password);
    const corredores = await crearCorredores();
    const corredorBs = corredores.find((c) => c.moneda === 'BS')!;

    // Publicar: pataBase=208, pataDestino=285, margen=2.5
    // → tasaCotizada = 285/208 × 0.975 = 1.3359375
    const patas: Record<string, string> = {};
    for (const c of corredores) patas[c.id] = c.moneda === 'BS' ? '285' : '1';
    await request(app.getHttpServer())
      .post('/admin/tasas-corredor/publicar')
      .set('Authorization', `Bearer ${token}`)
      .send(publicacionPayload(corredores, '208', patas));

    const caj = await crearCajero('cajero-autoridad-1@tav.test');
    const tokCaj = await login(caj.email, caj.password);

    // Registrar operación SIN tasaAplicada ni montoDestinoCents en el body.
    // El servidor debe calcularlos a partir de la publicación.
    const res = await request(app.getHttpServer())
      .post('/cajero/operaciones')
      .set('Authorization', `Bearer ${tokCaj}`)
      .send(operacionConCorredor('op-autoridad-1', corredorBs.id));
    expect(res.status).toBe(201);

    // tasaAplicada = tasaCotizada de la publicación, congelada como Decimal(18,6).
    // 1.3359375 → Decimal(18,6) redondea a 1.335938.
    expect(res.body.operacion.tasaAplicada).toBe('1.335938');

    // montoDestinoCents = round_half_up(100000 × 1.3359375) = round_half_up(133593.75) = 133594.
    // NO es 133593 (truncado) ni lo que el cliente pudiera mandar.
    expect(res.body.operacion.montoDestinoCents).toBe('133594');
  });

  test('9. forbidNonWhitelisted rechaza tasaAplicada y montoDestinoCents si el cliente los envía', async () => {
    const admin = await crearAdmin('admin-autoridad-2@tav.test');
    const token = await login(admin.email, admin.password);
    const corredores = await crearCorredores();
    const corredorBs = corredores.find((c) => c.moneda === 'BS')!;

    const patas: Record<string, string> = {};
    for (const c of corredores) patas[c.id] = c.moneda === 'BS' ? '285' : '1';
    await request(app.getHttpServer())
      .post('/admin/tasas-corredor/publicar')
      .set('Authorization', `Bearer ${token}`)
      .send(publicacionPayload(corredores, '208', patas));

    const caj = await crearCajero('cajero-autoridad-2@tav.test');
    const tokCaj = await login(caj.email, caj.password);

    // Intentar mandar tasaAplicada y montoDestinoCents falsos.
    // forbidNonWhitelisted debe rechazarlos con 400.
    const res = await request(app.getHttpServer())
      .post('/cajero/operaciones')
      .set('Authorization', `Bearer ${tokCaj}`)
      .send({
        ...operacionConCorredor('op-autoridad-2', corredorBs.id),
        tasaAplicada: '999',
        montoDestinoCents: '999999',
      });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.message)).toContain('tasaAplicada');
    expect(JSON.stringify(res.body.message)).toContain('montoDestinoCents');
  });
});
