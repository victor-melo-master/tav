import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Lectura de tasas vigentes. La tasa la define el administrador manualmente;
 * aquí solo se lee la más reciente por par ("USDT_BS", "USD_BS", "ZELLE_BS").
 */
@Injectable()
export class TasaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Devuelve la tasa vigente de cada par: la más reciente por `vigenteDesde`.
   * No se inventan tasas: si un par no tiene ninguna, no aparece en el resultado.
   */
  async vigentes() {
    const tasas = await this.prisma.tasa.findMany({
      orderBy: { vigenteDesde: 'desc' },
    });

    // Dedupe por par quedándonos con la más reciente (ya ordenadas desc).
    const mapa = new Map<string, (typeof tasas)[number]>();
    for (const t of tasas) {
      if (!mapa.has(t.par)) mapa.set(t.par, t);
    }

    return [...mapa.values()];
  }
}
