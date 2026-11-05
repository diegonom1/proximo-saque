import { defineConfig } from 'astro/config';

// `site` y `base` se configuran en la fase 5, cuando exista el repo en GitHub.
export default defineConfig({
  output: 'static',
});
