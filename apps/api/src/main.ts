import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// Serialización global de BigInt: los montos salen como string en el JSON.
// Se configura una sola vez aquí, en la capa HTTP, antes de arrancar Nest.
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
