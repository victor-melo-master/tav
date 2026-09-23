/**
 * Tests del módulo ledger — TAV
 *
 * Diseñados leyendo SOLO:
 *   - docs/05-contrato-ledger.md          (el contrato del módulo)
 *   - docs/02-modelo-de-datos.md          (sección "Las dos transacciones que importan")
 *   - docs/01-reglas-de-negocio.md        (reglas innegociables)
 *   - docs/03-plan-de-construccion.md     (los siete tests obligatorios de Fase 2)
 *
 * No se leyó la implementación de apps/api/src/ledger/ para diseñarlos.
 * Postgres real (tav_test), sin mocks. Cada test parte de base limpia
 * (TRUNCATE ... RESTART IDENTITY CASCADE en beforeEach).
 *
 * Regla del encargo: si un test falla, NO se toca el servicio ni se ablanda
 * el test. Un test en rojo es información.
 */

import { PrismaClient, MetodoCobro, Cobro } from '@prisma/client';
import { randomUUID } from 'crypto';
import { LedgerService } from '../src/ledger/ledger.service';
import { SemaforoService } from '../src/ledger/semaforo.service';
import type { RegistrarOperacionDto, RegistrarCobroDto } from '../src/ledger/ledger.dto';
import {
  LedgerException,
  SinCupoException,
  CobradorNoValidoException,
  CierreNoAbiertoException,
} from '../src/ledger/ledger.exceptions';

// ─────────────────────────── entorno ───────────────────────────

const TEST_URL = 'postgresql://tav:tav@localhost:5432/tav_test?schema=public';

const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
const ledger = new LedgerService(prisma);
const semaforo = new SemaforoService(prisma);

// Actor/admin dummy para los campos *PorId que no tienen FK en el schema
// (creadaPorId, registradoPorId, anuladoPorId, resueltaPorId). Si alguno
// resultara tener FK, el test lo descubrirá.
const ACTOR = 'actor-admin-test';

const TABLAS = [
  'Usuario', 'PerfilCajero', 'PerfilCobrador', 'Operacion', 'Cobro',
  'Movimiento', 'AmpliacionCredito', 'Cierre', 'Atencion', 'Aviso', 'AuditLog',
  'Config',
];

// ─────────────────────────── helpers ───────────────────────────

function uuid(): string {
  return randomUUID();
}

async function truncateTodo(): Promise<void> {
  const lista = TABLAS.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`,
  );
}

async function seedConfig(): Promise<void> {
  await prisma.config.createMany({
    data: [
      { clave: 'semaforo.dias_ambar', valor: '4' },
      { clave: 'semaforo.dias_rojo', valor: '7' },
      { clave: 'semaforo.pct_ambar', valor: '0.75' },
    ],
    skipDuplicates: true,
  });
}

async function crearCajero(
  opts: { email?: string; telefono?: string; limiteCents?: bigint; deudaDesde?: Date | null; nombre?: string } = {},
): Promise<{ id: string }> {
  const tel = `t-${uuid()}`;
  const email = opts.email ?? `cajero-${uuid()}@tav.test`;
  const u = await prisma.usuario.create({
    data: {
      rol: 'cajero',
      nombre: opts.nombre ?? 'Cajero Test',
      email,
      telefono: opts.telefono ?? tel,
      passwordHash: 'x',
      perfilCajero: {
        create: {
          limiteCents: opts.limiteCents ?? 100_000n,
          deudaDesde: opts.deudaDesde ?? null,
        },
      },
    },
    include: { perfilCajero: true },
  });
  return { id: u.id };
}

async function crearCobrador(
  opts: { email?: string; telefono?: string; nombre?: string } = {},
): Promise<{ id: string }> {
  const tel = `t-${uuid()}`;
  const email = opts.email ?? `cobrador-${uuid()}@tav.test`;
  const nombre = opts.nombre ?? 'Cobrador Test';
  const u = await prisma.usuario.create({
    data: {
      rol: 'cobrador',
      nombre,
      email,
      telefono: opts.telefono ?? tel,
      passwordHash: 'x',
      perfilCobrador: { create: {} },
    },
  });
  return { id: u.id };
}

async function crearAmpliacionAprobada(
  cajeroId: string,
  montoCents: bigint,
  resueltaAt: Date = new Date(),
) {
  return prisma.ampliacionCredito.create({
    data: {
      cajeroId,
      montoCents,
      motivo: 'ampliacion de test',
      estado: 'aprobada',
      resueltaAt,
      resueltaPorId: ACTOR,
    },
  });
}

/** DTO de operación con defaults cómodos. Solo sobreescribe lo que varíes. */
function opDto(opts: {
  cajeroId: string;
  totalCents: bigint;
  clientUuid?: string;
  montoOrigenCents?: bigint;
  tasaAplicada?: string;
  creadaPorId?: string;
}): RegistrarOperacionDto {
  return {
    clientUuid: opts.clientUuid ?? uuid(),
    cajeroId: opts.cajeroId,
    tipo: 'usdt_bs',
    montoOrigenCents: opts.montoOrigenCents ?? opts.totalCents,
    monedaOrigen: 'USDT',
    tasaAplicada: opts.tasaAplicada ?? '285.4',
    totalCents: opts.totalCents,
    montoDestinoCents: 0n,
    monedaDestino: 'BS',
    beneficiario: {
      nombre: 'Ben Test',
      documento: 'V12345678',
      banco: 'Banesco',
      cuenta: '01234567890',
      metodo: 'transferencia_gyd',
    },
    creadaPorId: opts.creadaPorId ?? ACTOR,
  };
}

/** DTO de cobro con defaults. cobradorId null = registrado por admin. */
function cobroDto(opts: {
  cajeroId: string;
  montoCents: bigint;
  metodo?: MetodoCobro;
  cobradorId?: string | null;
  clientUuid?: string;
}): RegistrarCobroDto {
  return {
    clientUuid: opts.clientUuid ?? uuid(),
    cajeroId: opts.cajeroId,
    cobradorId: opts.cobradorId ?? null,
    metodo: opts.metodo ?? 'efectivo_gyd',
    montoCents: opts.montoCents,
    registradoPorId: ACTOR,
  };
}

async function perfil(cajeroId: string) {
  return prisma.perfilCajero.findUniqueOrThrow({ where: { usuarioId: cajeroId } });
}

/** Invariante universal del libro: saldo cache == suma de movimientos,
 *  y cada saldoDespues = running sum ordenando por seq. */
async function invariante(cajeroId: string): Promise<void> {
  const p = await perfil(cajeroId);
  const movs = await prisma.movimiento.findMany({
    where: { cajeroId },
    orderBy: { seq: 'asc' },
  });
  const suma = movs.reduce((acc, m) => acc + m.montoCents, 0n);
  expect(suma).toBe(p.saldoCents);
  let running = 0n;
  for (const m of movs) {
    running += m.montoCents;
    expect(m.saldoDespues).toBe(running);
  }
}

/** La corre al final de CADA test sobre todos los cajeros que existan. */
async function invarianteTodos(): Promise<void> {
  const cajeros = await prisma.perfilCajero.findMany();
  for (const c of cajeros) {
    await invariante(c.usuarioId);
  }
}

async function folioOpSeq(): Promise<bigint> {
  const r = await prisma.$queryRawUnsafe<[{ last_value: bigint }]>(
    `SELECT last_value FROM "folio_operacion_seq"`,
  );
  return BigInt(r[0].last_value);
}

function codeOf(e: unknown): string {
  return e instanceof LedgerException ? e.code : '';
}

// ─────────────────────────── setup/teardown ───────────────────────────

beforeAll(async () => {
  // nos aseguramos de estar conectados a tav_test
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateTodo();
  await seedConfig();
});

afterEach(async () => {
  // Bloque 1, test 6: la invariante del libro se cumple tras cualquier secuencia.
  await invarianteTodos();
});

// ───────────────────────────────────────────────────────────────────────
// BLOQUE 1 — los siete obligatorios de docs/03-plan-de-construccion.md
// ───────────────────────────────────────────────────────────────────────

describe('Bloque 1 — los siete obligatorios del plan', () => {
  test('1. Operación dentro del cupo pasa y el saldo queda exacto', async () => {
    const c = await crearCajero({ limiteCents: 100_000n });

    const { operacion, yaExistia } = await ledger.registrarOperacion(
      opDto({ cajeroId: c.id, totalCents: 60_000n }),
    );

    expect(yaExistia).toBe(false);
    expect(operacion.estado).toBe('pendiente');
    expect(operacion.folio).toMatch(/^TAV-\d+$/);
    // la tasa se congela tal como llegó en el DTO ("285.4")
    expect(operacion.tasaAplicada.toString()).toBe('285.4');

    const p = await perfil(c.id);
    expect(p.saldoCents).toBe(60_000n);
    // deudaDesde era null → pasa a "ahora"
    expect(p.deudaDesde).not.toBeNull();

    const cargos = await prisma.movimiento.findMany({
      where: { cajeroId: c.id, tipo: 'cargo' },
    });
    expect(cargos).toHaveLength(1);
    expect(cargos[0].montoCents).toBe(60_000n);
    expect(cargos[0].saldoDespues).toBe(p.saldoCents);
  });

  test('2. Operación que excede el cupo lanza SIN_CUPO y no deja rastro (ni folio)', async () => {
    const c = await crearCajero({ limiteCents: 100_000n });

    const seqAntes = await folioOpSeq();
    const opsAntes = await prisma.operacion.count();
    const movsAntes = await prisma.movimiento.count();

    await expect(
      ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 150_000n })),
    ).rejects.toMatchObject({ code: 'SIN_CUPO' });

    // payload del contrato: {disponible, requerido, faltante} en bigint
    let err: SinCupoException | undefined;
    try {
      await ledger.registrarOperacion(
        opDto({ cajeroId: c.id, totalCents: 150_000n, clientUuid: uuid() }),
      );
      throw new Error('no lanzó');
    } catch (e) {
      err = e as SinCupoException;
    }
    expect(err!.code).toBe('SIN_CUPO');
    expect(BigInt(err!.payload.disponible)).toBe(100_000n);
    expect(BigInt(err!.payload.requerido)).toBe(150_000n);
    expect(BigInt(err!.payload.faltante)).toBe(50_000n);

    // no se creó operación, ni movimiento, ni se consumió folio, ni cambió saldo
    expect(await prisma.operacion.count()).toBe(opsAntes);
    expect(await prisma.movimiento.count()).toBe(movsAntes);
    expect(await folioOpSeq()).toBe(seqAntes);
    expect((await perfil(c.id)).saldoCents).toBe(0n);
  });

  test('3. Dos operaciones concurrentes (Promise.all) que juntas exceden el cupo: una pasa, la otra falla', async () => {
    const c = await crearCajero({ limiteCents: 100_000n });

    const resultados = await Promise.allSettled([
      ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 60_000n })),
      ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 60_000n })),
    ]);

    const cumplidos = resultados.filter((r) => r.status === 'fulfilled');
    const rechazados = resultados.filter((r) => r.status === 'rejected');
    expect(cumplidos).toHaveLength(1);
    expect(rechazados).toHaveLength(1);
    expect(codeOf(rechazados[0].reason)).toBe('SIN_CUPO');

    expect(await prisma.operacion.count()).toBe(1);
    expect(await prisma.movimiento.count()).toBe(1);
    expect((await perfil(c.id)).saldoCents).toBe(60_000n);
  });

  test('4. El mismo clientUuid dos veces crea un solo registro (operaciones y cobros)', async () => {
    const c = await crearCajero({ limiteCents: 100_000n });

    // --- operaciones ---
    const cu = uuid();
    const r1 = await ledger.registrarOperacion(
      opDto({ cajeroId: c.id, totalCents: 60_000n, clientUuid: cu }),
    );
    const r2 = await ledger.registrarOperacion(
      opDto({ cajeroId: c.id, totalCents: 60_000n, clientUuid: cu }),
    );
    expect(r1.yaExistia).toBe(false);
    expect(r2.yaExistia).toBe(true);
    expect(r2.operacion.id).toBe(r1.operacion.id);
    expect(await prisma.operacion.count()).toBe(1);
    expect((await perfil(c.id)).saldoCents).toBe(60_000n);

    // --- cobros ---
    const cu2 = uuid();
    const k1 = await ledger.registrarCobro(
      cobroDto({ cajeroId: c.id, montoCents: 10_000n, clientUuid: cu2 }),
    );
    const k2 = await ledger.registrarCobro(
      cobroDto({ cajeroId: c.id, montoCents: 10_000n, clientUuid: cu2 }),
    );
    expect(k1.yaExistia).toBe(false);
    expect(k2.yaExistia).toBe(true);
    expect(k2.cobro.id).toBe(k1.cobro.id);
    expect(await prisma.cobro.count()).toBe(1);
  });

  test('5. Anular un cobro devuelve el saldo al valor exacto anterior y el cobro sigue existiendo', async () => {
    const c = await crearCajero({ limiteCents: 100_000n });
    await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 60_000n }));
    const saldoAntesCobro = (await perfil(c.id)).saldoCents; // 60_000

    const { cobro } = await ledger.registrarCobro(
      cobroDto({ cajeroId: c.id, montoCents: 10_000n }),
    );
    expect((await perfil(c.id)).saldoCents).toBe(50_000n);

    const anulado = await ledger.anular('cobro', cobro.id, 'cobro mal registrado', ACTOR);
    // anular devuelve Operacion | Cobro; aquí sabemos que es un Cobro.
    const cobroAnulado = anulado as Cobro;

    expect(cobroAnulado.anuladoAt).not.toBeNull();
    expect(cobroAnulado.motivoAnulacion).toBe('cobro mal registrado');
    expect(cobroAnulado.anuladoPorId).toBe(ACTOR);

    // saldo vuelve EXACTO al valor anterior al cobro (mismo bigint, sin reconversión)
    expect((await perfil(c.id)).saldoCents).toBe(saldoAntesCobro);

    const reversos = await prisma.movimiento.findMany({
      where: { cajeroId: c.id, tipo: 'reverso_abono' },
    });
    expect(reversos).toHaveLength(1);
    expect(reversos[0].montoCents).toBe(10_000n);

    // el cobro sigue existiendo y visible
    expect(await prisma.cobro.count()).toBe(1);
  });

  test('6. Tras cualquier secuencia, saldoCents == suma de movimientos (secuencia rica)', async () => {
    const c = await crearCajero({ limiteCents: 100_000n });

    const a = await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 60_000n }));
    await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 30_000n }));
    const k = await ledger.registrarCobro(cobroDto({ cajeroId: c.id, montoCents: 40_000n }));
    await ledger.anular('operacion', a.operacion.id, 'operación errada', ACTOR);
    await ledger.anular('cobro', k.cobro.id, 'cobro duplicado', ACTOR);
    await ledger.registrarCobro(cobroDto({ cajeroId: c.id, montoCents: 5_000n }));

    // 60 + 30 − 40 (cobro) − 60 (reverso op) + 40 (reverso cobro) − 5 = 25
    const p = await perfil(c.id);
    expect(p.saldoCents).toBe(25_000n);
    await invariante(c.id); // explícito; afterEach lo repite sobre todos
  });

  test('7. Una ampliación aprobada permite una operación que sin ella sería rechazada, y queda consumida', async () => {
    const c = await crearCajero({ limiteCents: 100_000n });
    // lleva el saldo a 90_000
    await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 90_000n }));

    // sin ampliación: 20_000 no caben (disponible 10_000)
    await expect(
      ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 20_000n })),
    ).rejects.toMatchObject({ code: 'SIN_CUPO' });

    // se aprueba una ampliación de 20_000
    const amp = await crearAmpliacionAprobada(c.id, 20_000n);

    // ahora 20_000 pasan (límite efectivo 120_000, disponible 30_000)
    const { operacion, yaExistia } = await ledger.registrarOperacion(
      opDto({ cajeroId: c.id, totalCents: 20_000n }),
    );
    expect(yaExistia).toBe(false);
    expect((await perfil(c.id)).saldoCents).toBe(110_000n);

    // la ampliación queda consumida y vinculada a la operación
    const ampFinal = await prisma.ampliacionCredito.findUniqueOrThrow({ where: { id: amp.id } });
    expect(ampFinal.estado).toBe('consumida');
    expect(operacion.ampliacionId).toBe(amp.id);
  });
});

// ───────────────────────────────────────────────────────────────────────
// BLOQUE 2 — casos 1 a 12 del contrato (comportamiento acordado)
//   Un test por caso, con los números que da docs/05-contrato-ledger.md.
//   Si alguno falla, es un bug.
// ───────────────────────────────────────────────────────────────────────

describe('Bloque 2 — casos 1-12 del contrato (comportamiento acordado)', () => {
  test('Caso 1 — carrera de cupo: dos Promise.all que juntas exceden el cupo → exactamente una pasa', async () => {
    const c = await crearCajero({ limiteCents: 100_000n });

    const res = await Promise.allSettled([
      ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 60_000n })),
      ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 60_000n })),
    ]);

    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(res.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect((await perfil(c.id)).saldoCents).toBe(60_000n);
    expect(await prisma.operacion.count()).toBe(1);
  });

  test('Caso 2 — carrera de idempotencia: dos simultáneos con el mismo clientUuid → un solo registro', async () => {
    // Montos que SÍ caben (30.000 c/u, límite 100.000): ambas pasan el chequeo
    // de cupo y chocan en el índice único de clientUuid. Es el mecanismo que
    // el contrato describe: "el índice único tumba a una, y esa devuelve el
    // registro ganador con yaExistia: true".
    const c = await crearCajero({ limiteCents: 100_000n });
    const cu = uuid();

    const res = await Promise.allSettled([
      ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 30_000n, clientUuid: cu })),
      ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 30_000n, clientUuid: cu })),
    ]);

    // ambos resuelven: uno yaExistia false, el otro true, mismo id
    expect(res.every((r) => r.status === 'fulfilled')).toBe(true);
    const cumplidos = res as PromiseFulfilledResult<{ operacion: { id: string }; yaExistia: boolean }>[];
    const ids = cumplidos.map((r) => r.value.operacion.id);
    expect(ids[0]).toBe(ids[1]);
    const yaEx = cumplidos.map((r) => r.value.yaExistia).sort();
    expect(yaEx).toEqual([false, true]);
    expect(await prisma.operacion.count()).toBe(1);
    expect((await perfil(c.id)).saldoCents).toBe(30_000n);
  });

  test('Caso 3 — carrera de creación de cierre: dos cobros simultáneos del mismo cobrador sin cierre previo → un cierre, total = suma', async () => {
    const cob = await crearCobrador({});
    const c1 = await crearCajero({ limiteCents: 100_000n });
    const c2 = await crearCajero({ limiteCents: 100_000n });
    // ambos cajeros con deuda para que el cobro baje saldo
    await ledger.registrarOperacion(opDto({ cajeroId: c1.id, totalCents: 60_000n }));
    await ledger.registrarOperacion(opDto({ cajeroId: c2.id, totalCents: 60_000n }));

    await Promise.allSettled([
      ledger.registrarCobro(cobroDto({ cajeroId: c1.id, montoCents: 10_000n, cobradorId: cob.id })),
      ledger.registrarCobro(cobroDto({ cajeroId: c2.id, montoCents: 20_000n, cobradorId: cob.id })),
    ]);

    const cierres = await prisma.cierre.findMany({ where: { cobradorId: cob.id } });
    expect(cierres).toHaveLength(1);
    expect(cierres[0].totalRegistradoCents).toBe(30_000n);
    const cobros = await prisma.cobro.findMany({ where: { cierreId: cierres[0].id } });
    expect(cobros).toHaveLength(2);
  });

  test('Caso 4 — carrera de totales del cierre: dos cobros concurrentes a cajeros distintos no se pisan', async () => {
    const cob = await crearCobrador({});
    const c1 = await crearCajero({ limiteCents: 100_000n });
    const c2 = await crearCajero({ limiteCents: 100_000n });
    const c3 = await crearCajero({ limiteCents: 100_000n });
    await ledger.registrarOperacion(opDto({ cajeroId: c1.id, totalCents: 60_000n }));
    await ledger.registrarOperacion(opDto({ cajeroId: c2.id, totalCents: 60_000n }));
    await ledger.registrarOperacion(opDto({ cajeroId: c3.id, totalCents: 60_000n }));

    // un cobro previo crea el cierre con total 10_000
    await ledger.registrarCobro(cobroDto({ cajeroId: c1.id, montoCents: 10_000n, cobradorId: cob.id }));
    const cierrePrev = await prisma.cierre.findFirstOrThrow({ where: { cobradorId: cob.id } });
    expect(cierrePrev.totalRegistradoCents).toBe(10_000n);

    // dos cobros concurrentes al mismo cierre desde cajeros distintos
    await Promise.allSettled([
      ledger.registrarCobro(cobroDto({ cajeroId: c2.id, montoCents: 20_000n, cobradorId: cob.id })),
      ledger.registrarCobro(cobroDto({ cajeroId: c3.id, montoCents: 30_000n, cobradorId: cob.id })),
    ]);

    const cierreFinal = await prisma.cierre.findFirstOrThrow({ where: { cobradorId: cob.id } });
    // 10 + 20 + 30 = 60 (el último NO pisa al otro con un total incompleto)
    expect(cierreFinal.totalRegistradoCents).toBe(60_000n);
  });

  test('Caso 5 — doble anulación concurrente: la segunda recibe YA_ANULADO', async () => {
    const c = await crearCajero({ limiteCents: 100_000n });
    await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 60_000n }));
    const { cobro } = await ledger.registrarCobro(cobroDto({ cajeroId: c.id, montoCents: 10_000n }));

    const res = await Promise.allSettled([
      ledger.anular('cobro', cobro.id, 'motivo A', ACTOR),
      ledger.anular('cobro', cobro.id, 'motivo B', ACTOR),
    ]);

    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(res.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const rechazado = res.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
    expect(codeOf(rechazado!.reason)).toBe('YA_ANULADO');
    // un solo reverso_abono
    expect(
      await prisma.movimiento.count({ where: { tipo: 'reverso_abono', cajeroId: c.id } }),
    ).toBe(1);
  });

  test('Caso 6 — SIN_CUPO no consume folio ni deja rastro', async () => {
    const c = await crearCajero({ limiteCents: 100_000n });
    const seqAntes = await folioOpSeq();

    await expect(
      ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 150_000n })),
    ).rejects.toMatchObject({ code: 'SIN_CUPO' });

    expect(await folioOpSeq()).toBe(seqAntes);
    expect(await prisma.operacion.count()).toBe(0);
    expect(await prisma.movimiento.count()).toBe(0);
    expect((await perfil(c.id)).saldoCents).toBe(0n);
  });

  test('Caso 7 — ampliación justa: 25.000 pasa y consume; 31.000 falla con faltante = 1.000', async () => {
    // estado: límite 100.000, saldo 90.000, ampliación aprobada 20.000
    const c = await crearCajero({ limiteCents: 100_000n });
    await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 90_000n }));
    const amp = await crearAmpliacionAprobada(c.id, 20_000n);

    // 31.000 falla: disponible = 10.000 + 20.000 = 30.000 → faltante 1.000
    let err: SinCupoException | undefined;
    try {
      await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 31_000n }));
      throw new Error('no lanzó');
    } catch (e) {
      err = e as SinCupoException;
    }
    expect(err!.code).toBe('SIN_CUPO');
    expect(BigInt(err!.payload.disponible)).toBe(30_000n);
    expect(BigInt(err!.payload.faltante)).toBe(1_000n);

    // 25.000 pasa (25.000 ≤ 30.000) y consume la ampliación
    const { operacion } = await ledger.registrarOperacion(
      opDto({ cajeroId: c.id, totalCents: 25_000n }),
    );
    expect((await perfil(c.id)).saldoCents).toBe(115_000n);
    const ampFinal = await prisma.ampliacionCredito.findUniqueOrThrow({ where: { id: amp.id } });
    expect(ampFinal.estado).toBe('consumida');
    expect(operacion.ampliacionId).toBe(amp.id);
  });

  test('Caso 8 — operación que cabe en el límite base NO consume la ampliación aunque exista', async () => {
    const c = await crearCajero({ limiteCents: 100_000n });
    const amp = await crearAmpliacionAprobada(c.id, 20_000n);

    const { operacion } = await ledger.registrarOperacion(
      opDto({ cajeroId: c.id, totalCents: 60_000n }),
    );
    expect((await perfil(c.id)).saldoCents).toBe(60_000n);
    expect(operacion.ampliacionId).toBeNull();

    const ampFinal = await prisma.ampliacionCredito.findUniqueOrThrow({ where: { id: amp.id } });
    expect(ampFinal.estado).toBe('aprobada');
  });

  test('Caso 9 — cobro que sobrepaga: saldo negativo y deudaDesde → null, sin rechazo', async () => {
    const c = await crearCajero({ limiteCents: 100_000n });
    await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 60_000n }));

    const { cobro } = await ledger.registrarCobro(
      cobroDto({ cajeroId: c.id, montoCents: 100_000n }),
    );
    expect(cobro.montoCents).toBe(100_000n);

    const p = await perfil(c.id);
    expect(p.saldoCents).toBe(-40_000n);
    expect(p.deudaDesde).toBeNull();
  });

  test('Caso 10 — cobro cae en el cierre de la fecha Caracas (no UTC)', async () => {
    const cob = await crearCobrador({});
    const c = await crearCajero({ limiteCents: 100_000n });
    await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 60_000n }));

    await ledger.registrarCobro(
      cobroDto({ cajeroId: c.id, montoCents: 10_000n, cobradorId: cob.id }),
    );

    const cierre = await prisma.cierre.findFirstOrThrow({ where: { cobradorId: cob.id } });
    // fecha Caracas del momento del cobro, como texto YYYY-MM-DD
    const esperada = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Caracas',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    // cierre.fecha es Date @db.Date → medianoche UTC; comparar solo la fecha
    expect(cierre.fecha.toISOString().slice(0, 10)).toBe(esperada);
    // NOTA: este test es plenamente discriminante durante la ventana UTC 00:00–04:00,
    // cuando la fecha Caracas es la del día anterior a la UTC. Fuera de ella ambos
    // cálculos coinciden; el contrato exige comportarse por Caracas siempre.
  });

  test('Caso 11 — cobro en efectivo GYD baja la deuda por el monto exacto', async () => {
    const c = await crearCajero({ limiteCents: 100_000n });
    await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 60_000n }));

    const saldoAntes = (await perfil(c.id)).saldoCents;

    // El cajero siempre paga en guyaneses: 10.000 GYD cents entran directo al libro.
    const { cobro } = await ledger.registrarCobro(
      cobroDto({ cajeroId: c.id, montoCents: 10_000n, metodo: 'efectivo_gyd' }),
    );
    expect(cobro.montoCents).toBe(10_000n);
    expect(cobro.esEfectivo).toBe(true);
    expect((await perfil(c.id)).saldoCents).toBe(saldoAntes - 10_000n);
  });

  test('Caso 11b — cobro por transferencia GYD no suma al efectivo', async () => {
    const c = await crearCajero({ limiteCents: 100_000n });
    await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 60_000n }));

    const { cobro } = await ledger.registrarCobro(
      cobroDto({ cajeroId: c.id, montoCents: 20_000n, metodo: 'transferencia_gyd' }),
    );
    expect(cobro.montoCents).toBe(20_000n);
    expect(cobro.esEfectivo).toBe(false);
    expect((await perfil(c.id)).saldoCents).toBe(40_000n);
  });

  test('Caso 11f — cobro que deja saldo a favor queda con saldo negativo', async () => {
    const c = await crearCajero({ limiteCents: 100_000n });
    await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 60_000n }));

    // Cobra 80.000 GYD contra deuda de 60.000 → queda con 20.000 a favor.
    const { cobro } = await ledger.registrarCobro(
      cobroDto({ cajeroId: c.id, montoCents: 80_000n }),
    );
    expect(cobro.montoCents).toBe(80_000n);
    expect((await perfil(c.id)).saldoCents).toBe(-20_000n);
  });

  test('Caso 12 — cobro registrado por admin (cobradorId null) no crea ni toca cierre', async () => {
    const c = await crearCajero({ limiteCents: 100_000n });
    await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 60_000n }));

    const { cobro } = await ledger.registrarCobro(
      cobroDto({ cajeroId: c.id, montoCents: 10_000n, cobradorId: null }),
    );
    expect(cobro.cierreId).toBeNull();
    expect(await prisma.cierre.count()).toBe(0);
  });

  test('Caso 17 — registrarCobro con cobradorId inexistente → CobradorNoValidoException (no error crudo de Prisma)', async () => {
    // Antes era un hueco: el ledger aceptaba identificadores inexistentes y
    // revienta con un error crudo de Prisma (P2003/P2010). Ahora se valida
    // antes de la transacción y lanza una excepción del dominio. Salió del
    // bloque PENDIENTE DE DEFINIR: ya no es una decisión abierta.
    const c = await crearCajero({ limiteCents: 100_000n });
    await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 60_000n }));

    const cobrosAntes = await prisma.cobro.count();
    const movsAntes = await prisma.movimiento.count({ where: { cajeroId: c.id } });

    let err: CobradorNoValidoException | undefined;
    try {
      await ledger.registrarCobro(
        cobroDto({ cajeroId: c.id, montoCents: 10_000n, cobradorId: 'cobrador-inexistente' }),
      );
      throw new Error('no lanzó');
    } catch (e) {
      err = e as CobradorNoValidoException;
    }
    expect(err!.code).toBe('COBRADOR_NO_VALIDO');
    expect(err!.cobradorId).toBe('cobrador-inexistente');
    // no se creó cobro ni movimiento
    expect(await prisma.cobro.count()).toBe(cobrosAntes);
    expect(await prisma.movimiento.count({ where: { cajeroId: c.id } })).toBe(movsAntes);
  });

  test('Caso 17b — registrarOperacion con cajeroId inexistente → CajeroNoValidoException', async () => {
    // Simétrico al 17 para el otro identificador. Misma rationale: validación
    // previa a la transacción, excepción del dominio, cero escrituras.
    await expect(
      ledger.registrarOperacion(opDto({ cajeroId: 'cajero-inexistente', totalCents: 60_000n })),
    ).rejects.toMatchObject({ code: 'CAJERO_NO_VALIDO', cajeroId: 'cajero-inexistente' });
    expect(await prisma.operacion.count()).toBe(0);
    expect(await prisma.movimiento.count()).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────
// HALLAZGOS ADICIONALES — bugs descubiertos al testear, fuera de los 12
// casos del contrato. Se reportan; no se toca el servicio.
// ───────────────────────────────────────────────────────────────────────

describe('Hallazgos adicionales (bugs fuera de los 12 casos del contrato)', () => {
  test('Idempotencia bajo concurrencia cuando el duplicado ya no cabe en cupo → SIN_CUPO en vez del registro existente', async () => {
    // Descubierto al probar el caso 2 con montos que NO caben dos veces.
    // Dos envíos simultáneos del MISMO clientUuid (60.000 c/u, límite 100.000):
    // el primero crea la operación; el segundo, al no re-verificar idempotencia
    // dentro de la transacción, llega al chequeo de cupo con el saldo ya subido
    // (disponible 40.000 < 60.000) y devuelve SIN_CUPO.
    //
    // Comportamiento esperado por el contrato de idempotencia
    // ("si ya existe una Operacion con ese clientUuid, devuelve laExistente,
    //   yaExistia: true, sin escribir nada"): el duplicado debe devolver el
    //   registro ganador, NUNCA SIN_CUPO — es el mismo intento lógico.
    //
    // Causa probable: la idempotencia se chequea fuera de la transacción y no
    // se re-verifica tras adquirir el FOR UPDATE.
    const c = await crearCajero({ limiteCents: 100_000n });
    const cu = uuid();

    const res = await Promise.allSettled([
      ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 60_000n, clientUuid: cu })),
      ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 60_000n, clientUuid: cu })),
    ]);

    // Ambos deben fulfilled con el mismo id (uno yaExistia true). Hoy el segundo
    // rechaza con SIN_CUPO.
    expect(res.every((r) => r.status === 'fulfilled')).toBe(true);
    const cumplidos = res as PromiseFulfilledResult<{ operacion: { id: string }; yaExistia: boolean }>[];
    const ids = cumplidos.map((r) => r.value?.operacion?.id);
    expect(ids[0]).toBe(ids[1]);
    expect(await prisma.operacion.count()).toBe(1);
    expect((await perfil(c.id)).saldoCents).toBe(60_000n);
  });
});

// ───────────────────────────────────────────────────────────────────────
// BLOQUE 3 — casos 13 a 21 del contrato
//   Decisiones de negocio ABIERTAS. Estos tests fijan el comportamiento
//   ACTUAL del código. Cuando el cliente decida, hay que cambiarlos.
//   Cada test lleva un comentario con la pregunta abierta.
// ───────────────────────────────────────────────────────────────────────

describe('PENDIENTE DE DEFINIR — comportamiento actual, sujeto a decisión del cliente', () => {
  test('Caso 13 — deudaDesde se reconstruye por FIFO al anular un cobro que saldó el cargo más viejo', async () => {
    // Regla 7 de docs/01-reglas-de-negocio.md: imputación FIFO.
    // El abono salda primero el cargo más viejo. Si ese abono se anula,
    // deudaDesde tiene que volver a la fecha del cargo viejo, no quedarse
    // en la del reciente. Es donde el semáforo se vuelve más benévolo de lo justo.
    const c = await crearCajero({ limiteCents: 100_000n });

    await ledger.registrarOperacion(
      opDto({ cajeroId: c.id, totalCents: 60_000n }),
    );
    const fechaCargoOriginal = (await perfil(c.id)).deudaDesde!;
    expect(fechaCargoOriginal).not.toBeNull();

    // cobro que salda la deuda → deudaDesde = null
    await ledger.registrarCobro(cobroDto({ cajeroId: c.id, montoCents: 60_000n }));
    expect((await perfil(c.id)).deudaDesde).toBeNull();

    // anular el cobro: deudaDesde vuelve a la fecha del cargo original (FIFO)
    const cobro = await prisma.cobro.findFirstOrThrow({ where: { cajeroId: c.id } });
    await ledger.anular('cobro', cobro.id, 'reverso de prueba', ACTOR);
    const p = await perfil(c.id);
    expect(p.saldoCents).toBe(60_000n);
    expect(p.deudaDesde).not.toBeNull();
    // deudaDesde debe ser la fecha del cargo original, no la del reverso
    expect(p.deudaDesde!.getTime()).toBe(fechaCargoOriginal.getTime());

    // simétrico: anular la operación más vieja recalcula al siguiente cargo vivo
    const c2 = await crearCajero({ limiteCents: 200_000n });
    const op1 = await ledger.registrarOperacion(opDto({ cajeroId: c2.id, totalCents: 60_000n }));
    await new Promise((r) => setTimeout(r, 50));
    const op2 = await ledger.registrarOperacion(opDto({ cajeroId: c2.id, totalCents: 40_000n }));
    // deudaDesde apunta al cargo más viejo (op1)
    const deudaAntes = (await perfil(c2.id)).deudaDesde!;
    expect(deudaAntes.getTime()).toBeLessThan(op2.operacion.creadaAt.getTime());
    await ledger.anular('operacion', op1.operacion.id, 'anulo la más vieja', ACTOR);
    // queda deuda (40.000) → deudaDesde recalcula al cargo vivo (op2)
    const p2 = await perfil(c2.id);
    expect(p2.saldoCents).toBe(40_000n);
    expect(p2.deudaDesde).not.toBeNull();
    // deudaDesde ahora apunta a op2, no se queda con la fecha de op1
    expect(p2.deudaDesde!.getTime()).toBe(op2.operacion.creadaAt.getTime());
  });

  test('Caso 14 — anular una operación que consumió ampliación NO la revive', async () => {
    // PREGUNTA ABIERTA: ¿debería devolverse el cupo extra al anular la operación
    //   que consumió la ampliación? Hoy se pierde.
    const c = await crearCajero({ limiteCents: 100_000n });
    await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 90_000n }));
    const amp = await crearAmpliacionAprobada(c.id, 20_000n);

    const { operacion } = await ledger.registrarOperacion(
      opDto({ cajeroId: c.id, totalCents: 25_000n }),
    );
    expect((await prisma.ampliacionCredito.findUniqueOrThrow({ where: { id: amp.id } })).estado)
      .toBe('consumida');

    await ledger.anular('operacion', operacion.id, 'anulo la que usó ampliación', ACTOR);
    // el saldo vuelve a 90.000 pero la ampliación sigue consumida
    expect((await perfil(c.id)).saldoCents).toBe(90_000n);
    expect((await prisma.ampliacionCredito.findUniqueOrThrow({ where: { id: amp.id } })).estado)
      .toBe('consumida');

    // consecuencia: una operación que antes pasaba ahora se rechaza (el cupo extra se perdió)
    await expect(
      ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 25_000n })),
    ).rejects.toMatchObject({ code: 'SIN_CUPO' });
  });

  test('Caso 15 — cobro tardío con cierre ya enviado → CierreNoAbiertoException', async () => {
    // PREGUNTA ABIERTA: ¿debe ir el cobro al cierre del día siguiente, o el admin
    //   puede reabrir el cierre? Hoy se rechaza.
    const cob = await crearCobrador({});
    const c = await crearCajero({ limiteCents: 100_000n });
    await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 60_000n }));

    // primer cobro crea el cierre abierto
    await ledger.registrarCobro(cobroDto({ cajeroId: c.id, montoCents: 10_000n, cobradorId: cob.id }));
    const cierre = await prisma.cierre.findFirstOrThrow({ where: { cobradorId: cob.id } });
    // el cobrador envía el cierre
    await prisma.cierre.update({ where: { id: cierre.id }, data: { estado: 'enviado' } });

    const cobrosAntes = await prisma.cobro.count();
    const movsAntes = await prisma.movimiento.count({ where: { cajeroId: c.id } });

    let err: CierreNoAbiertoException | undefined;
    try {
      await ledger.registrarCobro(
        cobroDto({ cajeroId: c.id, montoCents: 5_000n, cobradorId: cob.id }),
      );
      throw new Error('no lanzó');
    } catch (e) {
      err = e as CierreNoAbiertoException;
    }
    expect(err!.code).toBe('CIERRE_NO_ABIERTO');
    expect(err!.cierreId).toBe(cierre.id);
    expect(err!.estado).toBe('enviado');
    // no se creó cobro ni movimiento
    expect(await prisma.cobro.count()).toBe(cobrosAntes);
    expect(await prisma.movimiento.count({ where: { cajeroId: c.id } })).toBe(movsAntes);
  });

  test('Caso 16 — múltiples ampliaciones aprobadas: se usa solo la más antigua, nunca se suman', async () => {
    // PREGUNTA ABIERTA: el flujo del admin debería impedir dos ampliaciones activas;
    //   ¿deberían sumarse si las hay? Hoy se usa solo la más antigua por resueltaAt.
    const c = await crearCajero({ limiteCents: 100_000n });
    const t1 = new Date('2026-08-10T12:00:00Z');
    const t2 = new Date('2026-08-11T12:00:00Z');
    const amp1 = await crearAmpliacionAprobada(c.id, 20_000n, t1); // más antigua
    const amp2 = await crearAmpliacionAprobada(c.id, 30_000n, t2);

    // si se sumaran: límite efectivo = 150.000 → 130.000 pasaría.
    // con solo la más antigua: límite efectivo = 120.000 → 130.000 NO pasa.
    await expect(
      ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 130_000n })),
    ).rejects.toMatchObject({ code: 'SIN_CUPO' });

    // 110.000 sí pasa (≤ 120.000) y consume la más antigua, la otra queda aprobada
    const { operacion } = await ledger.registrarOperacion(
      opDto({ cajeroId: c.id, totalCents: 110_000n }),
    );
    expect(operacion.ampliacionId).toBe(amp1.id);
    expect((await prisma.ampliacionCredito.findUniqueOrThrow({ where: { id: amp1.id } })).estado)
      .toBe('consumida');
    expect((await prisma.ampliacionCredito.findUniqueOrThrow({ where: { id: amp2.id } })).estado)
      .toBe('aprobada');
  });

  test('Caso 18 — no se valida la coherencia aritmética del DTO de operación', async () => {
    // El ledger asienta lo que le mandan — no comprueba que totalCents ==
    // montoOrigenCents × tasaAplicada. La coherencia la valida la capa HTTP
    // (CajeroService calcula totalCents), no el ledger.
    const c = await crearCajero({ limiteCents: 100_000n });

    // DTO incoherente: montoOrigen 10.000 × tasa 285.4 ≠ total 60.000
    const { operacion } = await ledger.registrarOperacion(
      opDto({
        cajeroId: c.id,
        totalCents: 60_000n,
        montoOrigenCents: 10_000n,
      }),
    );
    expect(operacion.totalCents).toBe(60_000n);
    // el cargo a la deuda es totalCents (lo que se le mandó), no la suma "correcta"
    expect((await perfil(c.id)).saldoCents).toBe(60_000n);
    const cargo = await prisma.movimiento.findFirstOrThrow({
      where: { cajeroId: c.id, tipo: 'cargo' },
    });
    expect(cargo.montoCents).toBe(60_000n);
  });

  test('Caso 19 — anular una operación puede dejar el saldo negativo (coherente con caso 9)', async () => {
    // PREGUNTA ABIERTA: ¿permitir saldo negativo por anulación? Hoy sí, es coherente
    //   con permitir sobrepago (caso 9).
    const c = await crearCajero({ limiteCents: 100_000n });
    const op = await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 60_000n }));
    await ledger.registrarCobro(cobroDto({ cajeroId: c.id, montoCents: 100_000n }));
    expect((await perfil(c.id)).saldoCents).toBe(-40_000n);

    // anular la operación: reverso_cargo −60.000 → saldo −100.000
    await ledger.anular('operacion', op.operacion.id, 'anulo con deuda ya saldada', ACTOR);
    expect((await perfil(c.id)).saldoCents).toBe(-100_000n);
  });

  test('Caso 20 — pct es Number: a la frontera exacta pct=1 y bloqueado; precisión BigInt intacta en el cupo', async () => {
    // PREGUNTA ABIERTA: con saldos/límites > 2^53 centavos, Number pierde precisión
    //   en pct. Hoy solo afecta presentación/umbral; la validación de cupo es 100%
    //   entera. Riesgo teórico, no práctico.
    const c = await crearCajero({ limiteCents: 100_000n });
    await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 75_000n }));
    // 75% exacto → ámbar por crédito
    const r75 = await semaforo.calcular(c.id);
    expect(r75.pct).toBeCloseTo(0.75, 10);
    expect(r75.estado).toBe('ambar');
    expect(r75.bloqueado).toBe(false);

    await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 25_000n }));
    // 100% exacto → rojo bloqueado
    const r100 = await semaforo.calcular(c.id);
    expect(r100.pct).toBe(1);
    expect(r100.bloqueado).toBe(true);
    expect(r100.estado).toBe('rojo');
    expect(r100.disponibleCents).toBe(0n);

    // la validación de cupo es entera: 1 centavo más rebota por bigint exacto
    await expect(
      ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 1n })),
    ).rejects.toMatchObject({ code: 'SIN_CUPO' });
  });

  test('Caso 21 — semáforo con limiteEfectivo = 0 devuelve pct = 0 (verde, no bloqueado) aunque haya saldo', async () => {
    // PREGUNTA ABIERTA: un cajero con límite 0 y deuda es un estado anómalo que el
    //   flujo normal no produce. Hoy pct=0 → verde no bloqueado.
    const c = await crearCajero({ limiteCents: 0n });
    // para tener saldo con límite 0: ampliación que se consume y deja limiteEfectivo=0
    const amp = await crearAmpliacionAprobada(c.id, 100_000n);
    const { operacion } = await ledger.registrarOperacion(
      opDto({ cajeroId: c.id, totalCents: 60_000n }),
    );
    // la ampliación se consume (no cabía en límite base 0)
    expect(operacion.ampliacionId).toBe(amp.id);
    expect((await prisma.ampliacionCredito.findUniqueOrThrow({ where: { id: amp.id } })).estado)
      .toBe('consumida');
    expect((await perfil(c.id)).saldoCents).toBe(60_000n);

    // limiteEfectivo ahora = 0 (la ampliación consumida no cuenta)
    const r = await semaforo.calcular(c.id);
    expect(r.pct).toBe(0);
    expect(r.estado).toBe('verde');
    expect(r.bloqueado).toBe(false);
    expect(r.disponibleCents).toBe(0n);
  });
});

// ───────────────────────────────────────────────────────────────────────
// BLOQUE 4 — FIFO, saldo a favor y reglas de negocio (reglas 7 y 8)
// ───────────────────────────────────────────────────────────────────────

describe('Bloque 4 — FIFO, saldo a favor y reglas de negocio', () => {
  test('FIFO 1 — deudaDesde apunta al cargo más antiguo sin saldar cuando hay varios cargos y un abono parcial', async () => {
    // Dos cargos: 60.000 (día 1) y 40.000 (día 2). Un abono de 30.000 salda
    // parcialmente el cargo más viejo. deudaDesde debe seguir apuntando al
    // cargo más antiguo (que sigue debiendo 30.000).
    const c = await crearCajero({ limiteCents: 200_000n });

    const op1 = await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 60_000n }));
    await new Promise((r) => setTimeout(r, 50));
    await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 40_000n }));

    const fechaOp1 = (await perfil(c.id)).deudaDesde!;
    expect(fechaOp1).not.toBeNull();

    // Abono parcial de 30.000: salda 30.000 del cargo más viejo (quedan 30.000)
    await ledger.registrarCobro(cobroDto({ cajeroId: c.id, montoCents: 30_000n }));

    const p = await perfil(c.id);
    expect(p.saldoCents).toBe(70_000n); // 60 + 40 - 30
    // deudaDesde sigue apuntando al cargo más viejo (op1), que sigue debiendo 30.000
    expect(p.deudaDesde).not.toBeNull();
    expect(p.deudaDesde!.getTime()).toBe(fechaOp1.getTime());
  });

  test('FIFO 2 — abono que salda el cargo más viejo pero deja el segundo vivo: deudaDesde pasa al segundo', async () => {
    // Cargo 60.000 (día 1), cargo 40.000 (día 2). Abono de 60.000 salda el
    // primero completamente. deudaDesde debe pasar al segundo cargo.
    const c = await crearCajero({ limiteCents: 200_000n });

    await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 60_000n }));
    await new Promise((r) => setTimeout(r, 50));
    await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 40_000n }));

    const fechaOp1 = (await perfil(c.id)).deudaDesde!;

    // Abono de 60.000 salda exactamente el cargo más viejo
    await ledger.registrarCobro(cobroDto({ cajeroId: c.id, montoCents: 60_000n }));

    const p = await perfil(c.id);
    expect(p.saldoCents).toBe(40_000n);
    expect(p.deudaDesde).not.toBeNull();
    // deudaDesde ahora apunta al segundo cargo, no al primero
    expect(p.deudaDesde!.getTime()).toBeGreaterThan(fechaOp1.getTime());
  });

  test('FIFO 3 — anulación de cobro que reabre cargo viejo: deudaDesde vuelve a la fecha del cargo original', async () => {
    // Este es el caso clave que pidió el usuario: si un abono saldó el cargo
    // más antiguo y luego ese abono se anula, deudaDesde tiene que volver a
    // la fecha del cargo viejo, no quedarse en la del reciente.
    const c = await crearCajero({ limiteCents: 200_000n });

    await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 60_000n }));
    await new Promise((r) => setTimeout(r, 50));
    await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 40_000n }));

    const fechaOp1 = (await perfil(c.id)).deudaDesde!;

    // Abono de 60.000 salda el cargo más viejo → deudaDesde pasa al segundo
    const { cobro } = await ledger.registrarCobro(cobroDto({ cajeroId: c.id, montoCents: 60_000n }));
    expect((await perfil(c.id)).deudaDesde!.getTime()).toBeGreaterThan(fechaOp1.getTime());

    // Anular el cobro: el cargo más viejo reaparece como insaldado
    await ledger.anular('cobro', cobro.id, 'reverso que reabre cargo viejo', ACTOR);

    const p = await perfil(c.id);
    expect(p.saldoCents).toBe(100_000n); // 60 + 40
    expect(p.deudaDesde).not.toBeNull();
    // deudaDesde vuelve a la fecha del cargo más viejo (op1)
    expect(p.deudaDesde!.getTime()).toBe(fechaOp1.getTime());
  });

  test('FIFO 4 — sobrepago que salda todo y deja saldo a favor: deudaDesde = null', async () => {
    // Cargo de 60.000, abono de 100.000 → saldo -40.000, deudaDesde null
    const c = await crearCajero({ limiteCents: 200_000n });

    await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 60_000n }));
    expect((await perfil(c.id)).deudaDesde).not.toBeNull();

    await ledger.registrarCobro(cobroDto({ cajeroId: c.id, montoCents: 100_000n }));

    const p = await perfil(c.id);
    expect(p.saldoCents).toBe(-40_000n);
    expect(p.deudaDesde).toBeNull();
  });

  test('Saldo a favor 1 — disponible = límite + saldo a favor dentro del FOR UPDATE', async () => {
    // Límite 100.000, saldo a favor 50.000 → disponible = 150.000.
    // Una operación de 150.000 debe pasar; una de 150.001 debe fallar.
    const c = await crearCajero({ limiteCents: 100_000n });

    // Crear saldo a favor: cargo 60.000, abono 110.000 → saldo -50.000
    await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 60_000n }));
    await ledger.registrarCobro(cobroDto({ cajeroId: c.id, montoCents: 110_000n }));
    expect((await perfil(c.id)).saldoCents).toBe(-50_000n);

    // Operación de 150.000 pasa (disponible = 100.000 + 50.000 = 150.000)
    const { operacion } = await ledger.registrarOperacion(
      opDto({ cajeroId: c.id, totalCents: 150_000n }),
    );
    expect(operacion.estado).toBe('pendiente');
    expect((await perfil(c.id)).saldoCents).toBe(100_000n); // -50.000 + 150.000

    // Operación de 1 centavo más rebota: disponible = 0
    await expect(
      ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 1n })),
    ).rejects.toMatchObject({ code: 'SIN_CUPO' });
  });

  test('Saldo a favor 2 — semáforo: pct = 0 y estado verde con saldo a favor', async () => {
    const c = await crearCajero({ limiteCents: 100_000n });

    // Saldo a favor de 50.000
    await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 60_000n }));
    await ledger.registrarCobro(cobroDto({ cajeroId: c.id, montoCents: 110_000n }));

    const r = await semaforo.calcular(c.id);
    expect(r.pct).toBe(0);
    expect(r.estado).toBe('verde');
    expect(r.bloqueado).toBe(false);
    expect(r.dias).toBe(0);
    // disponible = 100.000 + 50.000 = 150.000
    expect(r.disponibleCents).toBe(150_000n);
  });

  test('Saldo a favor 3 — contador de días arranca cuando el saldo a favor llega a cero', async () => {
    // Un cajero con saldo a favor opera y consume ese saldo. El contador
    // de días no arranca mientras tenga saldo a favor; arranca cuando
    // el saldo pasa a positivo.
    const c = await crearCajero({ limiteCents: 200_000n });

    // Saldo a favor de 40.000
    await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 60_000n }));
    await ledger.registrarCobro(cobroDto({ cajeroId: c.id, montoCents: 100_000n }));
    expect((await perfil(c.id)).saldoCents).toBe(-40_000n);
    expect((await perfil(c.id)).deudaDesde).toBeNull();

    // Opera 40.000: consume el saldo a favor, queda en 0
    await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 40_000n }));
    expect((await perfil(c.id)).saldoCents).toBe(0n);
    // deudaDesde sigue null: no hay deuda
    expect((await perfil(c.id)).deudaDesde).toBeNull();

    // Opera 1 centavo más: ahora tiene deuda, el reloj arranca
    await new Promise((r) => setTimeout(r, 50));
    await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 1_000n }));
    const p = await perfil(c.id);
    expect(p.saldoCents).toBe(1_000n);
    expect(p.deudaDesde).not.toBeNull();

    // Semáforo: 1 día = 0 (verde por días), pct = 1000/200000 = 0.005 (verde)
    const r = await semaforo.calcular(c.id);
    expect(r.dias).toBe(0);
    expect(r.estado).toBe('verde');
  });

  test('Saldo a favor 4 — anular operación que dejó saldo a favor: el reverso puede dejar saldo positivo y deudaDesde se reconstruye', async () => {
    // Cargo 60.000, abono 100.000 → saldo -40.000.
    // Anular el abono: saldo vuelve a 60.000, deudaDesde reconstruye al cargo.
    const c = await crearCajero({ limiteCents: 200_000n });

    await ledger.registrarOperacion(opDto({ cajeroId: c.id, totalCents: 60_000n }));
    const fechaCargo = (await perfil(c.id)).deudaDesde!;

    const { cobro } = await ledger.registrarCobro(cobroDto({ cajeroId: c.id, montoCents: 100_000n }));
    expect((await perfil(c.id)).saldoCents).toBe(-40_000n);
    expect((await perfil(c.id)).deudaDesde).toBeNull();

    // Anular el cobro
    await ledger.anular('cobro', cobro.id, 'anulo abono que dejó saldo a favor', ACTOR);

    const p = await perfil(c.id);
    expect(p.saldoCents).toBe(60_000n);
    expect(p.deudaDesde).not.toBeNull();
    // deudaDesde vuelve al cargo original
    expect(p.deudaDesde!.getTime()).toBe(fechaCargo.getTime());
  });
});
