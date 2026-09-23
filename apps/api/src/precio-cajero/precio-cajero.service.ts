import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Precios por cajero (nuevo modelo de Fase 9).
 *
 * Cada cajero tiene su propio precio en GYD por dólar, por servicio, fijado
 * por el admin. El precio determina la deuda: `deudaGydCents = round_half_up(
 * montoUsdCents × precioGyd`. Ver docs/07-fase-9-multi-corredor.md
 * (modelo corregido) y el contrato del ledger.
 *
 * La tabla `PrecioCajeroServicio` es de SOLO INSERCIÓN: cada cambio es un
 * INSERT nuevo con autor y fecha. El precio vigente de (cajero, servicio)
 * es la fila más nueva por `vigenteDesde`. El precio se congela en cada
 * operación; cambiar el precio aquí nunca altera una operación registrada.
 *
 * `precioGyd` es un RATIO (GYD por 1 USD), no un monto: va en Decimal(18,6),
 * igual que `tasaAplicada`. La multiplicación que entra al libro se hace en
 * Decimal con ROUND_HALF_UP y el resultado se convierte a BigInt de centavos
 * de GYD antes de tocar el ledger. Ningún monto sale de aritmética en float.
 */
@Injectable()
export class PrecioCajeroService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calcula la deuda en centavos de GYD a partir de un monto en centavos de
   * USD y un precio GYD/USD, en Decimal con ROUND_HALF_UP. Único sitio donde
   * se aplica el precio al monto: el ledger recibe el resultado ya en BigInt
   * de GYD. Documentado junto a la conversión de cobros en el contrato.
   *
   *   deudaGydCents = round_half_up(montoUsdCents × precioGyd)
   *
   * `precioGyd` es GYD por 1 USD (dólar, no centavo). `montoUsdCents` está en
   * centavos de USD. El producto es centavos de GYD: 100 USD = 10000 cents ×
   * 240 GYD/USD = 2.400.000 cents = 24.000 GYD. El redondeo al centavo de GYD
   * es half-up (necesario cuando el precio tiene más de 2 decimales).
   */
  static calcularDeudaGydCents(montoUsdCents: bigint, precioGyd: Prisma.Decimal): bigint {
    const montoUsd = new Prisma.Decimal(montoUsdCents.toString());
    const producto = montoUsd.mul(precioGyd);
    const redondeado = producto.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
    return BigInt(redondeado.toString());
  }

  /**
   * Fija el precio de un servicio para un cajero. NO actualiza nada: inserta
   * una fila nueva en el historial. El precio anterior queda consultable.
   *
   * Valida que el cajero y el servicio existan y que el servicio esté activo,
   * y que el precio sea positivo. `fijadoPorId` sale del JWT en el controlador.
   */
  async fijarPrecio(
    cajeroId: string,
    servicioId: string,
    precioGyd: string,
    fijadoPorId: string,
  ) {
    const precio = new Prisma.Decimal(precioGyd.replace(',', '.'));
    // decimal.js: isPositive() = !isNegative(), así que 0 pasa. Validamos
    // explícitamente > 0 para rechazar cero y negativos.
    if (!precio.isPositive() || precio.isZero()) {
      throw new BadRequestException('precioGyd debe ser positivo');
    }

    const cajero = await this.prisma.perfilCajero.findUnique({ where: { usuarioId: cajeroId } });
    if (!cajero) throw new NotFoundException(`El cajero ${cajeroId} no existe`);

    const servicio = await this.prisma.corredor.findUnique({ where: { id: servicioId } });
    if (!servicio) throw new NotFoundException(`El servicio ${servicioId} no existe`);
    if (!servicio.activo) {
      throw new BadRequestException(
        `El servicio ${servicio.paisNombre} (${servicio.formaEntregaNombre}) está desactivado`,
      );
    }

    return this.prisma.precioCajeroServicio.create({
      data: {
        cajeroId,
        servicioId,
        precioGyd: precio,
        fijadoPorId,
      },
      include: { servicio: true },
    });
  }

  /**
   * Precio vigente de un servicio para un cajero, o null si no tiene ninguno
   * fijado. Un servicio sin precio para el cajero no es ofrecible: el cajero
   * no puede operar contra él.
   */
  async precioVigente(cajeroId: string, servicioId: string): Promise<Prisma.Decimal | null> {
    const fila = await this.prisma.precioCajeroServicio.findFirst({
      where: { cajeroId, servicioId },
      orderBy: { vigenteDesde: 'desc' },
      select: { precioGyd: true },
    });
    return fila?.precioGyd ?? null;
  }

  /**
   * Servicios ofrecibles a un cajero: activos para los que el cajero tiene
   * un precio fijado. Devuelve id, país, moneda, forma de entrega, servicio
   * y `precioGyd` (lo que el cajero necesita ver y lo que se congela). NUNCA
   * margen ni patas: ese concepto dejó de existir.
   *
   * Un servicio activo sin precio para este cajero no aparece: no puede
   * operarlo hasta que el admin le fije precio.
   */
  async serviciosOfrecibles(cajeroId: string) {
    const servicios = await this.prisma.corredor.findMany({
      where: { activo: true },
      orderBy: { creadoAt: 'asc' },
    });
    if (servicios.length === 0) return [];

    const precios = await this.prisma.precioCajeroServicio.findMany({
      where: { cajeroId, servicioId: { in: servicios.map((s) => s.id) } },
      orderBy: { vigenteDesde: 'desc' },
    });
    // El vigente por servicioId = el primero que aparezca ordenado desc.
    const vigentePorServicio = new Map<string, Prisma.Decimal>();
    for (const p of precios) {
      if (!vigentePorServicio.has(p.servicioId)) vigentePorServicio.set(p.servicioId, p.precioGyd);
    }

    return servicios
      .filter((s) => vigentePorServicio.has(s.id))
      .map((s) => ({
        id: s.id,
        pais: s.pais,
        paisNombre: s.paisNombre,
        moneda: s.moneda,
        monedaNombre: s.monedaNombre,
        formaEntrega: s.formaEntrega,
        formaEntregaNombre: s.formaEntregaNombre,
        servicio: s.servicio,
        servicioNombre: s.servicioNombre,
        precioGyd: vigentePorServicio.get(s.id)!.toString(),
      }));
  }

  /**
   * Precios vigentes del cajero por servicio, para la ficha del admin. Incluye
   * los servicios activos SIN precio (marcados), para que el admin vea cuáles
   * faltan por fijar.
   */
  async preciosCajero(cajeroId: string) {
    const servicios = await this.prisma.corredor.findMany({
      where: { activo: true },
      orderBy: { creadoAt: 'asc' },
    });
    const precios = await this.prisma.precioCajeroServicio.findMany({
      where: { cajeroId, servicioId: { in: servicios.map((s) => s.id) } },
      orderBy: { vigenteDesde: 'desc' },
      include: { servicio: true },
    });
    const vigentePorServicio = new Map<string, (typeof precios)[number]>();
    for (const p of precios) {
      if (!vigentePorServicio.has(p.servicioId)) vigentePorServicio.set(p.servicioId, p);
    }

    return servicios.map((s) => {
      const vigente = vigentePorServicio.get(s.id);
      return {
        servicioId: s.id,
        paisNombre: s.paisNombre,
        moneda: s.moneda,
        monedaNombre: s.monedaNombre,
        formaEntregaNombre: s.formaEntregaNombre,
        servicio: s.servicio,
        servicioNombre: s.servicioNombre,
        precioGyd: vigente?.precioGyd.toString() ?? null,
        vigenteDesde: vigente?.vigenteDesde ?? null,
        fijadoPorId: vigente?.fijadoPorId ?? null,
      };
    });
  }

  /** Historial de cambios de precio, opcionalmente filtrado por servicio. */
  async historial(cajeroId: string, servicioId?: string) {
    return this.prisma.precioCajeroServicio.findMany({
      where: { cajeroId, ...(servicioId ? { servicioId } : {}) },
      orderBy: { vigenteDesde: 'desc' },
      include: {
        servicio: { select: { paisNombre: true, moneda: true, formaEntregaNombre: true } },
      },
    });
  }
}
