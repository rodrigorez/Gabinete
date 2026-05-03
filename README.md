# 🏛️ Gabinete Virtual — Ambiente Imersivo A-Frame

Ambiente 3D interativo construído em **A-Frame** para navegação em Android e Desktop. Projetado para uso em modo quiosque (museus, exposições), com sistema completo de curadoria de acervo e segurança por criptografia AES-256-GCM.

---

## 🚀 Como Executar

```bash
npm install
npm run dev       # Servidor local em http://localhost:3000
```

> Para encriptar o `secrets.json` pela primeira vez:
> ```bash
> node encrypt-secrets.mjs
> ```

---

## 🎨 Funcionalidades

### Kiosk (index.html)
- **Navegação 3D Híbrida:** Mouse (Desktop) e touch (Android/Tablet)
- **Auto-Configuração de Hardware:** Detecção de GPU para ajuste de renderer e assets
- **Modo Quiosque:** Timer de inatividade (5min) → reset automático
- **Gesto de Admin:** 3 toques no canto superior esquerdo → Painel Admin
- **Splash Screen:** Barra de progresso com feedback de carregamento
- **Multilíngue (i18n):** Suporte a múltiplos idiomas via JSON
- **Painéis Multimídia:** Galeria, vídeo e texto com projeção 3D→2D
- **PWA / Offline-First:** Funciona sem internet após o primeiro acesso

### Admin (adm.html)
- **Autenticação:** Overlay de PIN inline com AES-256-GCM + rate-limiting (3 tentativas → 30s lockout)
- **Proteção de histórico:** `location.replace()` — sem back button para bypass
- **Trocar PIN:** Re-encriptação automática do `secrets.json` com nova chave
- **Logs de interação:** Visualização e exportação de eventos do kiosk
- **Modo Manutenção:** Acesso via `?admin=true` na URL

### Curadoria (curadoria.html)
- **Autenticação:** Overlay de PIN inline (mesmo padrão do admin)
- **CRUD de obras:** Criação, edição e remoção de objetos da cena
- **Upload de assets:** Imagens (→ WebP automático), modelos 3D (GLB), vídeos
- **Supabase Storage:** Assets enviados à CDN, URLs salvas no config
- **Auditoria de integridade:** Verifica acessibilidade de todos os assets
- **Remoção de órfãos:** Remove obras sem assets do config
- **Sync GitHub:** config.json sincronizado automaticamente

---

## 🔐 Segurança

| Camada | Implementação |
|--------|--------------|
| Armazenamento | `secrets.json` criptografado com AES-256-GCM |
| Chave | Derivada do `ADMIN_PIN` via PBKDF2 (200k iterações) |
| Memória | Credenciais vivem apenas em RAM — auto-clear após 30min |
| Rate Limiting | 3 tentativas → lockout 30s (em todos os overlays de PIN) |
| Produção | Fallback para `VITE_*` env vars (GitHub Pages — somente leitura) |

```
Fluxo Admin: Kiosk (3x canto) → adm.html (overlay PIN) → AES decrypt → Admin
```

---

## 🏗️ Estrutura do Projeto

| Arquivo/Pasta | Descrição |
|--------------|-----------|
| `index.html` | Cena A-Frame (Kiosk) |
| `adm.html` | Painel Admin (PIN, logs, trocar PIN) |
| `curadoria.html` | Interface de curadoria de obras |
| `js/` | Módulos ES JavaScript |
| `js/secrets-loader.js` | Criptografia AES-256-GCM, sessão, timeout |
| `js/supabase-client.js` | Upload/download de assets (Storage) |
| `js/sync-engine.js` | Sync bidirecional com GitHub |
| `js/kiosk-mode.js` | Timer, gesto admin, logs |
| `js/curadoria-app.js` | Lógica completa de curadoria |
| `js/config.js` | Constantes globais (zero magic numbers) |
| `assets/config.json` | Obras e URLs de assets |
| `secrets.json` | Credenciais criptografadas (gitignored) |
| `.github/workflows/deploy.yml` | CI/CD → GitHub Pages |
| `ARCHITECTURE.md` | Arquitetura técnica detalhada |
| `CODEBASE.md` | Mapa de módulos e dependências |

---

## 🛠️ Tecnologias

- **A-Frame 1.4.2** (WebVR/3D Framework)
- **Vanilla JavaScript (ES Modules)**
- **WebCrypto API** (AES-256-GCM, PBKDF2, SHA-256)
- **Supabase Storage** (CDN de assets)
- **GitHub API** (sync de config.json)
- **Vite 6** (Dev server + build)
- **PWA / Service Worker** (offline-first)
- **Google Fonts (Inter / Outfit)**

---

## 📦 Deploy (GitHub Pages)

```bash
git push origin main   # CI/CD dispara automaticamente
```

**Variáveis necessárias no repositório GitHub:**
- `vars.VITE_GITHUB_REPO` — Nome do repositório (ex: `usuario/repo`)
- `vars.VITE_SUPABASE_URL` — URL do projeto Supabase
- `secrets.VITE_SUPABASE_ANON_KEY` — Chave anon (leitura pública)

> `secrets.json` e a `service_role` key **nunca sobem para o repositório**.
