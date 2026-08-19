import { PrismaClient, Rol, TipoMovimiento, MetodoCobro, EstadoOperacion, EstadoCierre } from '@prisma/client';
import * as crypto from 'crypto';
import argon2 from 'argon2';
const randomUUID = crypto.randomUUID;

const prisma = new PrismaClient();

// ───────────────────────── ayudantes ─────────────────────────

const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
const hoursAgo = (n: number) => new Date(now.getTime() - n * 60 * 60 * 1000);

// Contraseña de desarrollo para todos los usuarios del seed.
// En producción las cuentas las crea el admin con contraseñas individuales.
const DEV_PASSWORD = 'tav1234';

// ───────────────────────── estructura del seed ─────────────────────────

async function main() {
  // GUARDA: el seed crea usuarios con contraseña tav1234.
  // Eso es aceptable en desarrollo; inaceptable en un servidor público.
  if (process.env.NODE_ENV === 'production') {
    console.error('ABORTADO: el seed no puede correr en producción.');
    console.error('Los usuarios del seed tienen contraseña tav1234.');
    console.error('En producción, el admin crea las cuentas desde la API.');
    process.exit(1);
  }

  // Hash real con argon2 — mismo algoritmo que usa auth.service.ts en runtime.
  const PASS_HASH = await argon2.hash(DEV_PASSWORD);

  // Limpiar todo en orden de dependencias
  await prisma.auditLog.deleteMany();
  await prisma.aviso.deleteMany();
  await prisma.atencion.deleteMany();
  await prisma.cobro.deleteMany();
  await prisma.movimiento.deleteMany();
  await prisma.operacion.deleteMany();
  await prisma.ampliacionCredito.deleteMany();
  await prisma.cierre.deleteMany();
  await prisma.tasa.deleteMany();
  await prisma.perfilCajero.deleteMany();
  await prisma.perfilCobrador.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.config.deleteMany();

  // ── Config ──
  await prisma.config.createMany({
    data: [
      { clave: 'semaforo.dias_ambar', valor: '4' },
      { clave: 'semaforo.dias_rojo', valor: '7' },
      { clave: 'semaforo.pct_ambar', valor: '0.75' },
    ],
  });

  // ── Admin ──
  const admin = await prisma.usuario.create({
    data: {
      id: randomUUID(),
      rol: Rol.admin,
      nombre: 'Iván Rojas',
      telefono: '+584120000001',
      passwordHash: PASS_HASH,
      creadoPorId: null,
    },
  });

  // ── Cobradores ──
  const cob1 = await prisma.usuario.create({
    data: {
      id: randomUUID(),
      rol: Rol.cobrador,
      nombre: 'Carlos Pérez',
      telefono: '+584120000002',
      passwordHash: PASS_HASH,
      creadoPorId: admin.id,
      perfilCobrador: { create: { zona: 'Centro' } },
    },
    include: { perfilCobrador: true },
  });

  const cob2 = await prisma.usuario.create({
    data: {
      id: randomUUID(),
      rol: Rol.cobrador,
      nombre: 'Luis Gómez',
      telefono: '+584120000003',
      passwordHash: PASS_HASH,
      creadoPorId: admin.id,
      perfilCobrador: { create: { zona: 'Este' } },
    },
    include: { perfilCobrador: true },
  });

  // ── Tasas ──
  await prisma.tasa.create({
    data: {
      id: randomUUID(),
      par: 'USDT_BS',
      valor: 285.4,
      creadaPorId: admin.id,
      vigenteDesde: daysAgo(30),
    },
  });

  await prisma.tasa.create({
    data: {
      id: randomUUID(),
      par: 'USD_BS',
      valor: 283.0,
      creadaPorId: admin.id,
      vigenteDesde: daysAgo(30),
    },
  });

  // ── Cajeros ──
  // Definimos límites y escenarios. El saldo se deriva de los movimientos.
  interface CajeroSpec {
    nombre: string;
    telefono: string;
    zona: string;
    limiteCents: bigint;
    ultimaVezAt: Date | null;
    descripcion: string;
  }

  const cajeroSpecs: CajeroSpec[] = [
    // 1. Bloqueado al 100% del cupo
    { nombre: 'José Blanco', telefono: '+584120000010', zona: 'Centro', limiteCents: 500_00n, ultimaVezAt: hoursAgo(2), descripcion: 'Bloqueado 100%' },
    // 2. Al 88% del cupo
    { nombre: 'Ana Rodríguez', telefono: '+584120000011', zona: 'Centro', limiteCents: 1000_00n, ultimaVezAt: hoursAgo(5), descripcion: '88% cupo' },
    // 3. 8 días de deuda
    { nombre: 'Pedro Mendoza', telefono: '+584120000012', zona: 'Este', limiteCents: 2000_00n, ultimaVezAt: hoursAgo(3), descripcion: '8 días deuda' },
    // 4. Sin conectarse hace 4 días
    { nombre: 'María Torres', telefono: '+584120000013', zona: 'Este', limiteCents: 800_00n, ultimaVezAt: daysAgo(4), descripcion: 'Sin conexión 4 días' },
    // 5-6. Completamente al día
    { nombre: 'Carlos Ruiz', telefono: '+584120000014', zona: 'Centro', limiteCents: 1500_00n, ultimaVezAt: hoursAgo(1), descripcion: 'Al día' },
    { nombre: 'Sofía Díaz', telefono: '+584120000015', zona: 'Este', limiteCents: 600_00n, ultimaVezAt: hoursAgo(6), descripcion: 'Al día' },
    // 7. Saldo bajo, al día
    { nombre: 'Luis Hernández', telefono: '+584120000016', zona: 'Centro', limiteCents: 1200_00n, ultimaVezAt: hoursAgo(8), descripcion: 'Al día, saldo bajo' },
    // 8. Con deuda moderada
    { nombre: 'Elena Vargas', telefono: '+584120000017', zona: 'Este', limiteCents: 3000_00n, ultimaVezAt: hoursAgo(12), descripcion: 'Deuda moderada' },
  ];

  // Crear usuarios cajeros con perfiles
  const cajeros: { id: string; perfilId: string; limiteCents: bigint; spec: CajeroSpec }[] = [];

  for (const spec of cajeroSpecs) {
    const usuario = await prisma.usuario.create({
      data: {
        id: randomUUID(),
        rol: Rol.cajero,
        nombre: spec.nombre,
        telefono: spec.telefono,
        passwordHash: PASS_HASH,
        creadoPorId: admin.id,
        ultimaVezAt: spec.ultimaVezAt,
        perfilCajero: {
          create: {
            limiteCents: spec.limiteCents,
            saldoCents: 0n, // se actualiza al final
            zona: spec.zona,
          },
        },
      },
      include: { perfilCajero: true },
    });

    // Prisma crea el perfil con el mismo id del usuario (PK = FK)
    cajeros.push({
      id: usuario.id,
      perfilId: usuario.id, // PerfilCajero.usuarioId = Usuario.id
      limiteCents: spec.limiteCents,
      spec,
    });
  }

  // ── Función para insertar un movimiento y actualizar saldo ──
  // Esta es la única forma de construir saldos: insertar movimiento, derivar saldo.
  let folioOperacion = 2400;
  let folioCobro = 400;

  async function registrarCargo(
    cajeroIdx: number,
    montoUsdCents: bigint,
    fecha: Date,
    creadoPorId: string,
  ): Promise<{ operacionId: string; folio: string }> {
    const cajero = cajeros[cajeroIdx];
    const folio = `TAV-${++folioOperacion}`;
    const operacionId = randomUUID();

    // Leer saldo actual del perfil
    const perfil = await prisma.perfilCajero.findUniqueOrThrow({ where: { usuarioId: cajero.perfilId } });
    const saldoActual = perfil.saldoCents;

    // Insertar operación
    const tasa = 285.4;
    const comisionCents = (montoUsdCents * 3n) / 100n; // 3% comisión
    const totalCents = montoUsdCents + comisionCents;
    const montoDestinoCents = totalCents * BigInt(Math.round(tasa * 100)) / 100n;
    const saldoDespues = saldoActual + totalCents;

    await prisma.operacion.create({
      data: {
        id: operacionId,
        folio,
        clientUuid: randomUUID(),
        cajeroId: cajero.perfilId,
        tipo: 'usdt_bs',
        montoOrigenCents: montoUsdCents,
        monedaOrigen: 'USDT',
        tasaAplicada: tasa,
        comisionCents,
        totalCents,
        montoDestinoCents,
        monedaDestino: 'BS',
        beneficiario: { nombre: 'Cliente genérico', documento: 'V12345678', banco: 'Banesco', cuenta: '0134123456789012', metodo: 'pago_movil' },
        estado: EstadoOperacion.completada,
        creadaPorId: creadoPorId,
        creadaAt: fecha,
      },
    });

    // Insertar movimiento
    await prisma.movimiento.create({
      data: {
        id: randomUUID(),
        cajeroId: cajero.perfilId,
        tipo: TipoMovimiento.cargo,
        montoUsdCents: totalCents,
        saldoDespues,
        origenTipo: 'operacion',
        origenId: operacionId,
        registradoPorId: creadoPorId,
        creadoAt: fecha,
      },
    });

    // Actualizar saldo cache y deudaDesde
    const deudaDesde = perfil.deudaDesde ?? fecha;
    await prisma.perfilCajero.update({
      where: { usuarioId: cajero.perfilId },
      data: { saldoCents: saldoDespues, deudaDesde },
    });

    return { operacionId, folio };
  }

  async function registrarAbono(
    cajeroIdx: number,
    montoUsdCents: bigint,
    fecha: Date,
    cobradorId: string,
  ): Promise<{ cobroId: string; folio: string }> {
    const cajero = cajeros[cajeroIdx];
    const folio = `COB-${++folioCobro}`;
    const cobroId = randomUUID();

    // Leer saldo actual
    const perfil = await prisma.perfilCajero.findUniqueOrThrow({ where: { usuarioId: cajero.perfilId } });
    const saldoActual = perfil.saldoCents;
    const saldoDespues = saldoActual - montoUsdCents;

    // Buscar o crear cierre abierto del cobrador para hoy (fecha del cobro)
    const fechaCierre = new Date(fecha);
    fechaCierre.setHours(0, 0, 0, 0);
    let cierre = await prisma.cierre.findFirst({
      where: { cobradorId, fecha: fechaCierre, estado: EstadoCierre.abierto },
    });

    if (!cierre) {
      cierre = await prisma.cierre.create({
        data: {
          id: randomUUID(),
          cobradorId,
          fecha: fechaCierre,
          estado: EstadoCierre.abierto,
        },
      });
    }

    // Insertar cobro
    await prisma.cobro.create({
      data: {
        id: cobroId,
        folio,
        clientUuid: randomUUID(),
        cajeroId: cajero.perfilId,
        cobradorId,
        metodo: MetodoCobro.efectivo_usd,
        montoCents: montoUsdCents,
        moneda: 'USD',
        tasaAplicada: null,
        montoUsdCents,
        esEfectivo: true,
        cierreId: cierre.id,
        creadoAt: fecha,
        sincronizadoAt: fecha,
      },
    });

    // Insertar movimiento
    await prisma.movimiento.create({
      data: {
        id: randomUUID(),
        cajeroId: cajero.perfilId,
        tipo: TipoMovimiento.abono,
        montoUsdCents: -montoUsdCents,
        saldoDespues,
        origenTipo: 'cobro',
        origenId: cobroId,
        registradoPorId: cobradorId,
        creadoAt: fecha,
      },
    });

    // Actualizar saldo cache y deudaDesde
    const deudaDesde = saldoDespues === 0n ? null : perfil.deudaDesde;
    await prisma.perfilCajero.update({
      where: { usuarioId: cajero.perfilId },
      data: { saldoCents: saldoDespues, deudaDesde },
    });

    // Recalcular totales del cierre
    const cobrosCierre = await prisma.cobro.findMany({ where: { cierreId: cierre.id } });
    const totalRegistrado = cobrosCierre.reduce((sum, c) => sum + c.montoUsdCents, 0n);
    const efectivoDeclarado = cobrosCierre.filter(c => c.esEfectivo).reduce((sum, c) => sum + c.montoUsdCents, 0n);
    const digital = totalRegistrado - efectivoDeclarado;
    await prisma.cierre.update({
      where: { id: cierre.id },
      data: { totalRegistradoCents: totalRegistrado, efectivoDeclaradoCents: efectivoDeclarado, digitalCents: digital },
    });

    return { cobroId, folio };
  }

  // ── Movimientos históricos (15 total) ──
  // Cada cajero recibe cargos y/o abonos. El saldo queda como suma natural.

  // Cajero 0: José Blanco — bloqueado al 100% (saldo = límite = 500.00)
  // Cargo 600.00 + 3% com = 618.00, abono 118.00 → saldo = 500.00 = 100%
  await registrarCargo(0, 600_00n, daysAgo(5), cajeros[0].id);
  await registrarAbono(0, 118_00n, daysAgo(3), cob1.perfilCobrador!.usuarioId);

  // Cajero 1: Ana Rodríguez — 88% del cupo (saldo = 880.00 de 1000.00)
  // Cargo 1000.00 + 3% com = 1030.00, abono 150.00 → saldo = 880.00 = 88%
  await registrarCargo(1, 1000_00n, daysAgo(4), cajeros[1].id);
  await registrarAbono(1, 150_00n, daysAgo(2), cob1.perfilCobrador!.usuarioId);

  // Cajero 2: Pedro Mendoza — 8 días de deuda (deudaDesde = 8 días atrás)
  await registrarCargo(2, 500_00n, daysAgo(8), cajeros[2].id);
  await registrarCargo(2, 300_00n, daysAgo(3), cajeros[2].id);

  // Cajero 3: María Torres — sin conectarse hace 4 días, saldo moderado
  await registrarCargo(3, 400_00n, daysAgo(6), cajeros[3].id);
  await registrarAbono(3, 150_00n, daysAgo(5), cob2.perfilCobrador!.usuarioId);

  // Cajero 4: Carlos Ruiz — al día, saldo bajo
  // Cargo 200.00 + 3% = 206.00, abono 200.00 → saldo = 6.00
  await registrarCargo(4, 200_00n, daysAgo(2), cajeros[4].id);
  await registrarAbono(4, 200_00n, daysAgo(1), cob1.perfilCobrador!.usuarioId);

  // Cajero 5: Sofía Díaz — al día, saldo cero
  // Cargo 300.00 + 3% = 309.00, abono 309.00 → saldo = 0
  await registrarCargo(5, 300_00n, daysAgo(3), cajeros[5].id);
  await registrarAbono(5, 309_00n, daysAgo(1), cob2.perfilCobrador!.usuarioId);

  // Cajero 6: Luis Hernández — al día, saldo muy bajo
  // Cargo 100.00 + 3% = 103.00, abono 100.00 → saldo = 3.00
  await registrarCargo(6, 100_00n, daysAgo(1), cajeros[6].id);
  await registrarAbono(6, 100_00n, hoursAgo(12), cob1.perfilCobrador!.usuarioId);

  // Cajero 7: Elena Vargas — deuda moderada
  await registrarCargo(7, 800_00n, daysAgo(6), cajeros[7].id);
  await registrarAbono(7, 300_00n, daysAgo(4), cob2.perfilCobrador!.usuarioId);
  await registrarCargo(7, 200_00n, daysAgo(2), cajeros[7].id);

  // Total: 15 movimientos (9 cargos + 6 abonos)

  // ── Verificación final: imprimir saldos ──
  for (let i = 0; i < cajeros.length; i++) {
    const perfil = await prisma.perfilCajero.findUniqueOrThrow({ where: { usuarioId: cajeros[i].perfilId } });
    const movs = await prisma.movimiento.findMany({ where: { cajeroId: cajeros[i].perfilId }, orderBy: { seq: 'asc' } });
    const suma = movs.reduce((acc, m) => acc + m.montoUsdCents, 0n);
    const pct = perfil.limiteCents > 0n ? Number(perfil.saldoCents * 100n / perfil.limiteCents) : 0;
    console.log(`  ${cajeros[i].spec.nombre}: saldo=${perfil.saldoCents} suma=${suma} ${perfil.saldoCents === suma ? '✓' : '✗ DESCUADRE'} (${pct}%)`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
