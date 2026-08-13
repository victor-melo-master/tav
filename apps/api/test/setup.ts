// Se ejecuta antes de cualquier test (ver jest.config.js setupFiles).
// Asegura que la app NestJS que levantan los tests de auth use tav_test,
// no la base de desarrollo, y un JWT_SECRET determinista.
process.env.DATABASE_URL = 'postgresql://tav:tav@localhost:5432/tav_test?schema=public';
process.env.JWT_SECRET = 'test-secret-tav';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '30d';

// Serialización global de BigInt: los montos salen como string en el JSON.
// En producción esto vive en main.ts, pero los tests no ejecutan main.ts —
// crean la app con Test.createTestingModule, así que hay que parchearlo aquí.
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};
