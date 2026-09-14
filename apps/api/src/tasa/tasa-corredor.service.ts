import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PublicarTasasDto } from '../admin/dto/publicar-tasas.dto';

/**
 * Tasas por corredor (Fase 9 Bloque 3).
 *
 * La tasa que ve el cajero se compone de tres números que teclea el admin:
 *   pataBase      1 USDT = X GYD   (una sola, mueve todos los corredores)
 *   pataDestino   1 USDT = Y mon   (una por corredor)
 *   margen        %                (uno por corredor, legible: 2.5 = 2.5%)
 *   tasaCotizada  (pataDestino ÷ pataBase) × (1 − margen/100)
 *
 * La publicación es atómica: la pata base y todos los items se insertan en
 * una sola transacción. Ver docs/07-fase-9-multi-corredor.md §3.
 *
 * El cálculo se hace en Decimal, nunca en punto flotante. La división del
 * margen entre 100 vive aquí, en `margenAFactor`, y en ningún otro sitio:
 * un porcentaje guardado en forma legible es la receta clásica del bug de
 * dividir dos veces, y solo se evita si hay un único lugar donde ocurre.
 */
@Injectable()
export class TasaCorredorService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Convierte un margen legible (2.5 = 2.5%) en el factor que multiplica
   * la tasa: (1 − 2.5/100) = 0.975. Único sitio del sistema donde se divide
   * el margen entre 100.
   */
  static margenAFactor(margen: Prisma.Decimal): Prisma.Decimal {
    return new Prisma.Decimal(1).minus(margen.div(100));
  }

  /**
   * Calcula la tasa cotizada en Decimal, nunca en float.
   *   tasaCotizada = (pataDestino ÷ pataBase) × (1 − margen/100)
   */
  static calcularTasaCotizada(
    pataBase: Prisma.Decimal,
    pataDestino: Prisma.Decimal,
    margen: Prisma.Decimal,
  ): Prisma.Decimal {
    return pataDestino.div(pataBase).mul(TasaCorredorService.margenAFactor(margen));
  }

  /**
   * Redondea un monto destino a centavos de la moneda del destino, half-up,
   * en Decimal. Misma regla que el ledger para conversión de cobros.
   *
   *   montoDestino = round_half_up(montoGydCents × tasaCotizada)
   *
   * montoGydCents es un entero de centavos (BigInt); la tasa es Decimal.
   * El producto se redondea al centavo más cercano, con 0.5 hacia arriba.
   */
  static calcularMontoDestinoCents(
    montoGydCents: bigint,
    tasaCotizada: Prisma.Decimal,
  ): bigint {
    const montoGyd = new Prisma.Decimal(montoGydCents.toString());
    const producto = montoGyd.mul(tasaCotizada);
    // Decimal.ROUND_HALF_UP = 4. toDecimalPlaces(0, ...) redondea al entero.
    const redondeado = producto.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
    return BigInt(redondeado.toString());
  }

  /**
   * Publica una nueva tanda de tasas. Atómica: la pata base y todos los
   * items se insertan en una sola transacción. Si un corredor del payload
   * no existe o no está activo, la transacción aborta y no se publica nada.
   *
   * Antes de publicar valida:
   *   - pataBase > 0
   *   - pataDestino > 0 por item
   *   - 0 ≤ margen < 100 por item (negativo = pérdida; ≥100 = beneficiario sin nada)
   *   - todos los corredores activos están en el payload (avisa si falta uno)
   *
   * Devuelve la publicación creada y la lista de avisos (corredores activos
   * que no estaban en el payload, y valores que se desvían más del umbral
   * de la publicación anterior). Los avisos no bloquean la publicación:
   * el admin ya confirmó en la pantalla. El endpoint de "previsualizar"
   * los devuelve ANTES de publicar para que el admin decida.
   */
  async publicar(adminId: string, dto: PublicarTasasDto): Promise<{
    publicacion: { id: string; pataBase: Prisma.Decimal; publicadaAt: Date };
    avisos: AvisoPublicacion[];
  }> {
    const pataBase = new Prisma.Decimal(dto.pataBase);
    if (!pataBase.isPositive()) {
      throw new BadRequestException('pataBase debe ser positiva');
    }

    // Unicidad de corredorId en el payload.
    this.validarUnicidadCorredores(dto);

    // Validar items y calcular tasas cotizadas.
    const itemsParsed = dto.items.map((it) => {
      const pataDestino = new Prisma.Decimal(it.pataDestino);
      const margen = new Prisma.Decimal(it.margen);
      if (!pataDestino.isPositive()) {
        throw new BadRequestException(`pataDestino del corredor ${it.corredorId} debe ser positiva`);
      }
      if (margen.lt(0) || margen.gte(100)) {
        throw new BadRequestException(
          `margen del corredor ${it.corredorId} debe estar en [0, 100)`,
        );
      }
      const tasaCotizada = TasaCorredorService.calcularTasaCotizada(
        pataBase,
        pataDestino,
        margen,
      );
      return { corredorId: it.corredorId, pataDestino, margen, tasaCotizada };
    });

    // Avisos: corredores activos que no están en el payload.
    const corredoresActivos = await this.prisma.corredor.findMany({
      where: { activo: true },
      select: { id: true },
    });
    const idsPayload = new Set(dto.items.map((i) => i.corredorId));
    const faltantes = corredoresActivos.filter((c) => !idsPayload.has(c.id));

    // Avisos: desviación sobre la publicación anterior.
    const avisos: AvisoPublicacion[] = [];
    const previa = await this.ultimaPublicacion();
    if (previa) {
      const umbral = await this.umbralAviso();
      const prevPataBase = previa.pataBase;
      if (this.desviacion(pataBase, prevPataBase) > umbral) {
        avisos.push({
          tipo: 'desviacion_pata_base',
          corredorId: null,
          antes: prevPataBase.toString(),
          ahora: pataBase.toString(),
          pct: this.desviacion(pataBase, prevPataBase).toFixed(2),
        });
      }
      for (const it of itemsParsed) {
        const prevItem = previa.items.find((i) => i.corredorId === it.corredorId);
        if (!prevItem) continue;
        if (this.desviacion(it.pataDestino, prevItem.pataDestino) > umbral) {
          avisos.push({
            tipo: 'desviacion_pata_destino',
            corredorId: it.corredorId,
            antes: prevItem.pataDestino.toString(),
            ahora: it.pataDestino.toString(),
            pct: this.desviacion(it.pataDestino, prevItem.pataDestino).toFixed(2),
          });
        }
        if (this.desviacion(it.margen, prevItem.margen) > umbral) {
          avisos.push({
            tipo: 'desviacion_margen',
            corredorId: it.corredorId,
            antes: prevItem.margen.toString(),
            ahora: it.margen.toString(),
            pct: this.desviacion(it.margen, prevItem.margen).toFixed(2),
          });
        }
      }
    }
    for (const f of faltantes) {
      avisos.push({
        tipo: 'corredor_omitido',
        corredorId: f.id,
        antes: null,
        ahora: null,
        pct: null,
      });
    }

    // Insertar la publicación atómica.
    const publicacion = await this.prisma.$transaction(async (tx) => {
      // Re-validar que los corredores del payload existen y están activos,
      // dentro de la transacción para acortar la ventana de carrera.
      for (const it of itemsParsed) {
        const c = await tx.corredor.findUnique({ where: { id: it.corredorId } });
        if (!c) {
          throw new BadRequestException(`El corredor ${it.corredorId} no existe`);
        }
        if (!c.activo) {
          throw new BadRequestException(
            `El corredor ${c.paisNombre} (${c.moneda}) está desactivado; no se puede publicar tasa`,
          );
        }
      }

      const pub = await tx.publicacionTasas.create({
        data: {
          pataBase,
          publicadaPorId: adminId,
        },
      });

      await tx.publicacionTasaItem.createMany({
        data: itemsParsed.map((it) => ({
          publicacionId: pub.id,
          corredorId: it.corredorId,
          pataDestino: it.pataDestino,
          margen: it.margen,
          tasaCotizada: it.tasaCotizada,
        })),
      });

      await tx.auditLog.create({
        data: {
          actorId: adminId,
          accion: 'tasa_corredor.publicar',
          entidad: 'PublicacionTasas',
          entidadId: pub.id,
          despues: {
            pataBase: pataBase.toString(),
            items: itemsParsed.map((it) => ({
              corredorId: it.corredorId,
              pataDestino: it.pataDestino.toString(),
              margen: it.margen.toString(),
              tasaCotizada: it.tasaCotizada.toString(),
            })),
          },
        },
      });

      return pub;
    });

    return { publicacion, avisos };
  }

  /**
   * Previsualiza la publicación SIN escribir: devuelve los avisos
   * (corredores omitidos y desviaciones) para que la pantalla del admin
   * los muestre antes de confirmar.
   */
  async previsualizar(dto: PublicarTasasDto): Promise<{ avisos: AvisoPublicacion[] }> {
    const pataBase = new Prisma.Decimal(dto.pataBase);
    if (!pataBase.isPositive()) {
      throw new BadRequestException('pataBase debe ser positiva');
    }
    this.validarUnicidadCorredores(dto);
    const avisos: AvisoPublicacion[] = [];

    const corredoresActivos = await this.prisma.corredor.findMany({
      where: { activo: true },
      select: { id: true },
    });
    const idsPayload = new Set(dto.items.map((i) => i.corredorId));
    const faltantes = corredoresActivos.filter((c) => !idsPayload.has(c.id));

    const previa = await this.ultimaPublicacion();
    if (previa) {
      const umbral = await this.umbralAviso();
      if (this.desviacion(pataBase, previa.pataBase) > umbral) {
        avisos.push({
          tipo: 'desviacion_pata_base',
          corredorId: null,
          antes: previa.pataBase.toString(),
          ahora: pataBase.toString(),
          pct: this.desviacion(pataBase, previa.pataBase).toFixed(2),
        });
      }
      for (const it of dto.items) {
        const prevItem = previa.items.find((i) => i.corredorId === it.corredorId);
        if (!prevItem) continue;
        const pataDestino = new Prisma.Decimal(it.pataDestino);
        const margen = new Prisma.Decimal(it.margen);
        if (this.desviacion(pataDestino, prevItem.pataDestino) > umbral) {
          avisos.push({
            tipo: 'desviacion_pata_destino',
            corredorId: it.corredorId,
            antes: prevItem.pataDestino.toString(),
            ahora: it.pataDestino,
            pct: this.desviacion(pataDestino, prevItem.pataDestino).toFixed(2),
          });
        }
        if (this.desviacion(margen, prevItem.margen) > umbral) {
          avisos.push({
            tipo: 'desviacion_margen',
            corredorId: it.corredorId,
            antes: prevItem.margen.toString(),
            ahora: it.margen,
            pct: this.desviacion(margen, prevItem.margen).toFixed(2),
          });
        }
      }
    }
    for (const f of faltantes) {
      avisos.push({
        tipo: 'corredor_omitido',
        corredorId: f.id,
        antes: null,
        ahora: null,
        pct: null,
      });
    }
    return { avisos };
  }

  /**
   * Devuelve la última publicación con sus items, o null si no hay ninguna.
   */
  async ultimaPublicacion() {
    const pub = await this.prisma.publicacionTasas.findFirst({
      orderBy: { publicadaAt: 'desc' },
      include: { items: true },
    });
    return pub;
  }

  /**
   * Historial de publicaciones, ordenadas por fecha desc.
   */
  async historial() {
    return this.prisma.publicacionTasas.findMany({
      orderBy: { publicadaAt: 'desc' },
      include: { items: { include: { corredor: true } } },
    });
  }

  /**
   * Corredores ofrecibles al cajero: activos Y con item en la última
   * publicación. Devuelve solo lo que el cajero necesita ver:
   *   id, pais, paisNombre, moneda, monedaNombre, formaEntrega, formaEntregaNombre, tasaCotizada
   * NUNCA devuelve margen, pataDestino ni pataBase.
   */
  async corredoresOfrecibles(): Promise<
    {
      id: string;
      pais: string;
      paisNombre: string;
      moneda: string;
      monedaNombre: string;
      formaEntrega: string;
      formaEntregaNombre: string;
      tasaCotizada: Prisma.Decimal;
    }[]
  > {
    const ultima = await this.ultimaPublicacion();
    if (!ultima) return [];

    const corredoresActivos = await this.prisma.corredor.findMany({
      where: { activo: true },
      orderBy: { creadoAt: 'asc' },
    });

    const itemsPorCorredor = new Map(ultima.items.map((i) => [i.corredorId, i]));

    return corredoresActivos
      .filter((c) => itemsPorCorredor.has(c.id))
      .map((c) => {
        const item = itemsPorCorredor.get(c.id)!;
        return {
          id: c.id,
          pais: c.pais,
          paisNombre: c.paisNombre,
          moneda: c.moneda,
          monedaNombre: c.monedaNombre,
          formaEntrega: c.formaEntrega,
          formaEntregaNombre: c.formaEntregaNombre,
          tasaCotizada: item.tasaCotizada,
        };
      });
  }

  /**
   * Tasa cotizada vigente de un corredor, o null si no está publicado.
   */
  async tasaVigente(corredorId: string): Promise<Prisma.Decimal | null> {
    const ultima = await this.ultimaPublicacion();
    if (!ultima) return null;
    const item = ultima.items.find((i) => i.corredorId === corredorId);
    return item?.tasaCotizada ?? null;
  }

  // ─────────────────────────── helpers ───────────────────────────

  /** Valida que no haya corredorId repetido en el payload. */
  private validarUnicidadCorredores(dto: PublicarTasasDto): void {
    const vistos = new Set<string>();
    for (const it of dto.items) {
      if (vistos.has(it.corredorId)) {
        throw new BadRequestException(`corredorId ${it.corredorId} repetido en la publicación`);
      }
      vistos.add(it.corredorId);
    }
  }

  /** Desviación porcentual entre dos valores: |ahora − antes| / antes × 100. */
  private desviacion(ahora: Prisma.Decimal, antes: Prisma.Decimal): Prisma.Decimal {
    if (antes.isZero()) return new Prisma.Decimal(Infinity);
    return ahora.minus(antes).abs().div(antes).mul(100);
  }

  /** Umbral de aviso al publicar tasas, desde Config. Default 10%. */
  private async umbralAviso(): Promise<Prisma.Decimal> {
    const cfg = await this.prisma.config.findUnique({
      where: { clave: 'tasa_umbral_aviso_pct' },
    });
    return cfg ? new Prisma.Decimal(cfg.valor) : new Prisma.Decimal(10);
  }
}

export interface AvisoPublicacion {
  tipo: 'corredor_omitido' | 'desviacion_pata_base' | 'desviacion_pata_destino' | 'desviacion_margen';
  corredorId: string | null;
  antes: string | null;
  ahora: string | null;
  pct: string | null;
}
