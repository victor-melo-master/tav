import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import {
  CajaException,
  CajaNoEncontradaException,
  CorredorNoEncontradoException,
  CajaMadreInvalidaException,
  CorredorInactivoException,
  CorredorDuplicadoException,
  OperacionNoEncontradaException,
  OperacionNoPendienteException,
  CajaCorredorMismatchException,
  MotivoRequeridoException,
  MontoInvalidoException,
  CampoRequeridoException,
  TasaInvalidaException,
  ReversoPagoNoDefinidoException,
  MovimientoNoAnulableException,
  MovimientoYaAnuladoException,
} from './cajas.exceptions';

/**
 * Cuerpo de la respuesta de error de cajas. Todas las variantes comparten
 * `code` y `message`; las específicas añaden campos propios.
 */
interface CajaErrorBody {
  code: string;
  message: string;
  cajaId?: string;
  corredorId?: string;
  operacionId?: string;
  estado?: string;
  campo?: string;
  valor?: string;
  tipo?: string;
  movimientoCajaId?: string;
  pais?: string;
  moneda?: string;
  formaEntrega?: string;
}

/**
 * Mapea las excepciones del módulo de cajas (clases planas que no saben de
 * HTTP) a respuestas HTTP con el código y el payload correctos.
 *
 *   CajaNoEncontradaException        → 404  { code, message, cajaId }
 *   CorredorNoEncontradoException    → 404  { code, message, corredorId }
 *   OperacionNoEncontradaException   → 404  { code, message, operacionId }
 *   CajaMadreInvalidaException       → 422  { code, message, cajaId }
 *   CorredorInactivoException        → 409  { code, message, corredorId }
 *   CorredorDuplicadoException       → 409  { code, message, pais, moneda, formaEntrega }
 *   OperacionNoPendienteException    → 409  { code, message, operacionId, estado }
 *   CajaCorredorMismatchException    → 422  { code, message, cajaId, operacionId }
 *   MotivoRequeridoException         → 422  { code, message }
 *   MontoInvalidoException           → 422  { code, message, campo, valor }
 *   CampoRequeridoException          → 422  { code, message, campo }
 *   TasaInvalidaException            → 422  { code, message }
 *   MovimientoNoAnulableException    → 422  { code, message, movimientoCajaId, tipo }
 *   MovimientoYaAnuladoException     → 409  { code, message, movimientoCajaId }
 *   ReversoPagoNoDefinidoException   → 422  { code, message, movimientoCajaId }
 */
@Catch(CajaException)
export class CajaExceptionFilter implements ExceptionFilter {
  catch(ex: CajaException, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.mapear(ex);
    res.status(status).json(body);
  }

  private mapear(ex: CajaException): { status: HttpStatus; body: CajaErrorBody } {
    if (ex instanceof CajaNoEncontradaException) {
      return { status: HttpStatus.NOT_FOUND, body: { code: ex.code, message: ex.message, cajaId: ex.cajaId } };
    }
    if (ex instanceof CorredorNoEncontradoException) {
      return { status: HttpStatus.NOT_FOUND, body: { code: ex.code, message: ex.message, corredorId: ex.corredorId } };
    }
    if (ex instanceof OperacionNoEncontradaException) {
      return { status: HttpStatus.NOT_FOUND, body: { code: ex.code, message: ex.message, operacionId: ex.operacionId } };
    }
    if (ex instanceof CajaMadreInvalidaException) {
      return { status: HttpStatus.UNPROCESSABLE_ENTITY, body: { code: ex.code, message: ex.message, cajaId: ex.cajaId } };
    }
    if (ex instanceof CorredorInactivoException) {
      return { status: HttpStatus.CONFLICT, body: { code: ex.code, message: ex.message, corredorId: ex.corredorId } };
    }
    if (ex instanceof CorredorDuplicadoException) {
      return {
        status: HttpStatus.CONFLICT,
        body: { code: ex.code, message: ex.message, pais: ex.pais, moneda: ex.moneda, formaEntrega: ex.formaEntrega },
      };
    }
    if (ex instanceof OperacionNoPendienteException) {
      return {
        status: HttpStatus.CONFLICT,
        body: { code: ex.code, message: ex.message, operacionId: ex.operacionId, estado: ex.estado },
      };
    }
    if (ex instanceof CajaCorredorMismatchException) {
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        body: { code: ex.code, message: ex.message, cajaId: ex.cajaId, operacionId: ex.operacionId },
      };
    }
    if (ex instanceof MotivoRequeridoException) {
      return { status: HttpStatus.UNPROCESSABLE_ENTITY, body: { code: ex.code, message: ex.message } };
    }
    if (ex instanceof MontoInvalidoException) {
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        body: { code: ex.code, message: ex.message, campo: ex.campo, valor: ex.valor.toString() },
      };
    }
    if (ex instanceof CampoRequeridoException) {
      return { status: HttpStatus.UNPROCESSABLE_ENTITY, body: { code: ex.code, message: ex.message, campo: ex.campo } };
    }
    if (ex instanceof TasaInvalidaException) {
      return { status: HttpStatus.UNPROCESSABLE_ENTITY, body: { code: ex.code, message: ex.message } };
    }
    if (ex instanceof MovimientoNoAnulableException) {
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        body: { code: ex.code, message: ex.message, movimientoCajaId: ex.movimientoCajaId, tipo: ex.tipo },
      };
    }
    if (ex instanceof MovimientoYaAnuladoException) {
      return {
        status: HttpStatus.CONFLICT,
        body: { code: ex.code, message: ex.message, movimientoCajaId: ex.movimientoCajaId },
      };
    }
    if (ex instanceof ReversoPagoNoDefinidoException) {
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        body: { code: ex.code, message: ex.message, movimientoCajaId: ex.movimientoCajaId },
      };
    }

    // Fallback.
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, body: { code: ex.code ?? 'CAJA_ERROR', message: ex.message } };
  }
}
