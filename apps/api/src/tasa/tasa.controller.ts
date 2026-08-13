import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TasaService } from './tasa.service';

/**
 * GET /tasas/vigentes — la tasa la define el admin manualmente.
 * Accesible a cualquier usuario autenticado (cajero y cobrador la necesitan).
 */
@ApiTags('tasas')
@ApiBearerAuth()
@Controller('tasas')
export class TasaController {
  constructor(private readonly tasa: TasaService) {}

  @Get('vigentes')
  @ApiOperation({ summary: 'Tasas vigentes por par (la más reciente de cada una)' })
  async vigentes() {
    return this.tasa.vigentes();
  }
}
