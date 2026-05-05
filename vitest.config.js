// @ts-check
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',   // DOM + WebCrypto + localStorage
    globals: true,
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['js/**/*.js'],
      exclude: ['js/main.js', 'js/dev-editor.js', 'js/vendor/**', 'js/components.js', 'js/physics.js', 'js/camera-rig.js', 'js/spatial-tracker.js'], // entry points, 3d controllers e devtools
      thresholds: {
        lines:     70, // F4.3: aumentado de 60% (F2 adiciona testes de curadoria)
        functions: 70,
      },
      reporter: ['text', 'html'],
    },
  },
  // Injeta import.meta.env para módulos que usam variáveis VITE_*
  define: {
    'import.meta.env.VITE_SUPABASE_URL':       '""',
    'import.meta.env.VITE_SUPABASE_ANON_KEY':  '""',
    'import.meta.env.VITE_GITHUB_CONFIG_REPO': '""',
    'import.meta.env.VITE_GITHUB_TOKEN':       '""', // W7: evita ReferenceError em testes futuros
  },
});
