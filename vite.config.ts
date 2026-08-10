import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/backup-*/**']
  },
  server: {
    proxy: { '/api': 'http://localhost:3000' }
  }
});
