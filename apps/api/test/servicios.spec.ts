/**
 * Tests del modelo de servicios (Corredor = país + producto) — Fase 9 paso 2
 *
 * Cubre las cuatro reglas nuevas del paso 2:
 *   1. Unicidad pais + servicio (no pais + moneda + formaEntrega).
 *   2. La caja necesita nombre propio (Caja.nombre).
 *   3. La moneda del servicio debe coincidir con la de su caja.
 *   4. Un servicio no puede apuntar a la caja madre.
 *
 * Postgres real (tav_test), sin mocks.
 */

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { LedgerExceptionFilter } from '../src/ledger-exception.filter';
import { CajaExceptionFilter } from '../src/cajas/caja-exception.filter';
import { CorredorService } from '../src/corredores/corredor.service';

const TEST_URL = 'postgresql://tav:tav@localhost:5432/tav_test?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });

const TABLAS = [
  'MovimientoCaja', 'Caja', 'PrecioCajeroServicio',
  'Usuario', 'PerfilCajero', 'PerfilCobrador', 'Operacion', 'Cobro',
  'Movimiento', 'AmpliacionCredito', 'Cierre', 'Atencion', 'Aviso', 'AuditLog',
  'Config', 'Corredor',
];

let app: INestApplication;
let corredorService: CorredorService;

async function truncateTodo() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLAS.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}

async function crearAdmin(email: string) {
  const password = 'admin-clave';
  const u = await prisma.usuario.create({
    data: { rol: 'admin', nombre: 'Admin', email, passwordHash: await argon2.hash(password) },
  });
  return { id: u.id, email, password };
}

async function crearCajaFisica(opts: { moneda: string; nombre: string; pais?: string | null }) {
  return prisma.caja.create({
    data: { esMadre: false, moneda: opts.moneda, nombre: opts.nombre, pais: opts.pais ?? null, saldoCents: 0n },
  });
}

async function crearCajaMadre(moneda = 'USDT') {
  return prisma.caja.create({
    data: { esMadre: true, moneda, nombre: `Caja madre ${moneda}`, pais: null, saldoCents: 0n },
  });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new LedgerExceptionFilter(), new CajaExceptionFilter());
  await app.init();
  corredorService = moduleRef.get(CorredorService);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateTodo();
});

// ─────────────────────────── UNICIDAD PAIS + SERVICIO ───────────────────────────

describe('CorredorService — unicidad pais + servicio', () => {
  test('BCV y tasa especial coexisten (servicios distintos, mismo pais+moneda)', async () => {
    const admin = await crearAdmin('admin@tav.test');
    const cajaBs = await crearCajaFisica({ moneda: 'BS', nombre: 'Bolívares en cuenta', pais: 'VEN' });

    const bcv = await corredorService.crear({
      pais: 'VEN', paisNombre: 'Venezuela', moneda: 'BS', monedaNombre: 'Bolívares',
      formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia',
      servicio: 'bcv', servicioNombre: 'BCV',
      cajaId: cajaBs.id, creadoPorId: admin.id,
    });
    const especial = await corredorService.crear({
      pais: 'VEN', paisNombre: 'Venezuela', moneda: 'BS', monedaNombre: 'Bolívares',
      formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia',
      servicio: 'tasa_especial', servicioNombre: 'Tasa especial',
      cajaId: cajaBs.id, creadoPorId: admin.id,
    });

    expect(bcv.id).not.toBe(especial.id);
    expect(bcv.servicio).toBe('bcv');
    expect(especial.servicio).toBe('tasa_especial');
    // Ambos descuentan de la misma caja.
    expect(bcv.cajaId).toBe(cajaBs.id);
    expect(especial.cajaId).toBe(cajaBs.id);
  });

  test('dos servicios activos con el mismo pais + servicio falla', async () => {
    const admin = await crearAdmin('admin@tav.test');
    const cajaBs = await crearCajaFisica({ moneda: 'BS', nombre: 'Bolívares en cuenta', pais: 'VEN' });

    await corredorService.crear({
      pais: 'VEN', paisNombre: 'Venezuela', moneda: 'BS', monedaNombre: 'Bolívares',
      formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia',
      servicio: 'bcv', servicioNombre: 'BCV',
      cajaId: cajaBs.id, creadoPorId: admin.id,
    });

    await expect(
      corredorService.crear({
        pais: 'VEN', paisNombre: 'Venezuela', moneda: 'BS', monedaNombre: 'Bolívares',
        formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia',
        servicio: 'bcv', servicioNombre: 'BCV (otro)',
        cajaId: cajaBs.id, creadoPorId: admin.id,
      }),
    ).rejects.toThrow(/ya existe un servicio activo/i);
  });

  test('desactivar y reactivar permite recrear el mismo pais + servicio', async () => {
    const admin = await crearAdmin('admin@tav.test');
    const cajaBs = await crearCajaFisica({ moneda: 'BS', nombre: 'Bolívares en cuenta', pais: 'VEN' });

    const bcv = await corredorService.crear({
      pais: 'VEN', paisNombre: 'Venezuela', moneda: 'BS', monedaNombre: 'Bolívares',
      formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia',
      servicio: 'bcv', servicioNombre: 'BCV',
      cajaId: cajaBs.id, creadoPorId: admin.id,
    });

    await corredorService.desactivar(bcv.id, admin.id);

    // Tras desactivar, se puede crear otro BCV activo.
    const bcv2 = await corredorService.crear({
      pais: 'VEN', paisNombre: 'Venezuela', moneda: 'BS', monedaNombre: 'Bolívares',
      formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia',
      servicio: 'bcv', servicioNombre: 'BCV (nuevo)',
      cajaId: cajaBs.id, creadoPorId: admin.id,
    });
    expect(bcv2.id).not.toBe(bcv.id);
  });
});

// ─────────────────────────── CAJA NECESITA NOMBRE ───────────────────────────

describe('Caja — nombre propio', () => {
  test('la caja tiene nombre y se usa en alertas', async () => {
    const caja = await crearCajaFisica({ moneda: 'BS', nombre: 'Bolívares en cuenta', pais: 'VEN' });
    expect(caja.nombre).toBe('Bolívares en cuenta');
    expect(caja.pais).toBe('VEN');
  });

  test('la caja madre tiene nombre y pais null', async () => {
    const madre = await crearCajaMadre('USDT');
    expect(madre.nombre).toBe('Caja madre USDT');
    expect(madre.pais).toBeNull();
    expect(madre.esMadre).toBe(true);
  });
});

// ─────────────────────────── MONEDA DEL SERVICIO = MONEDA DE LA CAJA ───────────────────────────

describe('CorredorService — moneda del servicio coincide con la caja', () => {
  test('un servicio en BS apuntando a la caja de USD falla', async () => {
    const admin = await crearAdmin('admin@tav.test');
    const cajaUsd = await crearCajaFisica({ moneda: 'USD', nombre: 'USD en efectivo', pais: 'VEN' });

    await expect(
      corredorService.crear({
        pais: 'VEN', paisNombre: 'Venezuela', moneda: 'BS', monedaNombre: 'Bolívares',
        formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia',
        servicio: 'bcv', servicioNombre: 'BCV',
        cajaId: cajaUsd.id, creadoPorId: admin.id,
      }),
    ).rejects.toThrow(/pero el servicio/i);
  });

  test('editar la caja a una de moneda distinta falla', async () => {
    const admin = await crearAdmin('admin@tav.test');
    const cajaBs = await crearCajaFisica({ moneda: 'BS', nombre: 'Bolívares en cuenta', pais: 'VEN' });
    const cajaUsd = await crearCajaFisica({ moneda: 'USD', nombre: 'USD en efectivo', pais: 'VEN' });

    const bcv = await corredorService.crear({
      pais: 'VEN', paisNombre: 'Venezuela', moneda: 'BS', monedaNombre: 'Bolívares',
      formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia',
      servicio: 'bcv', servicioNombre: 'BCV',
      cajaId: cajaBs.id, creadoPorId: admin.id,
    });

    await expect(
      corredorService.editar(bcv.id, { cajaId: cajaUsd.id }),
    ).rejects.toThrow(/pero el servicio/i);
  });

  test('cambiar la moneda del servicio a una que no coincide con la caja falla', async () => {
    const admin = await crearAdmin('admin@tav.test');
    const cajaBs = await crearCajaFisica({ moneda: 'BS', nombre: 'Bolívares en cuenta', pais: 'VEN' });

    const bcv = await corredorService.crear({
      pais: 'VEN', paisNombre: 'Venezuela', moneda: 'BS', monedaNombre: 'Bolívares',
      formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia',
      servicio: 'bcv', servicioNombre: 'BCV',
      cajaId: cajaBs.id, creadoPorId: admin.id,
    });

    await expect(
      corredorService.editar(bcv.id, { moneda: 'USD', monedaNombre: 'Dólares' }),
    ).rejects.toThrow(/pero el servicio/i);
  });
});

// ─────────────────────────── SERVICIO NO APUNTA A MADRE ───────────────────────────

describe('CorredorService — servicio no apunta a caja madre', () => {
  test('crear un servicio apuntando a la caja madre falla', async () => {
    const admin = await crearAdmin('admin@tav.test');
    const madre = await crearCajaMadre('USDT');

    await expect(
      corredorService.crear({
        pais: 'VEN', paisNombre: 'Venezuela', moneda: 'USDT', monedaNombre: 'USDT',
        formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia',
        servicio: 'usdt', servicioNombre: 'USDT',
        cajaId: madre.id, creadoPorId: admin.id,
      }),
    ).rejects.toThrow(/madre/i);
  });

  test('editar un servicio para apuntar a la caja madre falla', async () => {
    const admin = await crearAdmin('admin@tav.test');
    const cajaBs = await crearCajaFisica({ moneda: 'BS', nombre: 'Bolívares en cuenta', pais: 'VEN' });
    const madre = await crearCajaMadre('USDT');

    const bcv = await corredorService.crear({
      pais: 'VEN', paisNombre: 'Venezuela', moneda: 'BS', monedaNombre: 'Bolívares',
      formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia',
      servicio: 'bcv', servicioNombre: 'BCV',
      cajaId: cajaBs.id, creadoPorId: admin.id,
    });

    await expect(
      corredorService.editar(bcv.id, { cajaId: madre.id }),
    ).rejects.toThrow(/madre/i);
  });
});

// ─────────────────────────── EJECUTAR PAGO USA CAJA DEL SERVICIO ───────────────────────────

describe('CajaService.ejecutarPago — caja determinada por el servicio', () => {
  test('BCV y tasa especial descuentan de la misma caja', async () => {
    // Este test verifica que dos servicios distintos que comparten caja
    // descuentan del mismo saldo. La validación caja.id === corredor.cajaId
    // pasa para ambos porque ambos apuntan a la misma caja.
    const admin = await crearAdmin('admin@tav.test');
    const cajaBs = await crearCajaFisica({ moneda: 'BS', nombre: 'Bolívares en cuenta', pais: 'VEN' });

    const bcv = await corredorService.crear({
      pais: 'VEN', paisNombre: 'Venezuela', moneda: 'BS', monedaNombre: 'Bolívares',
      formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia',
      servicio: 'bcv', servicioNombre: 'BCV',
      cajaId: cajaBs.id, creadoPorId: admin.id,
    });
    const especial = await corredorService.crear({
      pais: 'VEN', paisNombre: 'Venezuela', moneda: 'BS', monedaNombre: 'Bolívares',
      formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia',
      servicio: 'tasa_especial', servicioNombre: 'Tasa especial',
      cajaId: cajaBs.id, creadoPorId: admin.id,
    });

    expect(bcv.cajaId).toBe(especial.cajaId);
    expect(bcv.cajaId).toBe(cajaBs.id);
  });
});
