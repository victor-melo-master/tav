import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

// Serialización global de BigInt: los montos salen como string en el JSON.
// Se configura una sola vez aquí, en la capa HTTP, antes de arrancar Nest.
(BigInt.prototype as any).toJSON = function () {
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
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
