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
      exclude: ['js/main.js', 'js/curadoria-app.js', 'js/dev-editor.js', 'js/vendor/**', 'js/components.js', 'js/physics.js', 'js/camera-rig.js', 'js/spatial-tracker.js'], // entry points, 3d controllers e devtools
      thresholds: {
        lines: 60,
        functions: 60,
      },
      reporter: ['text', 'html'],
    },
  },
  // Injeta import.meta.env para módulos que usam variáveis VITE_*
  define: {
    'import.meta.env.VITE_SUPABASE_URL':       '""',
    'import.meta.env.VITE_SUPABASE_ANON_KEY':  '""',
    'import.meta.env.VITE_GITHUB_CONFIG_REPO': '""',
  },
});
