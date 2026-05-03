/**
 * Service Worker — Gabinete Virtual (Offline-First PWA)
 *
 * Estratégia: injectManifest via vite-plugin-pwa.
 * O Workbox é bundlado localmente pelo Vite — sem dependência de CDN externa.
 * self.__WB_MANIFEST é substituído pela lista real de assets no build.
 */

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';

// Precache todos os assets estáticos (JS, CSS, HTML, JSON, imagens)
precacheAndRoute(self.__WB_MANIFEST || []);
cleanupOutdatedCaches();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

// ── Runtime caching ───────────────────────────────────────────

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
