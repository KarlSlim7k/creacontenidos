import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'middleware' }),
  vite: {
    plugins: [tailwindcss()],
    // CSP: los scripts estáticos deben salir como /_astro/*.js; solo los dos
    // scripts dinámicos de la nota necesitan nonce por respuesta.
    build: { assetsInlineLimit: 0 },
    // En prod Astro se monta en el mismo Express que /api (mismo origen). En
    // `astro dev` standalone (:4000) contra apps/api (:3000), sin esto los
    // fetch() relativos del navegador a /api/* fallarían.
    server: { proxy: { '/api': 'http://localhost:3000' } },
  },
});
