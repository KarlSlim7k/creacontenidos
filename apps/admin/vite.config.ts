import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/admin/',
  plugins: [tailwindcss()],
  server: {
    proxy: { '/api': 'http://localhost:3000' },
  },
});
