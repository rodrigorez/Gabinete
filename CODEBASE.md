# Mapeamento do Código: Gabinete Virtual A-Frame

Este documento serve para rastrear a estrutura de arquivos e as dependências críticas entre os módulos do sistema.

## 📂 Estrutura de Arquivos

```text
/
├── package.json        # Dependências Node.js (Vite, ESLint, Sharp) e Scripts úteis
├── vite.config.js      # Bundler/PWA + endpoint /api/save-secrets (Vite plugin)
├── .env.local          # Variáveis injetadas pelo Vite no build (Supabase/Github - ignorado pelo git)
├── index.html          # Ponto de entrada (Cena A-Frame + Kiosk)
├── adm.html            # Painel Admin (via pin-overlay.js, logs CSV, troca de PIN, toast de storage)
├── curadoria.html      # Interface de curadoria de obras
├── secrets.json        # Credenciais criptografadas AES-256-GCM (gitignored)
├── encrypt-secrets.mjs # Script one-time de criptografia do secrets.json (gitignored)
├── sw.js               # Service Worker (injectManifest via vite-plugin-pwa, Workbox local ESM)
├── css/
│   └── styles.css      # Estilos premium para overlays, painéis e fontes
├── js/
│   ├── vendor/         # Bibliotecas locais (aframe.min.js)
│   ├── main.js         # Entrypoint ES Module — orquestra inicialização
│   ├── events.js       # Dicionário Imutável de Eventos (Object.freeze)
│   ├── config.js       # Constantes centralizadas (KIOSK, HARDWARE, UI, SECRETS_TIMEOUT_MS)
│   ├── secrets-loader.js# Fallback híbrido (decrypt AES-256 + import.meta.env), auto-clear
│   ├── pin-overlay.js  # Overlay de PIN reutilizável (DRY entre adm.html e curadoria)
│   ├── supabase-client.js# Upload via Edge Function asset-manager; download/list anon
│   ├── sync-engine.js  # GitHub sync bidirecional (leitura direta; escrita via Edge Function github-sync)
│   ├── curadoria-app.js# CRUD obras, upload de assets, detecção de órfãos
│   ├── image-pipeline.js# Conversão WebP in-memory (OffscreenCanvas)
│   ├── hash-engine.js  # SHA-256 Web Crypto + fallback FNV-1a
│   ├── manifest.js     # CRUD do manifesto de hashes de assets
│   ├── app-state.js    # Store privado de configuração (substitui window global)
│   ├── state-manager.js# FSM de estados de transição (idle/transitioning)
│   ├── components.js   # Custom A-Frame components (hardware-profiler, interactive-object, etc)
│   ├── navigation.js   # Pilha de navegação (History Stack)
│   ├── view-controller.js # Controlador de transições 3D↔2D
│   ├── camera-rig.js   # Animação suave de câmera via AFRAME.ANIME
│   ├── spatial-tracker.js # Motor de projeção 3D→2D (posicionamento do painel HTML)
│   ├── ui-panel.js     # Gerenciamento do painel multimídia
│   ├── physics.js      # Motor OBB 3D (Cylinder Controller, Anti-NaN, Gravidade)
│   ├── kiosk-mode.js   # Gesto 3x → adm.html, timeout, logs, STORAGE_WARNING
│   ├── i18n.js         # Handler de internacionalização
│   ├── dev-editor.js   # DevTools on-device (Filtro de Meshes, Bounding Box X-Ray)
│   └── types.d.ts      # Declarações TypeScript para JSDoc type-checking
├── assets/
│   ├── images/         # Texturas WebP + gabinete.png (favicon)
│   ├── models/         # Modelos GLB/GLTF locais
│   ├── videos/         # Vídeos dos painéis multimídia
│   ├── config.json     # Obras e URLs de assets (Supabase CDN)
│   └── langs.json      # Dicionário Multilíngue (PT-BR, EN)
├── .github/workflows/
│   └── deploy.yml      # CI/CD: push main → build Vite → GitHub Pages
├── ARCHITECTURE.md     # Definições técnicas de alto nível
├── CODEBASE.md         # Este arquivo
├── SPEC_TECNICA_MVP.md # Especificação Técnica detalhada
└── README.md           # Visão geral e instruções de execução
```

> [!NOTE]
> A estrutura acima reflete o estado atual do sistema (Maio 2026).
> O projeto contém: core 3D (A-Frame), sistema de curadoria com Supabase Storage,
> segurança AES-256-GCM, sync GitHub bidirecional, modo quiosque e deploy GitHub Pages.

---

## ⛓️ Dependências de Arquivos

| Arquivo | Depende de | Motivo |
|---------|------------|--------|
| `index.html` | `js/vendor/aframe.min.js` | Core 3D engine (local, offline-first) |
| `index.html` | `vite.config.js` | DevServer + endpoint `/api/save-secrets` |
| `index.html` | `js/main.js` | Entrypoint ES Module |
| `index.html` | `assets/config.json` | Cena e metadados das obras |
| `adm.html` | `js/pin-overlay.js` | PIN overlay reutilizável (rate-limiting via GABINETE_CONFIG) |
| `adm.html` | `js/secrets-loader.js` | `loadSecrets`, `reEncryptSecrets`, `getSecret` |
| `adm.html` | `js/config.js` | `GABINETE_CONFIG` (PIN, lockout, timeout) |
| `curadoria.html` | `js/curadoria-app.js` | CRUD obras, filtro de busca instantâneo + upload |
| `curadoria.html` | `js/pin-overlay.js` | PIN overlay de acesso (reutiliza lógica do adm) |
| `js/main.js` | `nav, i18n, events, uiPanel, appState, viewController` | Orquestração central |
| `js/main.js` | `physics, components, kiosk-mode` | Side-effect imports (registram componentes A-Frame) |
| `js/kiosk-mode.js` | `config, events, secrets-loader` | Constantes, eventos e `loadSecrets` para PIN |
| `js/secrets-loader.js` | `js/config.js` | Faz o merge do JSON decriptado com fallback `import.meta.env` |
| `js/supabase-client.js` | `js/secrets-loader.js` | `getSecret` para `SUPABASE_URL` e `SUPABASE_ANON_KEY` |
| `js/sync-engine.js` | `js/secrets-loader.js` | `getSecret` para acesso a APIs; bypassa CORS com `no-cors` e cache |
| `js/main.js` | `js/events.js` | `EVENTS.ASSET_ERROR` — captura model-error de GLB e persiste em localStorage |
| `js/curadoria-app.js` | `supabase-client, sync-engine, image-pipeline` | Pipeline completo de upload |
| `js/view-controller.js` | `stateManager, cameraRig, spatialTracker, uiPanel, appState` | Transições |
| `js/components.js` | `events, config, kiosk-mode, nav, appState` | Componentes A-Frame |
| `css/styles.css` | `index.html` | Design Tokens (CSS Variables) |
| `sw.js` | PWA Engine | Cache offline de todos os assets |

---

## 🚀 Como Expandir
Para adicionar um novo objeto interativo:
1. Adicione a entrada do objeto em `assets/config.json` com seu modelo e metadados.
2. O sistema instanciará a entidade no A-Frame automaticamente via `main.js`.
3. Defina as coordenadas de renderização no `config.json` para evitar mexer no HTML.
4. Para animações de sub-partes (portas, gavetas), use `action: "gltf-part"` com `part_name`.
5. Para animações do objeto inteiro, use `action: "animate"` com `anim_target` e `anim_to`.
