import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import {
  AtencionEnUsoException,
  CajeroNoValidoException,
  CierreNoAbiertoException,
  CobradorNoValidoException,
  ConfigFaltanteException,
  LedgerException,
  MotivoRequeridoException,
  NoEncontradoException,
  SinCupoException,
  YaAnuladoException,
} from './ledger/ledger.exceptions';

/**
 * Cuerpo de la respuesta de error del ledger. Todas las variantes comparten
 * `code` y `message`; las específicas añaden campos propios.
 */
interface LedgerErrorBody {
  code: string;
  message: string;
  disponible?: string;
  requerido?: string;
  faltante?: string;
  tipo?: string;
  id?: string;
  cierreId?: string;
  estado?: string;
  cajeroId?: string;
  cobradorId?: string;
  entidad?: string;
  clave?: string;
  atendidoPor?: string;
}

/**
 * Mapea las excepciones del núcleo contable (clases planas que no saben de HTTP)
 * a respuestas HTTP con el código y el payload correctos.
 *
 * El ledger lanza excepciones de negocio; este filtro es el único lugar que
 * las traduce a HTTP. Así el ledger queda libre de dependencias web.
 *
 *   SinCupoException          → 409  { code, disponible, requerido, faltante }
 *   YaAnuladoException        → 409  { code, tipo, id }
 *   CierreNoAbiertoException  → 409  { code, cierreId, estado }
 *   MotivoRequeridoException  → 422  { code, message }
 *   CajeroNoValidoException   → 422  { code, cajeroId }
 *   CobradorNoValidoException → 422  { code, cobradorId }
 *   NoEncontradoException     → 404  { code, entidad, id }
 *   ConfigFaltanteException   → 500  { code, clave }
 */
@Catch(LedgerException)
export class LedgerExceptionFilter implements ExceptionFilter {
  catch(ex: LedgerException, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    const { status, body } = this.mapear(ex);
    res.status(status).json(body);
  }

  private mapear(ex: LedgerException): { status: HttpStatus; body: LedgerErrorBody } {
    if (ex instanceof SinCupoException) {
      // El payload {disponible, requerido, faltante} viaja intacto para que la
      // app muestre cuánto falta. Los BigInt se serializan como string (ver main.ts).
      return {
        status: HttpStatus.CONFLICT,
        body: {
          code: ex.code,
          message: ex.message,
          disponible: ex.payload.disponible.toString(),
          requerido: ex.payload.requerido.toString(),
          faltante: ex.payload.faltante.toString(),
        },
      };
    }

    if (ex instanceof YaAnuladoException) {
      return {
        status: HttpStatus.CONFLICT,
        body: { code: ex.code, message: ex.message, tipo: ex.tipo, id: ex.id },
      };
    }

    if (ex instanceof CierreNoAbiertoException) {
      return {
        status: HttpStatus.CONFLICT,
        body: { code: ex.code, message: ex.message, cierreId: ex.cierreId, estado: ex.estado },
      };
    }

    if (ex instanceof MotivoRequeridoException) {
      return { status: HttpStatus.UNPROCESSABLE_ENTITY, body: { code: ex.code, message: ex.message } };
    }

    if (ex instanceof CajeroNoValidoException) {
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        body: { code: ex.code, message: ex.message, cajeroId: ex.cajeroId },
      };
    }

    if (ex instanceof CobradorNoValidoException) {
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        body: { code: ex.code, message: ex.message, cobradorId: ex.cobradorId },
      };
    }

    if (ex instanceof NoEncontradoException) {
      return {
        status: HttpStatus.NOT_FOUND,
        body: { code: ex.code, message: ex.message, entidad: ex.entidad, id: ex.id },
      };
    }

    if (ex instanceof AtencionEnUsoException) {
      return {
        status: HttpStatus.CONFLICT,
        body: {
          code: ex.code,
          message: ex.message,
          cajeroId: ex.cajeroId,
          atendidoPor: ex.cobradorId,
        },
      };
    }

    if (ex instanceof ConfigFaltanteException) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        body: { code: ex.code, message: ex.message, clave: ex.clave },
      };
    }

    // Fallback: cualquier LedgerException no contemplada arriba.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: ex.code ?? 'LEDGER_ERROR', message: ex.message },
    };
  }
}
