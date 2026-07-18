import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'middleware' }),
  vite: {
    plugins: [tailwindcss()],
    // En prod Astro se monta en el mismo Express que /api (mismo origen). En
    // `astro dev` standalone (:4000) contra apps/api (:3000), sin esto los
    // fetch() relativos del navegador a /api/* fallarían.
    server: { proxy: { '/api': 'http://localhost:3000' } },
  },
});
