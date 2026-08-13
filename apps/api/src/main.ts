import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { LedgerExceptionFilter } from './ledger-exception.filter';

// Serialización global de BigInt: los montos salen como string en el JSON.
// Se configura una sola vez aquí, en la capa HTTP, antes de arrancar Nest.
// La augmentación de interfaz evita el cast a `any`: BigInt.prototype no tiene
// `toJSON` en los typings de TS, así que se declara aquí para que el asignamiento
// pase el chequeo de tipos.
declare global {
  interface BigInt {
    toJSON(): string;
  }
}
BigInt.prototype.toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // descarta campos que no están en el DTO
      forbidNonWhitelisted: true, // 400 si el cliente envía campos de más
      transform: true, // convierte tipos (string → number, etc.)
    }),
  );

  // Mapea las excepciones del ledger (clases planas) a respuestas HTTP.
  app.useGlobalFilters(new LedgerExceptionFilter());

  // Documentación Swagger en /docs
  const config = new DocumentBuilder()
    .setTitle('TAV API')
    .setDescription('Casa de cambio — libro de cuentas compartido')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
