import { PrismaClient, Prisma, Rol, TipoMovimiento, MetodoCobro, EstadoOperacion, EstadoCierre } from '@prisma/client';
import * as crypto from 'crypto';
import argon2 from 'argon2';
import { CajaService } from '../src/cajas/caja.service';
import { PrecioCajeroService } from '../src/precio-cajero/precio-cajero.service';
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
  await prisma.precioCajeroServicio.deleteMany();
  await prisma.perfilCajero.deleteMany();
  await prisma.perfilCobrador.deleteMany();
  await prisma.perfilPagador.deleteMany();
  await prisma.movimientoCaja.deleteMany();
  await prisma.corredor.deleteMany();
  await prisma.caja.deleteMany();
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

  // ── Cajas físicas (Fase 9, paso 2: separación Caja/Servicio) ──
  // La caja es FÍSICA: dónde está la plata, no qué servicio la usa. Varios
  // servicios pueden descontar de la misma caja (BCV y tasa especial comparten
  // la caja de bolívares en cuenta). La caja madre USDT no tiene país.
  interface CajaFisicaSpec {
    nombre: string;
    moneda: string;
    pais: string | null;
    // Tasa de apertura desde USDT y monto madre para el saldo inicial.
    tasaApertura: string;
    montoMadreApertura: bigint;
  }

  const cajasFisicasSpecs: CajaFisicaSpec[] = [
    { nombre: 'Bolívares en cuenta', moneda: 'BS',  pais: 'VEN', tasaApertura: '285.4', montoMadreApertura: 2_000_000n },
    { nombre: 'USD en efectivo',      moneda: 'USD', pais: 'VEN', tasaApertura: '0.995', montoMadreApertura: 500_000n },
    { nombre: 'Brasil Pix',           moneda: 'BRL', pais: 'BRA', tasaApertura: '5.5',   montoMadreApertura: 800_000n },
    { nombre: 'Colombia',             moneda: 'COP', pais: 'COL', tasaApertura: '4150',  montoMadreApertura: 600_000n },
    { nombre: 'Rep. Dominicana',      moneda: 'DOP', pais: 'DOM', tasaApertura: '58.5',  montoMadreApertura: 400_000n },
    { nombre: 'México',               moneda: 'MXN', pais: 'MEX', tasaApertura: '20.4',  montoMadreApertura: 700_000n },
  ];

  // Crear las cajas físicas primero. Los servicios las referencian por
  // cajaId, así que necesitan existir antes.
  const cajasFisicas: { id: string; spec: CajaFisicaSpec }[] = [];
  for (const spec of cajasFisicasSpecs) {
    const caja = await prisma.caja.create({
      data: {
        id: randomUUID(),
        esMadre: false,
        moneda: spec.moneda,
        nombre: spec.nombre,
        pais: spec.pais,
        saldoCents: 0n,
        umbralAlertaCents: null, // se fija tras la apertura abajo
      },
    });
    cajasFisicas.push({ id: caja.id, spec });
  }

  // ── Caja madre USDT ──
  // USDT es la caja madre: las cajas físicas se llenan convirtiendo desde
  // aquí. No tiene país ni servicios asociados.
  const cajaMadreUsdt = await prisma.caja.create({
    data: {
      id: randomUUID(),
      esMadre: true,
      moneda: 'USDT',
      nombre: 'Caja madre USDT',
      pais: null,
      saldoCents: 0n,
    },
  });

  // ── Servicios (Corredor = país + producto) ──
  // Los siete servicios reales. BCV y tasa especial son dos servicios
  // distintos que descuentan de la MISMA caja de bolívares en cuenta.
  // La lista NO se quema en el código: el admin puede añadir más desde el
  // panel. Uno desactivado desaparece de la app del cajero pero conserva
  // su historia (las operaciones lo siguen referenciando).
  interface ServicioSpec {
    pais: string;
    paisNombre: string;
    moneda: string;
    monedaNombre: string;
    formaEntrega: string;
    formaEntregaNombre: string;
    servicio: string;
    servicioNombre: string;
    cajaNombre: string; // a qué caja física descuenta
  }

  const servicioSpecs: ServicioSpec[] = [
    { pais: 'VEN', paisNombre: 'Venezuela', moneda: 'BS',  monedaNombre: 'Bolívares',         formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia',        servicio: 'bcv',           servicioNombre: 'BCV',             cajaNombre: 'Bolívares en cuenta' },
    { pais: 'VEN', paisNombre: 'Venezuela', moneda: 'BS',  monedaNombre: 'Bolívares',         formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia',        servicio: 'tasa_especial', servicioNombre: 'Tasa especial',   cajaNombre: 'Bolívares en cuenta' },
    { pais: 'VEN', paisNombre: 'Venezuela', moneda: 'USD', monedaNombre: 'Dólares',          formaEntrega: 'efectivo',      formaEntregaNombre: 'Efectivo en mano',      servicio: 'efectivo',      servicioNombre: 'Efectivo en mano', cajaNombre: 'USD en efectivo' },
    { pais: 'BRA', paisNombre: 'Brasil',    moneda: 'BRL', monedaNombre: 'Reales',            formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia (Pix)',   servicio: 'pix',           servicioNombre: 'Pix',             cajaNombre: 'Brasil Pix' },
    { pais: 'COL', paisNombre: 'Colombia',  moneda: 'COP', monedaNombre: 'Pesos colombianos', formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia',        servicio: 'transferencia', servicioNombre: 'Transferencia',   cajaNombre: 'Colombia' },
    { pais: 'DOM', paisNombre: 'Rep. Dominicana', moneda: 'DOP', monedaNombre: 'Pesos dominicanos', formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia', servicio: 'transferencia', servicioNombre: 'Transferencia',   cajaNombre: 'Rep. Dominicana' },
    { pais: 'MEX', paisNombre: 'México',    moneda: 'MXN', monedaNombre: 'Pesos mexicanos',  formaEntrega: 'transferencia', formaEntregaNombre: 'Transferencia',        servicio: 'transferencia', servicioNombre: 'Transferencia',   cajaNombre: 'México' },
  ];

  const corredores: { id: string; spec: ServicioSpec }[] = [];
  for (const spec of servicioSpecs) {
    const caja = cajasFisicas.find((c) => c.spec.nombre === spec.cajaNombre);
    if (!caja) throw new Error(`Caja física "${spec.cajaNombre}" no encontrada para servicio ${spec.servicio}`);
    const c = await prisma.corredor.create({
      data: {
        id: randomUUID(),
        creadoPorId: admin.id,
        pais: spec.pais,
        paisNombre: spec.paisNombre,
        moneda: spec.moneda,
        monedaNombre: spec.monedaNombre,
        formaEntrega: spec.formaEntrega,
        formaEntregaNombre: spec.formaEntregaNombre,
        servicio: spec.servicio,
        servicioNombre: spec.servicioNombre,
        cajaId: caja.id,
      },
    });
    corredores.push({ id: c.id, spec });
  }

  // Servicio usado para los cargos sembrados: tasa_especial (precio 250 GYD/USD).
  // Así todos los cálculos de totalCents = montoUsdCents × precio son exactos
  // y los porcentajes de cupo quedan redondos.
  const corredorSeedId = corredores[1].id;
  const MONEDA_SEED = corredores[1].spec.moneda;

  // ── Ingreso a la caja madre + aperturas de cajas físicas ──
  // El seed pasa por CajaService.ingresarCajaMadre y CajaService.abrirCaja:
  // misma validación, misma doble entrada, mismo FOR UPDATE que runtime.
  // Antes de cada apertura se verifica la coherencia aritmética con
  // cuadraApertura — la misma función que usa el DTO HTTP. Si los números
  // del seed no cuadran, el seed falla y no siembra datos inválidos.
  //
  // Ingreso: 50.000 USDT (5.000.000 cents) a la caja madre.
  // El precio de compra del USDT es el marcador del día: 237 GYD por USD
  // (Iván compra a 237 y vende entre 240 y 260). Cada operación congela
  // el precio de compra vigente — el del ingreso más reciente.
  await cajas.ingresarCajaMadre({
    clientUuid: randomUUID(),
    cajaMadreId: cajaMadreUsdt.id,
    montoCents: 5_000_000n,
    precioCompraGyd: '237',
    motivo: 'Capital inicial sembrado',
    registradoPorId: admin.id,
  });

  for (const { id: cajaId, spec } of cajasFisicas) {
    const montoDestino = calcularMontoDestinoEsperado(spec.montoMadreApertura, spec.tasaApertura);
    if (montoDestino === null) throw new Error(`Tasa inválida en seed: ${spec.tasaApertura}`);

    // Misma validación de coherencia que el DTO HTTP.
    if (!cuadraApertura(spec.montoMadreApertura, montoDestino, spec.tasaApertura)) {
      throw new Error(
        `Seed incoherente para ${spec.moneda}: montoMadre=${spec.montoMadreApertura} ` +
          `tasa=${spec.tasaApertura} montoDestino=${montoDestino} no cuadran`,
      );
    }

    // Abrir por el servicio: doble entrada, FOR UPDATE, idempotencia.
    const res = await cajas.abrirCaja({
      clientUuid: randomUUID(),
      cajaId,
      cajaMadreId: cajaMadreUsdt.id,
      montoMadreCents: spec.montoMadreApertura,
      montoDestinoCents: montoDestino,
      tasaConversion: spec.tasaApertura,
      registradoPorId: admin.id,
    });

    // Umbral de alerta: 10% del saldo inicial. La alerta de saldo bajo
    // funciona desde el día uno.
    await prisma.caja.update({
      where: { id: res.cajaDestino.id },
      data: { umbralAlertaCents: montoDestino / 10n },
    });
  }

  // ── Precios por cajero (nuevo modelo de Fase 9) ──
  // Se fija después de crear los cajeros (ver más abajo).

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

  // ── Precios por cajero (nuevo modelo de Fase 9) ──
  // Cada cajero tiene su propio precio en GYD por dólar, por servicio, fijado
  // por el admin. El precio determina la deuda: deudaGydCents = round_half_up(
  // montoUsdCents × precioGyd). Ver docs/07 (modelo corregido).
  //
  // La tabla PrecioCajeroServicio es de SOLO INSERCIÓN: cada cambio es un
  // INSERT nuevo. El precio se congela en cada operación; cambiarlo aquí
  // nunca altera una operación registrada.
  //
  // Precios realistas por SERVICIO (GYD por 1 USD). El precio es lo que el
  // cajero paga por cada dólar que envía, igual para todos los destinos: Iván
  // compra a 237 y vende entre 240 y 260. BCV más barato que la tasa especial,
  // el efectivo un poco más caro. Colombia, RD y México comparten el código
  // `transferencia` pero con precios distintos, así que el map es por
  // `pais:servicio`. Todos los cajeros empiezan con el mismo precio; el admin
  // lo cambia desde la ficha.
  const precioPorServicio: Record<string, string> = {
    'VEN:bcv': '240',
    'VEN:tasa_especial': '250',
    'VEN:efectivo': '255',
    'BRA:pix': '245',
    'COL:transferencia': '248',
    'DOM:transferencia': '252',
    'MEX:transferencia': '260',
  };

  // Se fija precio para cada cajero contra cada servicio. Así el cajero ve
  // todos los servicios ofrecibles al arrancar.
  for (const cajero of cajeros) {
    for (const { id: corredorId, spec } of corredores) {
      const clave = `${spec.pais}:${spec.servicio}`;
      const precioGyd = precioPorServicio[clave];
      if (!precioGyd) continue;
      await prisma.precioCajeroServicio.create({
        data: {
          cajeroId: cajero.perfilId,
          servicioId: corredorId,
          precioGyd: new Prisma.Decimal(precioGyd),
          fijadoPorId: admin.id,
          vigenteDesde: daysAgo(30),
        },
      });
    }
  }

  // ── Función para insertar un movimiento y actualizar saldo ──
  // Esta es la única forma de construir saldos: insertar movimiento, derivar saldo.
  let folioOperacion = 2400;
  let folioCobro = 400;

  async function registrarCargo(
    cajeroIdx: number,
    montoUsdCents: bigint, // monto en dólares (centavos USDT)
    fecha: Date,
    creadoPorId: string,
  ): Promise<{ operacionId: string; folio: string }> {
    const cajero = cajeros[cajeroIdx];
    const folio = `TAV-${++folioOperacion}`;
    const operacionId = randomUUID();

    // Leer saldo actual del perfil y el precio vigente del cajero para el servicio.
    const [perfil, precioGyd] = await Promise.all([
      prisma.perfilCajero.findUniqueOrThrow({ where: { usuarioId: cajero.perfilId } }),
      prisma.precioCajeroServicio.findFirst({
        where: { cajeroId: cajero.perfilId, servicioId: corredorSeedId },
        orderBy: { vigenteDesde: 'desc' },
      }),
    ]);
    if (!precioGyd) {
      throw new Error(`No hay precio para cajero ${cajeroIdx} y servicio ${corredorSeedId}`);
    }
    const saldoActual = perfil.saldoCents;

    // Calcular la deuda en GYD exactamente como lo hace CajeroService.crearOperacion:
    // totalCents = round_half_up(montoUsdCents × precioGyd).
    const totalCents = PrecioCajeroService.calcularDeudaGydCents(montoUsdCents, precioGyd.precioGyd);
    const saldoDespues = saldoActual + totalCents;

    await prisma.operacion.create({
      data: {
        id: operacionId,
        folio,
        clientUuid: randomUUID(),
        cajeroId: cajero.perfilId,
        montoOrigenCents: montoUsdCents,
        monedaOrigen: 'USD',
        tasaAplicada: precioGyd.precioGyd.toString(),
        totalCents,
        montoDestinoCents: 0n, // el pagador lo registra al ejecutar
        monedaDestino: MONEDA_SEED,
        beneficiario: {
          nombre: 'Cliente genérico',
          datos: 'Banco: Banesco\nCuenta: 0134123456789012\nCédula: V12345678\nMétodo: pago_movil',
        },
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
        montoCents: totalCents,
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

    // Insertar cobro: el cajero siempre paga en guyaneses. El monto entra
    // directo al libro, sin conversión.
    await prisma.cobro.create({
      data: {
        id: cobroId,
        folio,
        clientUuid: randomUUID(),
        cajeroId: cajero.perfilId,
        cobradorId,
        metodo: MetodoCobro.efectivo_gyd,
        montoCents: montoGydCents,
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

    // Recalcular totales del cierre — una sola pila de guyaneses.
    const cobrosCierre = await prisma.cobro.findMany({ where: { cierreId: cierre.id } });
    const totalRegistrado = cobrosCierre.reduce((sum, c) => sum + c.montoCents, 0n);
    const efectivo = cobrosCierre
      .filter(c => c.esEfectivo)
      .reduce((sum, c) => sum + c.montoCents, 0n);
    const digital = totalRegistrado - efectivo;
    await prisma.cierre.update({
      where: { id: cierre.id },
      data: {
        totalRegistradoCents: totalRegistrado,
        efectivoDeclaradoCents: efectivo,
        digitalCents: digital,
      },
    });

    return { cobroId, folio };
  }

  // ── Movimientos históricos (15 total) ──
  // Cada cajero recibe cargos y/o abonos. El saldo queda como suma natural.
  // Los montos son en GYD (la moneda base del libro de deuda).

  // Cajero 0: José Blanco — bloqueado al 100% (saldo = límite = 100.000 GYD)
  // Cargo 400 USD × 250 = 100.000 GYD, sin abono → saldo = 100.000 = 100%
  await registrarCargo(0, 40_000n, daysAgo(5), cajeros[0].id);

  // Cajero 1: Ana Rodríguez — 87,5% del cupo (saldo = 175.000 de 200.000 GYD)
  // Cargo 1.000 USD × 250 = 250.000 GYD, abono 300 USD × 250 = 75.000 GYD
  await registrarCargo(1, 100_000n, daysAgo(4), cajeros[1].id);
  await registrarAbono(1, 75_000_00n, daysAgo(2), cob1.perfilCobrador!.usuarioId);

  // Cajero 2: Pedro Mendoza — 8 días de deuda (deudaDesde = 8 días atrás)
  // Dos cargos, sin abono. 700 USD × 250 = 175.000 + 0 = 175.000? No, para 40%
  // de 400.000 = 160.000 GYD. Cargo 700 USD × 250 = 175.000, abono 60 USD × 250 = 15.000
  await registrarCargo(2, 70_000n, daysAgo(8), cajeros[2].id);
  await registrarAbono(2, 15_000_00n, daysAgo(3), cob1.perfilCobrador!.usuarioId);

  // Cajero 3: María Torres — sin conectarse hace 4 días, saldo moderado
  // Cargo 250 USD × 250 = 62.500 GYD, abono 50 USD × 250 = 12.500 GYD → saldo = 50.000
  await registrarCargo(3, 25_000n, daysAgo(6), cajeros[3].id);
  await registrarAbono(3, 12_500_00n, daysAgo(5), cob2.perfilCobrador!.usuarioId);

  // Cajero 4: Carlos Ruiz — al día, saldo bajo
  // Cargo 200 USD × 250 = 50.000 GYD, abono 192 USD × 250 = 48.000 GYD → saldo = 2.000
  await registrarCargo(4, 20_000n, daysAgo(2), cajeros[4].id);
  await registrarAbono(4, 48_000_00n, daysAgo(1), cob1.perfilCobrador!.usuarioId);

  // Cajero 5: Sofía Díaz — al día, saldo cero
  // Cargo 250 USD × 250 = 62.500 GYD, abono 250 USD × 250 = 62.500 GYD → saldo = 0
  await registrarCargo(5, 25_000n, daysAgo(3), cajeros[5].id);
  await registrarAbono(5, 62_500_00n, daysAgo(1), cob2.perfilCobrador!.usuarioId);

  // Cajero 6: Luis Hernández — al día, saldo muy bajo
  // Cargo 50 USD × 250 = 12.500 GYD, abono 48 USD × 250 = 12.000 GYD → saldo = 500
  await registrarCargo(6, 5_000n, daysAgo(1), cajeros[6].id);
  await registrarAbono(6, 12_000_00n, hoursAgo(12), cob1.perfilCobrador!.usuarioId);

  // Cajero 7: Elena Vargas — deuda moderada
  // Cargo 700 USD × 250 = 175.000 GYD, abono 140 USD × 250 = 35.000 GYD → saldo = 140.000
  await registrarCargo(7, 70_000n, daysAgo(6), cajeros[7].id);
  await registrarAbono(7, 35_000_00n, daysAgo(4), cob2.perfilCobrador!.usuarioId);

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
