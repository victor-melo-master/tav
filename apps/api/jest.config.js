/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.spec.ts'],
  // Base limpia compartida entre tests: serializar para que el TRUNCATE
  // del beforeEach no pise a otro test corriendo en paralelo.
  maxWorkers: 1,
  setupFiles: ['<rootDir>/test/setup.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.spec.json', isolatedModules: true }],
  },
};
