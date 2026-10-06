import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    fileParallelism: false,
    // La détection post-refresh agrège des requêtes lourdes sur une base
    // partagée : 5 s par défaut devient trop juste en fin de suite.
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // Pinne le mode publication : les tests s'attendent à des alertes en
    // BROUILLON, quel que soit le .env de développement (dotenv ne
    // surcharge pas les variables déjà définies).
    env: {
      ALERTS_AUTO_PUBLISH: 'false',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
    },
  },
});
