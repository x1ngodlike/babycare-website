import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|lucide-react)[\\/]/.test(id)) return 'vendor';
        }
      }
    }
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/backup-*/**']
  },
  server: {
    proxy: { '/api': 'http://localhost:3000', '/avatars': 'http://localhost:3000' }
  }
});
