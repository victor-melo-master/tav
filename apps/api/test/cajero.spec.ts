/**
 * Tests de la API del cajero — Fase 4
 *
 * Postgres real (tav_test), sin mocks. La app NestJS se levanta con supertest
 * para probar controladores, guards, filtro de excepciones y DTOs de verdad.
 *
 * Cobertura pedida:
 *   - GET /cajero/resumen devuelve saldo, límite, disponible y semáforo
 *   - GET /cajero/operaciones paginado con filtro por estado
 *   - POST /cajero/operaciones crea una operación dentro del cupo
 *   - POST /cajero/operaciones con 409 y payload {disponible, requerido, faltante} intacto
 *   - GET /cajero/movimientos paginado ordenado por seq
 *   - POST /cajero/ampliaciones solicita ampliación
 *   - GET /cajero/ampliaciones lista sus solicitudes
 *   - POST /uploads/comprobante guarda en disco y devuelve la ruta
 *   - Aislamiento: un cajero no puede leer ni operar sobre datos de otro
 *   - El DTO rechaza montos incoherentes (totalCents != montoOrigen + comisión)
 *   - cajeroId/creadaPorId del body se rechazan (forbidNonWhitelisted)
 */

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient, Prisma } from '@prisma/client';
import argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { LedgerExceptionFilter } from '../src/ledger-exception.filter';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const TEST_URL = 'postgresql://tav:tav@localhost:5432/tav_test?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });

const TABLAS = [
  'MovimientoCaja', 'Caja', 'PrecioCajeroServicio',
  'Usuario', 'PerfilCajero', 'PerfilCobrador', 'Operacion', 'Cobro',
  'Movimiento', 'AmpliacionCredito', 'Cierre', 'Atencion', 'Aviso', 'AuditLog',
  'Config', 'Corredor',
];

let app: INestApplication;
let uploadDir: string;

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
  telefono?: string;
  password?: string;
  nombre?: string;
  limiteCents?: bigint;
  saldoCents?: bigint;
  deudaDesde?: Date | null;
}): Promise<{ id: string; email: string; password: string; token?: string }> {
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
    beneficiario: {
      nombre: 'María González',
      datos: 'Banco: Banesco\nCuenta: 0134...4471\nCédula: V-12345678\nMétodo: pago_movil'
    },
    corredorId: corredorIdTest,
    ...overrides,
  };
}

beforeAll(async () => {
  // Directorio temporal para los uploads de los tests.
  uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tav-uploads-'));
  process.env.UPLOAD_DIR = uploadDir;

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
  // Limpieza del directorio temporal de uploads.
  try {
    fs.rmSync(uploadDir, { recursive: true, force: true });
  } catch {}
});

beforeEach(async () => {
  await truncateTodo();
  await seedConfig();
  // Crear una caja física y un servicio (BCV) que la referencia. El cajero
  // opera sobre el servicio; la caja la determina el servicio (cajaId).
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

// ─────────────────────────── RESUMEN ───────────────────────────

describe('Cajero — GET /cajero/resumen', () => {
  test('devuelve saldo, límite, disponible y semáforo', async () => {
    const c = await crearCajero({ email: '0414-1000001@tav.test', limiteCents: 100_000n });
    const token = await login(app, c.email, c.password);

    const res = await request(app.getHttpServer())
      .get('/cajero/resumen')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.saldoCents).toBe('0');
    expect(res.body.limiteCents).toBe('100000');
    expect(res.body.disponibleCents).toBe('100000');
    expect(res.body.semaforo).toBeTruthy();
    expect(res.body.semaforo.estado).toBe('verde');
    expect(res.body.semaforo.bloqueado).toBe(false);
    expect(res.body.semaforo.pct).toBe(0);
  });

  test('cajero con saldo al 90% muestra semáforo ámbar', async () => {
    const c = await crearCajero({
      email: '0414-1000002@tav.test',
      limiteCents: 100_000n,
      saldoCents: 90_000n,
      deudaDesde: new Date(),
    });
    const token = await login(app, c.email, c.password);

    const res = await request(app.getHttpServer())
      .get('/cajero/resumen')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.semaforo.estado).toBe('ambar');
    expect(res.body.semaforo.bloqueado).toBe(false);
    expect(res.body.disponibleCents).toBe('10000');
  });
});

// ─────────────────────────── OPERACIONES ───────────────────────────

describe('Cajero — POST /cajero/operaciones', () => {
  test('crea una operación dentro del cupo', async () => {
    const c = await crearCajero({ email: '0414-2000001@tav.test', limiteCents: 500_000n });
    const token = await login(app, c.email, c.password);

    const res = await request(app.getHttpServer())
      .post('/cajero/operaciones')
      .set('Authorization', `Bearer ${token}`)
      .send(operacionValida('op-uuid-001'));

    expect(res.status).toBe(201);
    expect(res.body.operacion).toBeTruthy();
    expect(res.body.operacion.folio).toMatch(/^TAV-\d+$/);
    expect(res.body.operacion.totalCents).toBe('103000');
    expect(res.body.yaExistia).toBe(false);

    // El saldo subió
    const perfil = await prisma.perfilCajero.findUniqueOrThrow({ where: { usuarioId: c.id } });
    expect(perfil.saldoCents).toBe(103_000n);
  });

  test('idempotencia: mismo clientUuid devuelve la operación existente', async () => {
    const c = await crearCajero({ email: '0414-2000002@tav.test', limiteCents: 500_000n });
    const token = await login(app, c.email, c.password);

    const dto = operacionValida('op-uuid-dup');
    const r1 = await request(app.getHttpServer())
      .post('/cajero/operaciones')
      .set('Authorization', `Bearer ${token}`)
      .send(dto);
    expect(r1.status).toBe(201);

    const r2 = await request(app.getHttpServer())
      .post('/cajero/operaciones')
      .set('Authorization', `Bearer ${token}`)
      .send(dto);
    expect(r2.status).toBe(201);
    expect(r2.body.yaExistia).toBe(true);
    expect(r2.body.operacion.id).toBe(r1.body.operacion.id);
  });

  test('409 con payload {disponible, requerido, faltante} intacto cuando no hay cupo', async () => {
    // Cajero con límite 50.000 y saldo 0. Operación de 103.000 → no cabe.
    const c = await crearCajero({ email: '0414-2000003@tav.test', limiteCents: 50_000n });
    const token = await login(app, c.email, c.password);

    const res = await request(app.getHttpServer())
      .post('/cajero/operaciones')
      .set('Authorization', `Bearer ${token}`)
      .send(operacionValida('op-uuid-nocupo'));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SIN_CUPO');
    // Payload intacto: disponible=50000, requerido=103000, faltante=53000
    expect(res.body.disponible).toBe('50000');
    expect(res.body.requerido).toBe('103000');
    expect(res.body.faltante).toBe('53000');

    // No dejó rastro: no se creó operación ni movimiento.
    const opsCount = await prisma.operacion.count();
    const movCount = await prisma.movimiento.count();
    expect(opsCount).toBe(0);
    expect(movCount).toBe(0);
  });

  test('el DTO rechaza totalCents/comisionCents/monedaDestino (forbidNonWhitelisted)', async () => {
    const c = await crearCajero({ email: '0414-2000004@tav.test', limiteCents: 100_000n });
    const token = await login(app, c.email, c.password);

    // El servidor calcula la deuda; el cliente no puede mandar totalCents,
    // comisionCents ni monedaDestino. Si los manda, forbidNonWhitelisted los
    // rechaza con 400.
    const res = await request(app.getHttpServer())
      .post('/cajero/operaciones')
      .set('Authorization', `Bearer ${token}`)
      .send(operacionValida('op-uuid-incoherente', {
        totalCents: '99999',
        comisionCents: '3000',
        monedaDestino: 'BS',
      }));

    expect(res.status).toBe(400);
    // No se creó nada
    expect(await prisma.operacion.count()).toBe(0);
  });

  test('rechaza cajeroId y creadaPorId en el body (forbidNonWhitelisted)', async () => {
    const c = await crearCajero({ email: '0414-2000005@tav.test', limiteCents: 100_000n });
    const token = await login(app, c.email, c.password);

    const res = await request(app.getHttpServer())
      .post('/cajero/operaciones')
      .set('Authorization', `Bearer ${token}`)
      .send(operacionValida('op-uuid-spam', {
        cajeroId: 'otro-id',
        creadaPorId: 'otro-id',
      }));

    expect(res.status).toBe(400);
  });

  test('crea operaciones para todos los países/servicios activos', async () => {
    const c = await crearCajero({ email: '0414-2000006@tav.test', limiteCents: 10_000_000_000n });
    const token = await login(app, c.email, c.password);

    // Sembramos los corredores reales del seed, con las cajas físicas que usan.
    const cajasFisicas: Record<string, { id: string; moneda: string }> = {};
    for (const [nombre, moneda, pais] of [
      ['Bolívares en cuenta', 'BS', 'VEN'],
      ['USD en efectivo', 'USD', 'VEN'],
      ['Brasil Pix', 'BRL', 'BRA'],
      ['Colombia', 'COP', 'COL'],
      ['Rep. Dominicana', 'DOP', 'DOM'],
      ['México', 'MXN', 'MEX'],
    ] as const) {
      const caja = await prisma.caja.create({
        data: { esMadre: false, moneda, nombre, pais, saldoCents: 0n },
      });
      cajasFisicas[nombre] = { id: caja.id, moneda };
    }

    const servicios = [
      // bcv ya lo crea beforeEach; lo demás son los servicios reales del seed.
      { pais: 'VEN', paisNombre: 'Venezuela', moneda: 'BS', monedaNombre: 'Bolívares', formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia', servicio: 'tasa_especial', servicioNombre: 'Tasa especial', cajaNombre: 'Bolívares en cuenta' },
      { pais: 'VEN', paisNombre: 'Venezuela', moneda: 'USD', monedaNombre: 'Dólares', formaEntrega: 'efectivo', formaEntregaNombre: 'Efectivo en mano', servicio: 'efectivo', servicioNombre: 'Efectivo en mano', cajaNombre: 'USD en efectivo' },
      { pais: 'BRA', paisNombre: 'Brasil', moneda: 'BRL', monedaNombre: 'Reales', formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia (Pix)', servicio: 'pix', servicioNombre: 'Pix', cajaNombre: 'Brasil Pix' },
      { pais: 'COL', paisNombre: 'Colombia', moneda: 'COP', monedaNombre: 'Pesos colombianos', formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia', servicio: 'transferencia', servicioNombre: 'Transferencia', cajaNombre: 'Colombia' },
      { pais: 'DOM', paisNombre: 'Rep. Dominicana', moneda: 'DOP', monedaNombre: 'Pesos dominicanos', formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia', servicio: 'transferencia', servicioNombre: 'Transferencia', cajaNombre: 'Rep. Dominicana' },
      { pais: 'MEX', paisNombre: 'México', moneda: 'MXN', monedaNombre: 'Pesos mexicanos', formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia', servicio: 'transferencia', servicioNombre: 'Transferencia', cajaNombre: 'México' },
    ];

    for (const s of servicios) {
      const caja = cajasFisicas[s.cajaNombre];
      if (!caja) throw new Error(`Caja física ${s.cajaNombre} no encontrada`);
      await prisma.corredor.create({
        data: {
          pais: s.pais,
          paisNombre: s.paisNombre,
          moneda: s.moneda,
          monedaNombre: s.monedaNombre,
          formaEntrega: s.formaEntrega,
          formaEntregaNombre: s.formaEntregaNombre,
          servicio: s.servicio,
          servicioNombre: s.servicioNombre,
          cajaId: caja.id,
          activo: true,
          creadoPorId: 'admin-test',
        },
      });
    }

    // Ahora recorremos los corredores activos reales, como pide el negocio.
    const corredores = await prisma.corredor.findMany({ where: { activo: true } });
    expect(corredores.length).toBe(servicios.length + 1); // +1 por el bcv del beforeEach

    for (let i = 0; i < corredores.length; i++) {
      const cor = corredores[i];
      await prisma.precioCajeroServicio.create({
        data: { cajeroId: c.id, servicioId: cor.id, precioGyd: new Prisma.Decimal('250'), fijadoPorId: 'admin-test' },
      });

      const res = await request(app.getHttpServer())
        .post('/cajero/operaciones')
        .set('Authorization', `Bearer ${token}`)
        .send({
          clientUuid: `op-pais-${i}`,
          montoOrigenCents: '10000',
          beneficiario: { nombre: `Beneficiario ${cor.pais}`, datos: 'Datos de prueba' },
          corredorId: cor.id,
        });

      expect(res.status).toBe(201);
      expect(res.body.operacion.monedaDestino).toBe(cor.moneda);
      expect(res.body.operacion.totalCents).toBe('2500000');
    }

    expect(await prisma.operacion.count({ where: { cajeroId: c.id } })).toBe(corredores.length);
  });
});

// ─────────────────────────── LISTAR OPERACIONES ───────────────────────────

describe('Cajero — GET /cajero/operaciones', () => {
  test('lista paginada con filtro por estado', async () => {
    const c = await crearCajero({ email: '0414-3000001@tav.test', limiteCents: 500_000n });
    const token = await login(app, c.email, c.password);

    // Crear 3 operaciones
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post('/cajero/operaciones')
        .set('Authorization', `Bearer ${token}`)
        .send(operacionValida(`op-list-${i}`));
    }

    // Sin filtro: trae las 3
    const res = await request(app.getHttpServer())
      .get('/cajero/operaciones?page=1&limit=10')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(3);
    expect(res.body.total).toBe(3);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(10);

    // Filtro por estado pendiente (las nuevas nacen así)
    const resFiltro = await request(app.getHttpServer())
      .get('/cajero/operaciones?estado=pendiente')
      .set('Authorization', `Bearer ${token}`);

    expect(resFiltro.status).toBe(200);
    expect(resFiltro.body.items.length).toBe(3);
  });
});

// ─────────────────────────── MOVIMIENTOS ───────────────────────────

describe('Cajero — GET /cajero/movimientos', () => {
  test('estado de cuenta paginado ordenado por seq descendente', async () => {
    const c = await crearCajero({ email: '0414-4000001@tav.test', limiteCents: 500_000n });
    const token = await login(app, c.email, c.password);

    // Crear 2 operaciones → 2 movimientos cargo
    for (let i = 0; i < 2; i++) {
      await request(app.getHttpServer())
        .post('/cajero/operaciones')
        .set('Authorization', `Bearer ${token}`)
        .send(operacionValida(`op-mov-${i}`));
    }

    const res = await request(app.getHttpServer())
      .get('/cajero/movimientos?page=1&limit=10')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(2);
    expect(res.body.total).toBe(2);
    // Ordenado por seq descendente: el más reciente primero
    expect(BigInt(res.body.items[0].seq)).toBeGreaterThan(BigInt(res.body.items[1].seq));
    expect(res.body.items[0].tipo).toBe('cargo');
  });
});

// ─────────────────────────── AMPLIACIONES ───────────────────────────

describe('Cajero — ampliaciones', () => {
  test('POST /cajero/ampliaciones solicita ampliación con monto y motivo', async () => {
    const c = await crearCajero({ email: '0414-5000001@tav.test', limiteCents: 100_000n });
    const token = await login(app, c.email, c.password);

    const res = await request(app.getHttpServer())
      .post('/cajero/ampliaciones')
      .set('Authorization', `Bearer ${token}`)
      .send({ montoCents: '50000', motivo: 'Cliente grande esperando cambio' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.montoCents).toBe('50000');
    expect(res.body.estado).toBe('pendiente');
    expect(res.body.motivo).toBe('Cliente grande esperando cambio');
    // cajeroId sale del JWT
    expect(res.body.cajeroId).toBe(c.id);
  });

  test('GET /cajero/ampliaciones lista sus solicitudes', async () => {
    const c = await crearCajero({ email: '0414-5000002@tav.test', limiteCents: 100_000n });
    const token = await login(app, c.email, c.password);

    await request(app.getHttpServer())
      .post('/cajero/ampliaciones')
      .set('Authorization', `Bearer ${token}`)
      .send({ montoCents: '50000', motivo: 'Primera solicitud' });

    await request(app.getHttpServer())
      .post('/cajero/ampliaciones')
      .set('Authorization', `Bearer ${token}`)
      .send({ montoCents: '30000', motivo: 'Segunda solicitud' });

    const res = await request(app.getHttpServer())
      .get('/cajero/ampliaciones')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    // Ordenadas por solicitadaAt desc: la segunda primero
    expect(res.body[0].motivo).toBe('Segunda solicitud');
  });
});

// ─────────────────────────── UPLOADS ───────────────────────────

describe('Uploads — POST /uploads/comprobante', () => {
  test('guarda en disco y devuelve la ruta', async () => {
    const c = await crearCajero({ email: '0414-7000001@tav.test' });
    const token = await login(app, c.email, c.password);

    const res = await request(app.getHttpServer())
      .post('/uploads/comprobante')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('fake-image-data'), 'comprobante.jpg');

    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^\/uploads\/.+\.jpg$/);
    expect(res.body.filename).toBeTruthy();
    expect(res.body.size).toBeGreaterThan(0);

    // El archivo existe en disco
    const filePath = path.join(uploadDir, res.body.filename);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test('rechaza archivo que no es imagen', async () => {
    const c = await crearCajero({ email: '0414-7000002@tav.test' });
    const token = await login(app, c.email, c.password);

    const res = await request(app.getHttpServer())
      .post('/uploads/comprobante')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('not-an-image'), 'documento.txt');

    expect(res.status).toBe(400);
  });
});

// ─────────────────────────── AISLAMIENTO ENTRE CAJEROS ───────────────────────────

describe('Cajero — aislamiento entre cajeros', () => {
  test('un cajero no puede ver las operaciones de otro', async () => {
    const cA = await crearCajero({ email: '0414-8000001@tav.test', limiteCents: 500_000n, nombre: 'Cajero A' });
    const cB = await crearCajero({ email: '0414-8000002@tav.test', limiteCents: 500_000n, nombre: 'Cajero B' });
    const tokenA = await login(app, cA.email, cA.password);
    const tokenB = await login(app, cB.email, cB.password);

    // Cajero A crea una operación
    const rOp = await request(app.getHttpServer())
      .post('/cajero/operaciones')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(operacionValida('op-aisl-A'));
    expect(rOp.status).toBe(201);

    // Cajero B lista sus operaciones → no debe ver la de A
    const resB = await request(app.getHttpServer())
      .get('/cajero/operaciones')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(resB.status).toBe(200);
    expect(resB.body.items.length).toBe(0);
    expect(resB.body.total).toBe(0);
  });

  test('un cajero no puede ver los movimientos de otro', async () => {
    const cA = await crearCajero({ email: '0414-8000003@tav.test', limiteCents: 500_000n, nombre: 'Cajero A' });
    const cB = await crearCajero({ email: '0414-8000004@tav.test', limiteCents: 500_000n, nombre: 'Cajero B' });
    const tokenA = await login(app, cA.email, cA.password);
    const tokenB = await login(app, cB.email, cB.password);

    // Cajero A crea una operación → 1 movimiento
    await request(app.getHttpServer())
      .post('/cajero/operaciones')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(operacionValida('op-aisl-mov'));

    // Cajero B lista sus movimientos → 0
    const resB = await request(app.getHttpServer())
      .get('/cajero/movimientos')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(resB.status).toBe(200);
    expect(resB.body.items.length).toBe(0);
  });

  test('el resumen de cada cajero muestra su propio saldo', async () => {
    const cA = await crearCajero({
      email: '0414-8000005@tav.test',
      limiteCents: 100_000n,
      saldoCents: 50_000n,
      deudaDesde: new Date(),
      nombre: 'Cajero A',
    });
    const cB = await crearCajero({
      email: '0414-8000006@tav.test',
      limiteCents: 200_000n,
      saldoCents: 10_000n,
      deudaDesde: new Date(),
      nombre: 'Cajero B',
    });
    const tokenA = await login(app, cA.email, cA.password);
    const tokenB = await login(app, cB.email, cB.password);

    const resA = await request(app.getHttpServer())
      .get('/cajero/resumen')
      .set('Authorization', `Bearer ${tokenA}`);
    const resB = await request(app.getHttpServer())
      .get('/cajero/resumen')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(resA.body.saldoCents).toBe('50000');
    expect(resA.body.limiteCents).toBe('100000');
    expect(resB.body.saldoCents).toBe('10000');
    expect(resB.body.limiteCents).toBe('200000');
  });

  test('un cajero no puede ver las ampliaciones de otro', async () => {
    const cA = await crearCajero({ email: '0414-8000007@tav.test', limiteCents: 100_000n, nombre: 'Cajero A' });
    const cB = await crearCajero({ email: '0414-8000008@tav.test', limiteCents: 100_000n, nombre: 'Cajero B' });
    const tokenA = await login(app, cA.email, cA.password);
    const tokenB = await login(app, cB.email, cB.password);

    // Cajero A solicita una ampliación
    await request(app.getHttpServer())
      .post('/cajero/ampliaciones')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ montoCents: '50000', motivo: 'Necesito cupo extra' });

    // Cajero B lista sus ampliaciones → 0
    const resB = await request(app.getHttpServer())
      .get('/cajero/ampliaciones')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(resB.status).toBe(200);
    expect(resB.body.length).toBe(0);
  });
});

// ─────────────────────────── AUTORIZACIÓN ───────────────────────────

describe('Cajero — autorización', () => {
  test('un cobrador recibe 403 al llamar /cajero/resumen', async () => {
    await prisma.usuario.create({
      data: {
        rol: 'cobrador',
        nombre: 'Cobrador',
        email: '0414-9000001@tav.test',
        passwordHash: await argon2.hash('clave123'),
        perfilCobrador: { create: {} },
      },
    });
    const token = await login(app, '0414-9000001@tav.test', 'clave123');

    const res = await request(app.getHttpServer())
      .get('/cajero/resumen')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  test('sin token, /cajero/resumen devuelve 401', async () => {
    const res = await request(app.getHttpServer()).get('/cajero/resumen');
    expect(res.status).toBe(401);
  });
});

// ─────────────────── PRECIO DE COMPRA CONGELADO ───────────────────

describe('Cajero — crear operación congela precioCompraGyd', () => {
  test('la operación congela el precio de compra del ingreso más reciente', async () => {
    // Crear una caja madre y un ingreso con precioCompraGyd = 237.
    const madre = await prisma.caja.create({
      data: { esMadre: true, moneda: 'USDT', nombre: 'Caja madre USDT', saldoCents: 0n },
    });
    const admin = await prisma.usuario.create({
      data: { id: crypto.randomUUID(), rol: 'admin', nombre: 'Admin', email: 'admin-pc@tav.test', passwordHash: 'x' },
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
        registradoPorId: admin.id,
      },
    });

    // Crear un cajero y una operación. El cajero envía 100 USD a 240 GYD/USD.
    const c = await crearCajero({ email: '0414-1000050@tav.test', limiteCents: 100_000_000n });
    const token = await login(app, c.email, c.password);

    const res = await request(app.getHttpServer())
      .post('/cajero/operaciones')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: crypto.randomUUID(),
        montoOrigenCents: '10000', // 100 USD
        beneficiario: { nombre: 'María', datos: 'Banco: Banesco\nCuenta: 0123\nCédula: V123\nMétodo: pago_movil' },
        corredorId: corredorIdTest,
      });
    expect(res.status).toBe(201);

    // La operación congela el precio de compra (237) y el precio de venta (240).
    const op = await prisma.operacion.findUnique({ where: { id: res.body.operacion.id } });
    expect(op!.tasaAplicada.toString()).toBe('1.03'); // precio del helper crearCajero
    expect(op!.precioCompraGyd?.toString()).toBe('237');
  });

  test('sin ingreso previo, la operación se registra con precioCompraGyd null', async () => {
    // No crear caja madre ni ingreso. La operación debe registrarse con
    // precioCompraGyd = null — el reporte la muestra sin margen.
    const c = await crearCajero({ email: '0414-1000051@tav.test', limiteCents: 100_000_000n });
    const token = await login(app, c.email, c.password);

    const res = await request(app.getHttpServer())
      .post('/cajero/operaciones')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientUuid: crypto.randomUUID(),
        montoOrigenCents: '10000',
        beneficiario: { nombre: 'María', datos: 'Banco: Banesco\nCuenta: 0123\nCédula: V123\nMétodo: pago_movil' },
        corredorId: corredorIdTest,
      });
    expect(res.status).toBe(201);

    const op = await prisma.operacion.findUnique({ where: { id: res.body.operacion.id } });
    expect(op!.precioCompraGyd).toBeNull();
  });
});
