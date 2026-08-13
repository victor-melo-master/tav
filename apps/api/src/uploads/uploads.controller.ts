import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';

/**
 * POST /uploads/comprobante — multipart, guarda en disco, devuelve la ruta.
 *
 * El directorio de destino sale de UPLOAD_DIR (por defecto ./uploads).
 * El nombre del archivo es un UUID para evitar colisiones y no exponer el
 * nombre original del archivo del cliente. Se conserva la extensión.
 *
 * Accesible a cualquier usuario autenticado: cajeros y cobradores suben
 * comprobantes de operaciones y cobros respectivamente.
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
          const ext = extname(file.originalname) || '.jpg';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new BadRequestException('El comprobante debe ser una imagen'), false);
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
}
