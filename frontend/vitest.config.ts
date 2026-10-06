import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    pool: 'threads',
    // Les tests d'interaction (userEvent + render) dépassent 5 s quand les
    // 15 workers démarrent en parallèle : marge pour éviter les flakys.
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});