import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    sourcemap: false, // never ship readable source maps
    cssCodeSplit: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Heavy libraries get their own files so they only download when a page needs them.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/three/')) return 'vendor-three';
          if (id.includes('/leaflet') || id.includes('react-leaflet')) return 'vendor-leaflet';
          if (id.includes('/recharts/') || id.includes('/d3-')) return 'vendor-charts';
          if (id.includes('jspdf') || id.includes('html2canvas')) return 'vendor-pdf';
          if (id.includes('katex')) return 'vendor-katex';
          if (id.includes('react-quill') || id.includes('/quill')) return 'vendor-editor';
          if (id.includes('framer-motion')) return 'vendor-motion';
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return 'vendor-react';
        },
      },
    },
  },
  esbuild: {
    legalComments: 'none',
    drop: process.env.NODE_ENV === 'production' ? ['debugger'] : [],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
