import { PrismaClient, Prisma, Rol, TipoMovimiento, MetodoCobro, EstadoOperacion, EstadoCierre } from '@prisma/client';
import * as crypto from 'crypto';
import argon2 from 'argon2';
import { CajaService } from '../src/cajas/caja.service';
import { calcularMontoDestinoEsperado, cuadraApertura } from '../src/cajas/coherencia-caja';
const randomUUID = crypto.randomUUID;

const prisma = new PrismaClient();
// El seed pasa por el mismo CajaService que runtime: misma validación,
// misma idempotencia, mismo FOR UPDATE, misma doble entrada. No escribe
// movimientos directo contra Prisma.
const cajas = new CajaService(prisma as never);

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
  await prisma.perfilPagador.deleteMany();
  await prisma.movimientoCaja.deleteMany();
  await prisma.caja.deleteMany();
  await prisma.corredor.deleteMany();
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
      email: 'admin@tav.test',
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
      email: 'cobrador1@tav.test',
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
      email: 'cobrador2@tav.test',
      telefono: '+584120000003',
      passwordHash: PASS_HASH,
      creadoPorId: admin.id,
      perfilCobrador: { create: { zona: 'Este' } },
    },
    include: { perfilCobrador: true },
  });

  // ── Pagadores ──
  // Un pagador por país: ve la cola de operaciones pendientes cuyo corredor
  // es de su país. VEN atiende Venezuela, BRA atiende Brasil.
  const pagadorVen = await prisma.usuario.create({
    data: {
      id: randomUUID(),
      rol: Rol.pagador,
      nombre: 'Ana Pagadora',
      email: 'pagador.ven@tav.test',
      telefono: '+584120000020',
      passwordHash: PASS_HASH,
      creadoPorId: admin.id,
      perfilPagador: { create: { pais: 'VEN', notas: 'Pagadora de Venezuela' } },
    },
    include: { perfilPagador: true },
  });

  const pagadorBra = await prisma.usuario.create({
    data: {
      id: randomUUID(),
      rol: Rol.pagador,
      nombre: 'Bruno Pagador',
      email: 'pagador.bra@tav.test',
      telefono: '+551100000020',
      passwordHash: PASS_HASH,
      creadoPorId: admin.id,
      perfilPagador: { create: { pais: 'BRA', notas: 'Pagador de Brasil' } },
    },
    include: { perfilPagador: true },
  });

  // ── Tasas ──
  // Tasas de conversión de cobros a la moneda base (GYD). Cada moneda de
  // cobro tiene su propia tasa: USD y USDT no cotizan igual. El cobrador
  // no escribe tasas; el servicio lee la vigente de aquí.
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

  await prisma.tasa.create({
    data: {
      id: randomUUID(),
      par: 'USD_GYD',
      valor: 209.0,
      creadaPorId: admin.id,
      vigenteDesde: daysAgo(30),
    },
  });

  await prisma.tasa.create({
    data: {
      id: randomUUID(),
      par: 'USDT_GYD',
      valor: 208.0,
      creadaPorId: admin.id,
      vigenteDesde: daysAgo(30),
    },
  });

  await prisma.tasa.create({
    data: {
      id: randomUUID(),
      par: 'BS_GYD',
      valor: 0.732314,
      creadaPorId: admin.id,
      vigenteDesde: daysAgo(30),
    },
  });

  // GYD → GYD: tasa identidad. El cobro en efectivo guyanés no necesita
  // conversión, pero el servicio la lee igual que las demás para no tener
  // una rama especial. Es 1:1.
  await prisma.tasa.create({
    data: {
      id: randomUUID(),
      par: 'GYD_GYD',
      valor: 1.0,
      creadaPorId: admin.id,
      vigenteDesde: daysAgo(30),
    },
  });

  // ── Corredores (Fase 9) ──
  // Los seis corredores iniciales que dio Saddiel. La lista NO se quema en
  // el código: el admin puede añadir más desde el panel. Uno desactivado
  // desaparece de la app del cajero pero conserva su historia.
  //
  // Un corredor es destino + forma de entrega, NO un par de monedas.
  // Venezuela tiene dos (Bs por transferencia y USD en efectivo) con tasas
  // distintas; por eso no se modela como par de monedas.
  interface CorredorSpec {
    pais: string;
    paisNombre: string;
    moneda: string;
    monedaNombre: string;
    formaEntrega: string;
    formaEntregaNombre: string;
  }

  const corredorSpecs: CorredorSpec[] = [
    { pais: 'VEN', paisNombre: 'Venezuela', moneda: 'BS',  monedaNombre: 'Bolívares',        formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia' },
    { pais: 'VEN', paisNombre: 'Venezuela', moneda: 'USD', monedaNombre: 'Dólares',          formaEntrega: 'efectivo',      formaEntregaNombre: 'Efectivo en mano' },
    { pais: 'BRA', paisNombre: 'Brasil',    moneda: 'BRL', monedaNombre: 'Reales',           formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia (Pix)' },
    { pais: 'COL', paisNombre: 'Colombia',  moneda: 'COP', monedaNombre: 'Pesos colombianos',formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia' },
    { pais: 'DOM', paisNombre: 'Rep. Dominicana', moneda: 'DOP', monedaNombre: 'Pesos dominicanos', formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia' },
    { pais: 'MEX', paisNombre: 'México',    moneda: 'MXN', monedaNombre: 'Pesos mexicanos',  formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia' },
  ];

  const corredores: { id: string; spec: CorredorSpec }[] = [];
  for (const spec of corredorSpecs) {
    const c = await prisma.corredor.create({
      data: {
        id: randomUUID(),
        creadoPorId: admin.id,
        ...spec,
      },
    });
    corredores.push({ id: c.id, spec });
  }

  // ── Caja madre USDT ──
  // USDT es la caja madre: las cajas de corredor se llenan convirtiendo
  // desde aquí. Es una caja sin corredor (esMadre=true, corredorId=null),
  // garantizado por el CHECK Caja_esMadre_xor_corredorId.
  const cajaMadreUsdt = await prisma.caja.create({
    data: {
      id: randomUUID(),
      esMadre: true,
      moneda: 'USDT',
      saldoCents: 0n,
    },
  });

  // ── Cajas de corredor ──
  // Una caja por corredor. Saldo 0 al nacer; se abre abajo con una
  // conversión desde USDT (movimiento `apertura` con doble entrada).
  const cajasCorredor: { id: string; corredorId: string; spec: CorredorSpec }[] = [];
  for (const { id: corredorId, spec } of corredores) {
    const caja = await prisma.caja.create({
      data: {
        id: randomUUID(),
        corredorId,
        esMadre: false,
        moneda: spec.moneda,
        saldoCents: 0n,
        // Umbral de alerta: 10% del saldo inicial sembrado. Así la alerta
        // de saldo bajo funciona desde el día uno.
        umbralAlertaCents: null, // se fija tras la apertura abajo
      },
    });
    cajasCorredor.push({ id: caja.id, corredorId, spec });
  }

  // ── Ingreso a la caja madre + aperturas por corredor ──
  // El seed pasa por CajaService.ingresarCajaMadre y CajaService.abrirCaja:
  // misma validación, misma doble entrada, mismo FOR UPDATE que runtime.
  // Antes de cada apertura se verifica la coherencia aritmética con
  // cuadraApertura — la misma función que usa el DTO HTTP. Si los números
  // del seed no cuadran, el seed falla y no siembra datos inválidos.
  //
  // Ingreso: 50.000 USDT (5.000.000 cents) a la caja madre.
  await cajas.ingresarCajaMadre({
    clientUuid: randomUUID(),
    cajaMadreId: cajaMadreUsdt.id,
    montoCents: 5_000_000n,
    motivo: 'Capital inicial sembrado',
    registradoPorId: admin.id,
  });

  // Apertura por corredor: tasas realistas (1 USDT = X moneda destino).
  // montoMadre en centavos USDT, montoDestino se calcula con
  // calcularMontoDestinoEsperado (mismo redondeo half-up que el DTO).
  // USD usa 0.995, no 1: el sistema tiene USD_GYD=209 y USDT_GYD=208,
  // o sea que un USDT vale algo menos que un dólar físico.
  const tasasApertura: Record<string, { tasa: string; montoMadre: bigint }> = {
    BS:  { tasa: '285.4', montoMadre: 1_000_000n },   // 10.000 USDT → 2.854.000,00 Bs
    USD: { tasa: '0.995', montoMadre: 500_000n },     // 5.000 USDT → 4.975,00 USD
    BRL: { tasa: '5.5',   montoMadre: 800_000n },    // 8.000 USDT → 44.000,00 BRL
    COP: { tasa: '4150',  montoMadre: 600_000n },    // 6.000 USDT → 24.900.000,00 COP
    DOP: { tasa: '58.5',  montoMadre: 400_000n },    // 4.000 USDT → 234.000,00 DOP
    MXN: { tasa: '20.4',  montoMadre: 700_000n },    // 7.000 USDT → 142.800,00 MXN
  };

  for (const { id: cajaId, spec } of cajasCorredor) {
    const cfg = tasasApertura[spec.moneda];
    if (!cfg) continue; // moneda no contemplada: la caja queda en 0

    const montoDestino = calcularMontoDestinoEsperado(cfg.montoMadre, cfg.tasa);
    if (montoDestino === null) throw new Error(`Tasa inválida en seed: ${cfg.tasa}`);

    // Misma validación de coherencia que el DTO HTTP.
    if (!cuadraApertura(cfg.montoMadre, montoDestino, cfg.tasa)) {
      throw new Error(
        `Seed incoherente para ${spec.moneda}: montoMadre=${cfg.montoMadre} ` +
          `tasa=${cfg.tasa} montoDestino=${montoDestino} no cuadran`,
      );
    }

    // Abrir por el servicio: doble entrada, FOR UPDATE, idempotencia.
    const res = await cajas.abrirCaja({
      clientUuid: randomUUID(),
      cajaId,
      cajaMadreId: cajaMadreUsdt.id,
      montoMadreCents: cfg.montoMadre,
      montoDestinoCents: montoDestino,
      tasaConversion: cfg.tasa,
      registradoPorId: admin.id,
    });

    // Umbral de alerta: 10% del saldo inicial. La alerta de saldo bajo
    // funciona desde el día uno.
    await prisma.caja.update({
      where: { id: res.cajaDestino.id },
      data: { umbralAlertaCents: montoDestino / 10n },
    });
  }

  // ── Publicación inicial de tasas por corredor (Fase 9 Bloque 3) ──
  // La tasa que ve el cajero se compone de tres números: pata base (1 USDT = X GYD),
  // pata destino (1 USDT = Y moneda destino) y margen (%). Ver docs/07 §3.
  //
  //   tasaCotizada = (pataDestino ÷ pataBase) × (1 − margen/100)
  //
  // Pata base 208 (1 USDT = 208 GYD). Patas destino y márgenes realistas
  // por corredor. La publicación es atómica: un snapshot completo.
  const pataBase = new Prisma.Decimal(208);
  const itemsTasas = corredores.map(({ id: corredorId, spec }) => {
    const pataDestino = new Prisma.Decimal(
      spec.moneda === 'BS' ? 285 :
      spec.moneda === 'USD' ? 1 :
      spec.moneda === 'BRL' ? 5.5 :
      spec.moneda === 'COP' ? 4150 :
      spec.moneda === 'DOP' ? 58.5 :
      spec.moneda === 'MXN' ? 20.4 : 1,
    );
    const margen = new Prisma.Decimal(2.5);
    const tasaCotizada = pataDestino.div(pataBase).mul(new Prisma.Decimal(1).minus(margen.div(100)));
    return { corredorId, pataDestino, margen, tasaCotizada };
  });

  const publicacionTasas = await prisma.publicacionTasas.create({
    data: {
      pataBase,
      publicadaPorId: admin.id,
      items: { create: itemsTasas },
    },
  });
  void publicacionTasas;

  // ── Cajeros ──
  // Definimos límites y escenarios. El saldo se deriva de los movimientos.
  interface CajeroSpec {
    nombre: string;
    email: string;
    telefono: string;
    zona: string;
    limiteCents: bigint;
    ultimaVezAt: Date | null;
    descripcion: string;
  }

  const cajeroSpecs: CajeroSpec[] = [
    // 1. Bloqueado al 100% del cupo — antes 500 USD → ~100.000 GYD
    { nombre: 'José Blanco', email: 'cajero.bloqueado@tav.test', telefono: '+584120000010', zona: 'Centro', limiteCents: 100_000_00n, ultimaVezAt: hoursAgo(2), descripcion: 'Bloqueado 100%' },
    // 2. Al 88% del cupo — antes 1000 USD → ~200.000 GYD
    { nombre: 'Ana Rodríguez', email: 'ana.rodriguez@tav.test', telefono: '+584120000011', zona: 'Centro', limiteCents: 200_000_00n, ultimaVezAt: hoursAgo(5), descripcion: '88% cupo' },
    // 3. 8 días de deuda — antes 2000 USD → ~400.000 GYD
    { nombre: 'Pedro Mendoza', email: 'pedro.mendoza@tav.test', telefono: '+584120000012', zona: 'Este', limiteCents: 400_000_00n, ultimaVezAt: hoursAgo(3), descripcion: '8 días deuda' },
    // 4. Sin conectarse hace 4 días — antes 800 USD → ~160.000 GYD
    { nombre: 'María Torres', email: 'maria.torres@tav.test', telefono: '+584120000013', zona: 'Este', limiteCents: 160_000_00n, ultimaVezAt: daysAgo(4), descripcion: 'Sin conexión 4 días' },
    // 5-6. Completamente al día — antes 1500/600 USD → ~300.000/125.000 GYD
    { nombre: 'Carlos Ruiz', email: 'carlos.ruiz@tav.test', telefono: '+584120000014', zona: 'Centro', limiteCents: 300_000_00n, ultimaVezAt: hoursAgo(1), descripcion: 'Al día' },
    { nombre: 'Sofía Díaz', email: 'sofia.diaz@tav.test', telefono: '+584120000015', zona: 'Este', limiteCents: 125_000_00n, ultimaVezAt: hoursAgo(6), descripcion: 'Al día' },
    // 7. Saldo bajo, al día — antes 1200 USD → ~250.000 GYD
    { nombre: 'Luis Hernández', email: 'luis.hernandez@tav.test', telefono: '+584120000016', zona: 'Centro', limiteCents: 250_000_00n, ultimaVezAt: hoursAgo(8), descripcion: 'Al día, saldo bajo' },
    // 8. Con deuda moderada — antes 3000 USD → ~600.000 GYD
    { nombre: 'Elena Vargas', email: 'elena.vargas@tav.test', telefono: '+584120000017', zona: 'Este', limiteCents: 600_000_00n, ultimaVezAt: hoursAgo(12), descripcion: 'Deuda moderada' },
  ];

  // Crear usuarios cajeros con perfiles
  const cajeros: { id: string; perfilId: string; limiteCents: bigint; spec: CajeroSpec }[] = [];

  for (const spec of cajeroSpecs) {
    const usuario = await prisma.usuario.create({
      data: {
        id: randomUUID(),
        rol: Rol.cajero,
        nombre: spec.nombre,
        email: spec.email,
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

  // Tasa USDT→GYD del seed (entera para que el cálculo salga limpio).
  const USDT_GYD = 208n;
  const USDT_BS_CENTS = BigInt(Math.round(285.4 * 100)); // 28540 centavos de tasa

  async function registrarCargo(
    cajeroIdx: number,
    montoGydCents: bigint, // total en GYD que suma a la deuda (ya con comisión)
    fecha: Date,
    creadoPorId: string,
  ): Promise<{ operacionId: string; folio: string }> {
    const cajero = cajeros[cajeroIdx];
    const folio = `TAV-${++folioOperacion}`;
    const operacionId = randomUUID();

    // Leer saldo actual del perfil
    const perfil = await prisma.perfilCajero.findUniqueOrThrow({ where: { usuarioId: cajero.perfilId } });
    const saldoActual = perfil.saldoCents;

    // Back-calcular el monto origen (USDT) y la comisión desde el total GYD.
    // total = origen_gyd * 1.03 → origen_gyd = total * 100 / 103
    const origenGyd = (montoGydCents * 100n) / 103n;
    const comisionCents = montoGydCents - origenGyd;

    // Equivalentes para el registro de la operación (informativo):
    const montoOrigenCents = origenGyd / USDT_GYD; // USDT centavos
    const montoDestinoCents = montoOrigenCents * USDT_BS_CENTS / 100n; // BS centavos
    const saldoDespues = saldoActual + montoGydCents;

    await prisma.operacion.create({
      data: {
        id: operacionId,
        folio,
        clientUuid: randomUUID(),
        cajeroId: cajero.perfilId,
        tipo: 'usdt_bs',
        montoOrigenCents,
        monedaOrigen: 'USDT',
        tasaAplicada: 285.4,
        comisionCents,
        totalCents: montoGydCents,
        montoDestinoCents,
        monedaDestino: 'BS',
        beneficiario: { nombre: 'Cliente genérico', documento: 'V12345678', banco: 'Banesco', cuenta: '0134123456789012', metodo: 'pago_movil' },
        estado: EstadoOperacion.completada,
        creadaPorId: creadoPorId,
        creadaAt: fecha,
      },
    });

    // Insertar movimiento (montoCents en GYD, la moneda base)
    await prisma.movimiento.create({
      data: {
        id: randomUUID(),
        cajeroId: cajero.perfilId,
        tipo: TipoMovimiento.cargo,
        montoCents: montoGydCents,
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
    montoGydCents: bigint, // monto en GYD (la moneda base)
    fecha: Date,
    cobradorId: string,
  ): Promise<{ cobroId: string; folio: string }> {
    const cajero = cajeros[cajeroIdx];
    const folio = `COB-${++folioCobro}`;
    const cobroId = randomUUID();

    // Leer saldo actual
    const perfil = await prisma.perfilCajero.findUniqueOrThrow({ where: { usuarioId: cajero.perfilId } });
    const saldoActual = perfil.saldoCents;
    const saldoDespues = saldoActual - montoGydCents;

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

    // Insertar cobro: el abono del seed es en USD efectivo.
    // montoCents = monto en USD centavos; montoBaseCents = monto en GYD centavos.
    const montoUsdCents = montoGydCents / 209n; // USD→GYD tasa 209
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
        tasaAplicada: 209.0,
        montoBaseCents: montoGydCents,
        esEfectivo: true,
        cierreId: cierre.id,
        creadoAt: fecha,
        sincronizadoAt: fecha,
      },
    });

    // Insertar movimiento (montoCents en GYD, la moneda base)
    await prisma.movimiento.create({
      data: {
        id: randomUUID(),
        cajeroId: cajero.perfilId,
        tipo: TipoMovimiento.abono,
        montoCents: -montoGydCents,
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
    const totalRegistrado = cobrosCierre.reduce((sum, c) => sum + c.montoBaseCents, 0n);
    const efectivoGyd = cobrosCierre
      .filter(c => c.esEfectivo && c.moneda === 'GYD')
      .reduce((sum, c) => sum + c.montoCents, 0n);
    const efectivoUsd = cobrosCierre
      .filter(c => c.esEfectivo && c.moneda === 'USD')
      .reduce((sum, c) => sum + c.montoCents, 0n);
    const efectivoTotalGyd = cobrosCierre
      .filter(c => c.esEfectivo)
      .reduce((sum, c) => sum + c.montoBaseCents, 0n);
    const digital = totalRegistrado - efectivoTotalGyd;
    await prisma.cierre.update({
      where: { id: cierre.id },
      data: {
        totalRegistradoCents: totalRegistrado,
        efectivoGydDeclaradoCents: efectivoGyd,
        efectivoUsdDeclaradoCents: efectivoUsd,
        digitalCents: digital,
      },
    });

    return { cobroId, folio };
  }

  // ── Movimientos históricos (15 total) ──
  // Cada cajero recibe cargos y/o abonos. El saldo queda como suma natural.
  // Los montos son en GYD (la moneda base del libro de deuda).

  // Cajero 0: José Blanco — bloqueado al 100% (saldo = límite = 100.000 GYD)
  // Cargo 120.000 GYD (incluye 3% com), abono 20.000 GYD → saldo = 100.000 = 100%
  await registrarCargo(0, 120_000_00n, daysAgo(5), cajeros[0].id);
  await registrarAbono(0, 20_000_00n, daysAgo(3), cob1.perfilCobrador!.usuarioId);

  // Cajero 1: Ana Rodríguez — 88% del cupo (saldo = 176.000 de 200.000 GYD)
  // Cargo 200.000 GYD, abono 24.000 GYD → saldo = 176.000 = 88%
  await registrarCargo(1, 200_000_00n, daysAgo(4), cajeros[1].id);
  await registrarAbono(1, 24_000_00n, daysAgo(2), cob1.perfilCobrador!.usuarioId);

  // Cajero 2: Pedro Mendoza — 8 días de deuda (deudaDesde = 8 días atrás)
  await registrarCargo(2, 100_000_00n, daysAgo(8), cajeros[2].id);
  await registrarCargo(2, 60_000_00n, daysAgo(3), cajeros[2].id);

  // Cajero 3: María Torres — sin conectarse hace 4 días, saldo moderado
  await registrarCargo(3, 80_000_00n, daysAgo(6), cajeros[3].id);
  await registrarAbono(3, 30_000_00n, daysAgo(5), cob2.perfilCobrador!.usuarioId);

  // Cajero 4: Carlos Ruiz — al día, saldo bajo
  // Cargo 40.000 GYD, abono 38.000 GYD → saldo = 2.000 GYD
  await registrarCargo(4, 40_000_00n, daysAgo(2), cajeros[4].id);
  await registrarAbono(4, 38_000_00n, daysAgo(1), cob1.perfilCobrador!.usuarioId);

  // Cajero 5: Sofía Díaz — al día, saldo cero
  // Cargo 60.000 GYD, abono 60.000 GYD → saldo = 0
  await registrarCargo(5, 60_000_00n, daysAgo(3), cajeros[5].id);
  await registrarAbono(5, 60_000_00n, daysAgo(1), cob2.perfilCobrador!.usuarioId);

  // Cajero 6: Luis Hernández — al día, saldo muy bajo
  // Cargo 20.000 GYD, abono 19.400 GYD → saldo = 600 GYD
  await registrarCargo(6, 20_000_00n, daysAgo(1), cajeros[6].id);
  await registrarAbono(6, 19_400_00n, hoursAgo(12), cob1.perfilCobrador!.usuarioId);

  // Cajero 7: Elena Vargas — deuda moderada
  await registrarCargo(7, 160_000_00n, daysAgo(6), cajeros[7].id);
  await registrarAbono(7, 60_000_00n, daysAgo(4), cob2.perfilCobrador!.usuarioId);
  await registrarCargo(7, 40_000_00n, daysAgo(2), cajeros[7].id);

  // Total: 15 movimientos (9 cargos + 6 abonos)

  // ── Verificación final: imprimir saldos ──
  for (let i = 0; i < cajeros.length; i++) {
    const perfil = await prisma.perfilCajero.findUniqueOrThrow({ where: { usuarioId: cajeros[i].perfilId } });
    const movs = await prisma.movimiento.findMany({ where: { cajeroId: cajeros[i].perfilId }, orderBy: { seq: 'asc' } });
    const suma = movs.reduce((acc, m) => acc + m.montoCents, 0n);
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
