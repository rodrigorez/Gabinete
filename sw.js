/**
 * Service Worker — Gabinete Virtual (Offline-First PWA)
 *
 * Estratégia: injectManifest via vite-plugin-pwa.
 * O Workbox é bundlado localmente pelo Vite — sem dependência de CDN externa.
 * self.__WB_MANIFEST é substituído pela lista real de assets no build.
 */

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';

// Precache todos os assets estáticos (JS, CSS, HTML, JSON, imagens)
precacheAndRoute(self.__WB_MANIFEST || []);
cleanupOutdatedCaches();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

// ── Runtime caching ───────────────────────────────────────────

// W6: config.json — StaleWhileRevalidate: serve do cache imediatamente
// e atualiza em background. Garante que mudanças do curador apareçam
// no próximo carregamento sem limpar o cache manualmente.
registerRoute(
  ({ url }) => url.pathname.endsWith('/assets/config.json'),
  new StaleWhileRevalidate({ cacheName: 'gabinete-config-v1' })
);

// Assets do Supabase Storage: modelos, vídeos e imagens (raramente mudam)
registerRoute(
  ({ url }) => url.hostname.includes('.supabase.co') && url.pathname.includes('/storage/'),
  new CacheFirst({ cacheName: 'gabinete-supabase-v1' })
);

// Media local: GLB, MP4, WebP, imagens (cache-first — assets imutáveis)
registerRoute(
  ({ request }) => /\.(glb|gltf|mp4|webm|webp|jpg|jpeg|png|mp3|ogg)$/i.test(request.url),
  new CacheFirst({ cacheName: 'gabinete-media-v1' })
);
