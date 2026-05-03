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
      exclude: ['js/main.js', 'js/curadoria-app.js'], // entry points com side effects
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
