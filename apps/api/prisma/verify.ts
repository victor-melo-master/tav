import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const cajeros = await prisma.perfilCajero.findMany({
    include: {
      movimientos: { orderBy: { seq: 'asc' } },
    },
  });

  let errores = 0;

  for (const cajero of cajeros) {
    const sumaMovimientos = cajero.movimientos.reduce((acc, m) => acc + m.montoCents, 0n);
    const saldoCache = cajero.saldoCents;

    // Verificar saldo cache == suma de movimientos
    if (sumaMovimientos !== saldoCache) {
      console.error(`✗ ${cajero.usuarioId}: saldoCents=${saldoCache} ≠ suma movimientos=${sumaMovimientos}`);
      errores++;
      continue;
    }

    // Verificar saldoDespues de cada movimiento en secuencia
    let saldoEsperado = 0n;
    for (const mov of cajero.movimientos) {
      saldoEsperado += mov.montoCents;
      if (mov.saldoDespues !== saldoEsperado) {
        console.error(`✗ ${cajero.usuarioId}: movimiento ${mov.id} saldoDespues=${mov.saldoDespues} ≠ esperado=${saldoEsperado}`);
        errores++;
      }
    }

    // Verificar deudaDesde: null si saldo <= 0, not null si saldo > 0
    if (saldoCache <= 0n && cajero.deudaDesde !== null) {
      console.error(`✗ ${cajero.usuarioId}: saldoCents=${saldoCache} pero deudaDesde=${cajero.deudaDesde} (debería ser null)`);
      errores++;
    }
    if (saldoCache > 0n && cajero.deudaDesde === null) {
      console.error(`✗ ${cajero.usuarioId}: saldoCents=${saldoCache} pero deudaDesde=null (debería tener fecha)`);
      errores++;
    }

    // Verificar deudaDesde por FIFO: reconstruir desde cargos y abonos vivos
    const deudaDesdeEsperada = await recalcularDeudaDesdeFifo(cajero.usuarioId);

    if (cajero.deudaDesde === null && deudaDesdeEsperada !== null) {
      console.error(`✗ ${cajero.usuarioId}: deudaDesde=null pero FIFO espera ${deudaDesdeEsperada.toISOString()}`);
      errores++;
    } else if (cajero.deudaDesde !== null && deudaDesdeEsperada === null) {
      console.error(`✗ ${cajero.usuarioId}: deudaDesde=${cajero.deudaDesde.toISOString()} pero FIFO espera null`);
      errores++;
    } else if (cajero.deudaDesde !== null && deudaDesdeEsperada !== null) {
      if (cajero.deudaDesde.getTime() !== deudaDesdeEsperada.getTime()) {
        console.error(
          `✗ ${cajero.usuarioId}: deudaDesde=${cajero.deudaDesde.toISOString()} ≠ FIFO=${deudaDesdeEsperada.toISOString()}`,
        );
        errores++;
      }
    }

    const pct = cajero.limiteCents > 0n ? Number(saldoCache > 0n ? saldoCache * 100n / cajero.limiteCents : 0n) : 0;
    console.log(`✓ ${cajero.usuarioId}: saldo=${saldoCache} suma=${sumaMovimientos} deudaDesde=${cajero.deudaDesde?.toISOString() ?? 'null'} (${pct}% del límite)`);
  }

  if (errores > 0) {
    console.error(`\n${errores} error(es) encontrados. La invariante no se cumple.`);
    process.exit(1);
  }

  console.log(`\n${cajeros.length} cajeros verificados. Todos los saldos cuadran.`);

  // ─────────────────────────── CAJAS (Fase 9) ───────────────────────────
  // Mismo chequeo que los cajeros: saldoCents (cache) == suma de movimientos,
  // y saldoDespues de cada movimiento cuadra con el acumulado en secuencia.
  // Además verifica la coherencia de los campos de conversión (cajaMadreId,
  // montoMadreCents, tasaConversion) que solo deben aparecer en
  // apertura/recarga, y la restricción esMadre XOR corredorId.
  const cajas = await prisma.caja.findMany({
    include: { movimientos: { orderBy: { seq: 'asc' } }, corredor: true },
  });

  let erroresCaja = 0;

  for (const caja of cajas) {
    // Restricción esMadre XOR corredorId (también la exige un CHECK en BD,
    // pero la verificamos aquí para dar un mensaje claro si algo se corrompe).
    if (caja.esMadre && caja.corredorId !== null) {
      console.error(`✗ Caja ${caja.id}: esMadre=true pero corredorId=${caja.corredorId} (debería ser null)`);
      erroresCaja++;
      continue;
    }
    if (!caja.esMadre && caja.corredorId === null) {
      console.error(`✗ Caja ${caja.id}: esMadre=false pero corredorId=null (debería tener corredor)`);
      erroresCaja++;
      continue;
    }

    const sumaMovimientos = caja.movimientos.reduce((acc, m) => acc + m.montoCents, 0n);
    const saldoCache = caja.saldoCents;

    if (sumaMovimientos !== saldoCache) {
      console.error(`✗ Caja ${caja.id} (${caja.moneda}): saldoCents=${saldoCache} ≠ suma movimientos=${sumaMovimientos}`);
      erroresCaja++;
      continue;
    }

    // saldoDespues en secuencia
    let saldoEsperado = 0n;
    for (const mov of caja.movimientos) {
      saldoEsperado += mov.montoCents;
      if (mov.saldoDespues !== saldoEsperado) {
        console.error(`✗ Caja ${caja.id}: movimiento ${mov.id} saldoDespues=${mov.saldoDespues} ≠ esperado=${saldoEsperado}`);
        erroresCaja++;
      }

      // Coherencia de campos de conversión: solo apertura/recarga los llevan.
      // `transferencia` es el débito de la caja madre (contrapartida de una
      // apertura/recarga en la caja destino) y no lleva conversión: desde la
      // perspectiva de la madre solo sale USDT.
      const tieneConv = mov.cajaMadreId !== null || mov.montoMadreCents !== null || mov.tasaConversion !== null;
      const debeTenerConv = mov.tipo === 'apertura' || mov.tipo === 'recarga';
      if (tieneConv && !debeTenerConv) {
        console.error(`✗ Caja ${caja.id}: movimiento ${mov.id} tipo=${mov.tipo} lleva campos de conversión (solo apertura/recarga)`);
        erroresCaja++;
      }
      if (debeTenerConv && !tieneConv) {
        console.error(`✗ Caja ${caja.id}: movimiento ${mov.id} tipo=${mov.tipo} falta conversión (cajaMadreId/montoMadreCents/tasaConversion)`);
        erroresCaja++;
      }
      // Si tiene conversión, los tres campos van juntos o ninguno.
      if (tieneConv) {
        const completos = mov.cajaMadreId !== null && mov.montoMadreCents !== null && mov.tasaConversion !== null;
        if (!completos) {
          console.error(`✗ Caja ${caja.id}: movimiento ${mov.id} conversión incompleta (los 3 campos van juntos)`);
          erroresCaja++;
        }
      }
    }

    const etiqueta = caja.esMadre ? `madre ${caja.moneda}` : `${caja.moneda} (${caja.corredor?.paisNombre ?? '?'})`;
    console.log(`✓ Caja ${etiqueta}: saldo=${saldoCache} suma=${sumaMovimientos} movs=${caja.movimientos.length}`);
  }

  if (erroresCaja > 0) {
    console.error(`\n${erroresCaja} error(es) en cajas. La invariante no se cumple.`);
    process.exit(1);
  }

  console.log(`\n${cajas.length} cajas verificadas. Todos los saldos cuadran.`);
}

/**
 * Reconstruye deudaDesde por FIFO: lee los cargos vivos (operaciones no
 * anuladas) y los abonos vivos (cobros no anulados), aplica FIFO, y
 * devuelve la fecha del cargo más antiguo que siga sin saldar.
 * Si todos están saldados o no hay cargos, devuelve null.
 */
async function recalcularDeudaDesdeFifo(cajeroId: string): Promise<Date | null> {
  const cargos = await prisma.operacion.findMany({
    where: { cajeroId, anuladaAt: null },
    orderBy: { creadaAt: 'asc' },
    select: { totalCents: true, creadaAt: true },
  });

  if (cargos.length === 0) return null;

  const abonos = await prisma.cobro.findMany({
    where: { cajeroId, anuladoAt: null },
    orderBy: { creadoAt: 'asc' },
    select: { montoBaseCents: true },
  });

  let abonoIdx = 0;
  let abonoRestante = abonos.length > 0 ? abonos[0].montoBaseCents : 0n;

  for (const cargo of cargos) {
    let cargoRestante = cargo.totalCents;
    while (cargoRestante > 0n && abonoIdx < abonos.length) {
      if (abonoRestante === 0n) {
        abonoIdx++;
        if (abonoIdx < abonos.length) {
          abonoRestante = abonos[abonoIdx].montoBaseCents;
        }
        continue;
      }
      const aplicado = abonoRestante > cargoRestante ? cargoRestante : abonoRestante;
      cargoRestante -= aplicado;
      abonoRestante -= aplicado;
      if (abonoRestante === 0n) {
        abonoIdx++;
        if (abonoIdx < abonos.length) {
          abonoRestante = abonos[abonoIdx].montoBaseCents;
        }
      }
    }
    if (cargoRestante > 0n) {
      return cargo.creadaAt;
    }
  }

  return null;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
