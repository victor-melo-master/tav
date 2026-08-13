import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const cajeros = await prisma.perfilCajero.findMany({
    include: {
      movimientos: { orderBy: { creadoAt: 'asc' } },
    },
  });

  let errores = 0;

  for (const cajero of cajeros) {
    const sumaMovimientos = cajero.movimientos.reduce((acc, m) => acc + m.montoUsdCents, 0n);
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
      saldoEsperado += mov.montoUsdCents;
      if (mov.saldoDespues !== saldoEsperado) {
        console.error(`✗ ${cajero.usuarioId}: movimiento ${mov.id} saldoDespues=${mov.saldoDespues} ≠ esperado=${saldoEsperado}`);
        errores++;
      }
    }

    const pct = cajero.limiteCents > 0n ? Number(saldoCache * 100n / cajero.limiteCents) : 0;
    console.log(`✓ ${cajero.usuarioId}: saldo=${saldoCache} suma=${sumaMovimientos} (${pct}% del límite)`);
  }

  if (errores > 0) {
    console.error(`\n${errores} error(es) encontrados. La invariante no se cumple.`);
    process.exit(1);
  }

  console.log(`\n${cajeros.length} cajeros verificados. Todos los saldos cuadran.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
