import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return;
            }

            // React core
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/scheduler/')
            ) {
              return 'react-vendor';
            }

            // Icons
            if (id.includes('/lucide-react/')) {
              return 'icons';
            }

            // Charts / graph visualization
            if (id.includes('/d3/')) {
              return 'd3';
            }

            // PDF generation
            if (
              id.includes('/jspdf/') ||
              id.includes('/jspdf-autotable/')
            ) {
              return 'pdf';
            }

            // Animation
            if (id.includes('/motion/')) {
              return 'motion';
            }

            // Utility libraries
            if (
              id.includes('/clsx/') ||
              id.includes('/tailwind-merge/')
            ) {
              return 'utils';
            }

            // Everything else from node_modules
            return 'vendor';
          },
        },
      },

      // Keep this warning threshold reasonable while we split
      // the large third-party dependencies into separate chunks.
      chunkSizeWarningLimit: 500,
    },

    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // File watching is also disabled in that mode to prevent flickering.
      hmr: process.env.DISABLE_HMR !== 'true',

      watch:
        process.env.DISABLE_HMR === 'true'
          ? null
          : {},
    },
  };
});