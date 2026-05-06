import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { writeFileSync, existsSync, mkdirSync, copyFileSync, statSync, readdirSync, createWriteStream } from 'node:fs';
import { resolve, join, dirname } from 'node:path';

/**
 * Plugin Vite: Copia arquivos estáticos vitais que o Vite ignora por não estarem na pasta public/
 */
function copyStaticFilesPlugin() {
  return {
    name: 'copy-static-files',
    closeBundle() {
      function copyRecursiveSync(src, dest) {
        if (!existsSync(src)) return;
        const stats = statSync(src);
        if (stats.isDirectory()) {
          if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
          readdirSync(src).forEach(child => {
            copyRecursiveSync(join(src, child), join(dest, child));
          });
        } else {
          copyFileSync(src, dest);
        }
      }

      // 1. Copia o A-Frame
      const aframeSrc = resolve(process.cwd(), 'js/vendor/aframe.min.js');
      const aframeDest = resolve(process.cwd(), 'dist/js/vendor/aframe.min.js');
      if (existsSync(aframeSrc)) {
        if (!existsSync(dirname(aframeDest))) mkdirSync(dirname(aframeDest), { recursive: true });
        copyFileSync(aframeSrc, aframeDest);
      }

      // 2. Copia pasta assets inteira (modelos 3d, imagens, config.json)
      copyRecursiveSync(resolve(process.cwd(), 'assets'), resolve(process.cwd(), 'dist/assets'));

      // 3. Copia secrets.json vazio/base
      const secretsSrc = resolve(process.cwd(), 'secrets.json');
      if (existsSync(secretsSrc)) {
        copyFileSync(secretsSrc, resolve(process.cwd(), 'dist/secrets.json'));
      }

      console.log('✅ Arquivos estáticos (A-Frame, assets/, secrets.json) copiados manualmente para dist/');
    }
  };
}

/**
 * Plugin Vite: endpoint local para salvar secrets.json em disco.
 * POST /api/save-secrets → { ok: true }
 * Apenas disponível no servidor local (dev/kiosk).
 */
function secretsWriterPlugin() {
  return {
    name: 'secrets-writer',
    configureServer(server) {
      server.middlewares.use('/api/save-secrets', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const filePath = resolve(process.cwd(), 'secrets.json');
            writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(e) }));
          }
        });
      });
    }
  };
}

/**
 * Plugin Vite: endpoint local para salvar assets (Imagens, Modelos) fisicamente no disco.
 * POST /api/save-asset?path=assets/images/foo.webp
 */
function assetWriterPlugin() {
  return {
    name: 'asset-writer',
    configureServer(server) {
      server.middlewares.use('/api/save-asset', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
        
        const urlObj = new URL(req.url, `http://${req.headers.host}`);
        const filePathParam = urlObj.searchParams.get('path');
        if (!filePathParam) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: 'Missing path param' }));
        }

        const absolutePath = resolve(process.cwd(), filePathParam);
        const dir = dirname(absolutePath);

        try {
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        } catch (dirErr) {
          console.error('Erro ao criar diretorio:', dirErr);
          res.statusCode = 500;
          return res.end(JSON.stringify({ error: 'Directory error: ' + String(dirErr) }));
        }

        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        
        req.on('end', () => {
          try {
            const buffer = Buffer.concat(chunks);
            writeFileSync(absolutePath, buffer);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: filePathParam, size: buffer.length }));
          } catch (e) {
            console.error('Erro ao escrever arquivo local:', e);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(e) }));
          }
        });

        req.on('error', (err) => {
          console.error('Erro no stream do req:', err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(err) }));
          }
        });
      });
    }
  };
}

export default defineConfig({
  base: './',

  plugins: [
    copyStaticFilesPlugin(),
    secretsWriterPlugin(),
    assetWriterPlugin(),
    VitePWA({
      // injectManifest: usa o sw.js customizado e injeta a lista de assets no build.
      // O Workbox é bundlado localmente pelo Vite — sem CDN externa.
      strategies: 'injectManifest',
      srcDir: '.',
      filename: 'sw.js',
      injectManifest: {
        injectionPoint: 'self.__WB_MANIFEST',
        globPatterns: ['**/*.{js,css,html,json,png,webp,jpg,jpeg,glb,mp4}'],
        globIgnores: ['assets/raw/**', '**/*.map'],
        maximumFileSizeToCacheInBytes: 100 * 1024 * 1024, // Limite de 100MB para Kiosk Offline
      },
      registerType: 'autoUpdate',
      injectRegister: false,

      manifest: {
        name: 'Gabinete Virtual',
        short_name: 'Gabinete',
        description: 'Ambiente 3D imersivo para museus — Offline First PWA',
        theme_color: '#00D1FF',
        background_color: '#121212',
        display: 'fullscreen',
        orientation: 'any',
        icons: [
          { src: 'assets/images/icon-192.png', sizes: '192x192', type: 'image/png' }
        ]
      },

      devOptions: {
        enabled: true,
        type: 'module' // sw.js usa ESM imports
      }
    })
  ],

  server: {
    port: 3000,
    open: true
  },

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: 'index.html',
        adm: 'adm.html',
        curadoria: 'curadoria.html'
      }
    }
  }
});
