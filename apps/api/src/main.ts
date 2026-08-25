import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
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
  const config = app.get(ConfigService);

  // CORS: en producción, solo el dominio del panel admin puede llamar a la API.
  // CORS_ORIGIN viene de .env.prod (un único origen o lista CSV).
  //
  // En desarrollo (NODE_ENV !== 'production') se permiten además los orígenes
  // locales del panel admin (localhost:3000 y 127.0.0.1:3000) para que Next.js
  // dev server pueda llamar a la API sin que el navegador bloquee la petición.
  // Sin esto, desarrollar el panel en local es imposible: el navegador rechaza
  // todas las llamadas por la política same-origin.
  const corsOrigin = config.get<string>('CORS_ORIGIN');
  const isProd = config.get<string>('NODE_ENV') === 'production';

  const devOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];
  const prodOrigins = corsOrigin ? corsOrigin.split(',').map((o) => o.trim()) : [];

  // En producción se usa la lista de CORS_ORIGIN exclusivamente. Si no está
  // definida (mal configurada), se rechaza todo para no abrir la API al mundo.
  // En desarrollo se une CORS_ORIGIN (si lo hay) con los orígenes locales.
  const origins = isProd
    ? prodOrigins.length
      ? prodOrigins
      : false
    : Array.from(new Set([...prodOrigins, ...devOrigins]));

  app.enableCors({
    origin: origins,
    credentials: true,
  });

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
  const swaggerConfig = new DocumentBuilder()
    .setTitle('TAV API')
    .setDescription('Casa de cambio — libro de cuentas compartido')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = config.get<number>('PORT') ?? 3001;
  await app.listen(port);
}
bootstrap();
