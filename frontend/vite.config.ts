import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { visualizer } from 'rollup-plugin-visualizer';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:5000';

  return {
    plugins: [react(), tailwindcss(), visualizer({ filename: 'dist/stats.html', open: false, gzipSize: true, brotliSize: true })],
    resolve: {
      alias: {
        '@': path.resolve(rootDir, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/health': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('leaflet') || id.includes('react-leaflet')) return 'leaflet';
              if (id.includes('recharts')) return 'recharts';
              if (id.includes('@turf')) return 'turf';
              if (id.includes('@tanstack')) return 'tanstack';
              if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('zod')) return 'forms';
              if (id.includes('date-fns')) return 'date-fns';
              if (id.includes('html2canvas')) return 'html2canvas';
              if (id.includes('jspdf')) return 'jspdf';
              if (id.includes('xlsx')) return 'xlsx';
              return 'vendor';
            }
            return undefined;
          },
        },
      },
    },
  };
});
