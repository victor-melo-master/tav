import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join, resolve } from 'path';
import { randomUUID } from 'crypto';
import { createReadStream, existsSync, statSync } from 'fs';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import type { Response } from 'express';

/**
 * Subida y servido de comprobantes.
 *
 * POST /uploads/comprobante — multipart, guarda en disco, devuelve la ruta.
 * GET  /uploads/:filename   — sirve el archivo a usuarios autenticados.
 *
 * El comprobante no es público: contiene datos bancarios de un tercero.
 * Se sirve por un endpoint autenticado (el JwtAuthGuard global protege todo
 * por defecto), no como archivo estático de nginx. Solo el admin y el pagador
 * que lo subió deberían verlo; la autenticación al menos garantiza que no
 * sea público.
 *
 * Validación de archivo:
 * - Solo imágenes (jpg, png, gif, webp) y PDF.
 * - Tamaño máximo 5 MB (basta para una captura de teléfono).
 * - Nombre generado por el servidor (UUID + extensión), nunca el del cliente.
 *
 * El directorio de destino sale de UPLOAD_DIR (por defecto ./uploads).
 */
@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  private readonly uploadDir: string;

  constructor() {
    this.uploadDir = process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');
  }

  @Post('comprobante')
  @ApiOperation({ summary: 'Sube un comprobante (multipart) y devuelve la ruta' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, process.env.UPLOAD_DIR ?? './uploads'),
        filename: (_req, file, cb) => {
          // Nombre generado por el servidor: UUID + extensión original.
          // Nunca el nombre del cliente (puede tener colisiones, caracteres
          // raros, o revelar información).
          const ext = extname(file.originalname) || '.jpg';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
      fileFilter: (_req, file, cb) => {
        const permitidos = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
        if (!permitidos.includes(file.mimetype)) {
          return cb(
            new BadRequestException('El comprobante debe ser una imagen (JPG, PNG, GIF, WEBP) o un PDF'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async subirComprobante(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    return {
      url: `/uploads/${file.filename}`,
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype,
    };
  }

  @Get(':filename')
  @ApiOperation({ summary: 'Sirve un comprobante a usuarios autenticados' })
  async servirComprobante(@Param('filename') filename: string, @Res() res: Response) {
    // Prevenir path traversal: el filename no puede contener '..' ni '/'.
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new BadRequestException('Nombre de archivo inválido');
    }

    const ruta = resolve(this.uploadDir, filename);
    // Doble check: la ruta resuelta debe estar dentro del directorio de uploads.
    if (!ruta.startsWith(resolve(this.uploadDir))) {
      throw new BadRequestException('Nombre de archivo inválido');
    }

    if (!existsSync(ruta)) {
      throw new NotFoundException('Comprobante no encontrado');
    }

    const stat = statSync(ruta);
    res.setHeader('Content-Length', stat.size);
    // Content-Type según extensión.
    const ext = extname(filename).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
    };
    res.setHeader('Content-Type', contentTypes[ext] ?? 'application/octet-stream');
    // No cachear: datos bancarios sensibles.
    res.setHeader('Cache-Control', 'no-store');

    createReadStream(ruta).pipe(res);
  }
}
