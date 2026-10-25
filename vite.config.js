import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  build: {
    outDir: process.env.VITE_DESKTOP === 'true' ? 'desktop/dist' : 'dist',
    rollupOptions: {
      output: { manualChunks: { react: ['react', 'react-dom'], markdown: ['react-markdown'] } },
    },
  },
});
