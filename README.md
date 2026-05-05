# 🏛️ Gabinete Virtual — Ambiente Imersivo A-Frame

Ambiente 3D interativo construído em **A-Frame** para navegação em Android e Desktop. Projetado para uso em modo quiosque (museus, exposições), com sistema completo de curadoria de acervo e segurança por criptografia AES-256-GCM.

---

## 🚀 Como Executar

```bash
npm install
npm run dev       # Servidor local em http://localhost:3000
```

> Para criar o `secrets.json` criptografado pela primeira vez, acesse `adm.html` localmente,
> insira as credenciais e clique em **Trocar PIN**. O endpoint `/api/save-secrets` do Vite
> grava o arquivo criptografado com AES-256-GCM em disco automaticamente.

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
| `js/sync-engine.js` | Sync bidirecional com GitHub + Dev Lock (`isDevLocked`) |
| `js/kiosk-mode.js` | Timer, gesto admin, logs |
| `js/curadoria-app.js` | Lógica completa de curadoria |
| `js/config.js` | Constantes globais (zero magic numbers) + `stampConfig()` |
| `assets/config.json` | Obras e URLs de assets |
| `secrets.json` | Credenciais criptografadas (gitignored) |
| `.github/workflows/deploy.yml` | CI/CD → GitHub Pages |
| `ARCHITECTURE.md` | Arquitetura técnica detalhada |
| `CODEBASE.md` | Mapa de módulos e dependências |
| `DEV-WORKFLOW.md` | Guia operacional: Dev Lock, conflitos de sync, fluxo do curador |

---

## 🛠️ Tecnologias

- **A-Frame 1.4.2** *(versão de referência — bundle local em `js/vendor/aframe.min.js`)* (WebVR/3D Framework)
- **Vanilla JavaScript (ES Modules)**
- **WebCrypto API** (AES-256-GCM, PBKDF2, SHA-256)
- **Supabase Storage** (CDN de assets)
- **GitHub API** (sync de config.json)
- **Vite 6** (Dev server + build)
- **PWA / Service Worker** (offline-first)
- **Inter / Outfit** (fontes locais em `assets/fonts/` para `index.html` e `curadoria.html` — offline-first, sem CDN; `adm.html` usa Google Fonts CDN pois requer internet)

---

## 📦 Deploy (GitHub Pages)

```bash
git push origin main   # CI/CD dispara automaticamente
```

**Variáveis de ambiente necessárias no repositório GitHub:**
- `vars.VITE_SUPABASE_URL` — URL do projeto Supabase
- `secrets.VITE_SUPABASE_ANON_KEY` — Chave anon (leitura pública)

> **Nota:** `VITE_GITHUB_REPO` está **hardcoded** no `deploy.yml` como `rodrigorez/Gabinete`.
> Para mudar o repositório alvo, edite diretamente o arquivo `.github/workflows/deploy.yml`.

> `secrets.json` e a `service_role` key **nunca sobem para o repositório**.

---

## 🔑 Setup do GitHub Token (Fine-Grained) — F3.2

O `GITHUB_TOKEN` armazenado no `secrets.json` do tablet permite que o kiosk/curador escreva
no repositório. Para minimizar o risco de exposição:

1. Acesse [github.com/settings/tokens](https://github.com/settings/tokens) → **Fine-grained tokens**
2. Clique em **Generate new token**
3. Configure:
   - **Repository access:** Apenas `rodrigorez/Gabinete`
   - **Permissions → Contents:** `Read and write`
   - **Permissions → Metadata:** `Read-only` (obrigatório)
   - **Expiration:** 1 ano (anote a data de renovação)
4. Copie o token e adicione ao `secrets.json` via `adm.html → Trocar PIN`
5. **Renove anualmente** — crie um lembrete no calendário

> ⚠️ **Risco aceito documentado:** O token reside em dispositivo físico de museu.
> Mitigação: token com escopo mínimo + criptografia AES-256-GCM + PIN com rate-limiting.

---

## ⚠️ Limitações Conhecidas — F3.3

### 1. GitHub API Rate Limiting
- **Limite:** 5.000 req/hora com token, 60 req/hora sem token
- **Situação de risco:** Múltiplos dispositivos sincronizando a cada 5min em rede instável
  (reconexões frequentes = muitos ciclos de sync)
- **Comportamento atual:** Se a API retornar 429, o sync falha graciosamente e registra
  aviso no console. **Não há retry automático nesta versão.**
- **Mitigação:** O kiosk continua funcionando com a config local cacheada

### 2. GITHUB_TOKEN em Dispositivo Físico
- O token com permissão de escrita fica no `secrets.json` criptografado no tablet
- Um atacante com acesso físico + força bruta do PIN (4-6 dígitos) pode comprometer o repo
- **Mitigação implementada:** AES-256-GCM + PBKDF2 200k iterações + rate-limiting de PIN
- **Mitigação recomendada:** Usar token Fine-Grained com escopo mínimo (ver seção acima)

### 3. Rollback Manual (fallback sem UI)
- A UI de rollback em `adm.html` cobre os 5 backups automáticos
- Se a UI não estiver disponível, usar o console do navegador:
```js
// Listar backups disponíveis
JSON.parse(localStorage.getItem('gabinete_config_backups_v1')).forEach((b,i) =>
  console.log(i, b.timestamp, b.source))

// Restaurar backup de índice 0
const backups = JSON.parse(localStorage.getItem('gabinete_config_backups_v1'));
localStorage.setItem('gabinete_kiosk_config', backups[0].data);
```

### 4. Fontes Locais — Atualização
- As fontes Inter e Outfit estão em `assets/fonts/` (offline-first)
- Para atualizar: `npm run download-fonts`
- Commitar `assets/fonts/` e `css/fonts.css` após a atualização

### 5. config.json e Service Worker
- O SW usa `StaleWhileRevalidate` para `assets/config.json`
- Isso significa: serve do cache imediatamente + atualiza em background
- **Implicação:** Após o curador publicar uma nova config, os visitantes veem
  a versão anterior até o próximo carregamento da página

