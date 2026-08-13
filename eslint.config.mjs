import tseslint from "typescript-eslint";

/**
 * Configuración plana (flat config) de ESLint para el monorepo TAV.
 *
 * Usa `typescript-eslint` (paquete unificado que trae parser + plugin) con la
 * forma `tseslint.config(...)`, que es la recomendada para flat config.
 *
 * Sobre los ignores: apps/mobile (Flutter) y design/ (HTML de prototipos) no
 * son código que ESLint deba revisar. Las migraciones de Prisma son SQL puro.
 */
export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "**/dist/**",
      "**/build/**",
      ".next/**",
      "coverage/**",
      "apps/mobile/**",
      "design/**",
      "apps/api/prisma/migrations/**",
      // next-env.d.ts lo genera Next.js en cada build; no es código nuestro.
      "**/next-env.d.ts",
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
    },
    rules: {
      // La base `no-unused-vars` no entiende tipos de TS; la apagamos y usamos
      // la versión de @typescript-eslint, que sí sabe de type-only imports,
      // desestructuración y genéricos.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          // Los parámetros catch sin usar son comunes y ruido puro.
          caughtErrorsIgnorePattern: "^_",
          // Permite `const { a, ...rest }` donde `a` no se usa pero se descarta
          // a propósito para extraer el resto.
          ignoreRestSiblings: true,
        },
      ],
    },
  },
);
