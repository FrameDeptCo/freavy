import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  base: './', // relative asset paths so the build works at any path (e.g. /app/) or a subdomain
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:5918',
      '/assets': 'http://127.0.0.1:5918',
      '/ws': { target: 'ws://127.0.0.1:5918', ws: true },
    },
  },
});
