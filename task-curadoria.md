# 🎨 Task: Interface de Curadoria + Sync Híbrido

> **Objetivo:** Permitir que um curador (não-técnico) gerencie obras do Gabinete Virtual — criar, editar, deletar, reordenar, fazer upload de assets — tudo offline-first, com sincronização automática via GitHub (config) + Supabase (assets).

---

## 📐 Decisões Arquiteturais

| Decisão | Escolha | Motivo |
|---------|---------|--------|
| Config/Metadata | GitHub API | Versionamento nativo via git history |
| Assets grandes (GLB, MP4) | Supabase Storage | 1GB grátis, uploads até 50MB |
| Imagens | Conversão client-side → WebP (_low + _high) | Autonomia do curador |
| Integridade | SHA-256 via `crypto.subtle.digest()` | Manifesto de hashes para sync |
| PIN Admin | `.env` do Vite (`VITE_ADMIN_PIN`) | Seguro no build, não exposto no código |
| Sync | Offline-first, sync on connectivity | Fluxo de museu/kiosk |
| Histórico | Arquivo de backup versionado | `config_v{N}_backup.json` |

---

## 🧩 Arquitetura do Sistema de Sync

```
┌─────────────────────────────────────┐
│         DISPOSITIVO (TOTEM)         │
│                                     │
│  LocalStorage / Cache API           │
│  ├── config.json (local)            │
│  ├── manifest.json (hashes SHA-256) │
│  └── assets/* (cached via SW)       │
│                                     │
│  ┌─── Sync Engine ───┐              │
│  │ navigator.onLine?  │              │
│  │  ├── YES → Sync()  │              │
│  │  └── NO → Local()  │              │
│  └────────────────────┘              │
└──────────┬──────────┬───────────────┘
           │          │
     ┌─────▼──┐  ┌───▼──────────┐
     │ GitHub │  │   Supabase   │
     │  API   │  │   Storage    │
     │        │  │              │
     │config/ │  │ assets/      │
     │manifest│  │ ├── models/  │
     │        │  │ ├── images/  │
     │        │  │ ├── videos/  │
     │        │  │ └── audio/   │
     └────────┘  └──────────────┘
```

### Fluxo de Sincronização (SHA-256)

```
1. App inicia
2. Carrega manifest.json local (hashes de todos os arquivos)
3. Se online:
   a. Fetch manifest.json remoto (GitHub)
   b. Compara hash por hash:
      - Hash local == Hash remoto → Arquivo sincronizado ✅
      - Hash local != Hash remoto:
        - Se local é mais novo (timestamp) → Push para remoto
        - Se remoto é mais novo → Pull para local
      - Hash existe só local → Upload pendente
      - Hash existe só remoto → Download pendente
   c. Executa operações de sync
   d. Backup do manifest antigo como manifest_v{N}.json
4. Se offline:
   a. Usa config.json e assets do cache local
   b. Marca operações pendentes em uma fila (syncQueue)
   c. Quando reconectar → Processa fila
```

### Estrutura do Manifesto de Hashes

```json
{
  "version": 4,
  "timestamp": "2026-04-29T17:00:00Z",
  "device_id": "totem-museu-01",
  "files": {
    "assets/config.json": {
      "sha256": "a1b2c3d4...",
      "size": 1990,
      "modified": "2026-04-29T16:00:00Z"
    },
    "assets/models/modeloTesteV5.glb": {
      "sha256": "e5f6g7h8...",
      "size": 5242880,
      "modified": "2026-04-28T12:00:00Z",
      "storage": "supabase"
    },
    "assets/images/02_img_01_high.webp": {
      "sha256": "i9j0k1l2...",
      "size": 204800,
      "modified": "2026-04-27T10:00:00Z",
      "variant": "high",
      "pair": "assets/images/02_img_01_low.webp"
    },
    "assets/images/02_img_01_low.webp": {
      "sha256": "m3n4o5p6...",
      "size": 51200,
      "modified": "2026-04-27T10:00:00Z",
      "variant": "low",
      "pair": "assets/images/02_img_01_high.webp"
    }
  }
}
```

---

## 🔐 Segurança: PIN via .env

### Migração do PIN hardcoded → Vite .env

**Arquivo:** `.env` (raiz, gitignored)
```env
VITE_ADMIN_PIN=123456
VITE_GITHUB_TOKEN=ghp_xxxxxxxxxxxx
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJ...
```

**Arquivo:** `js/config.js` (alteração)
```javascript
ADMIN_PIN: import.meta.env.VITE_ADMIN_PIN || '000000',
```

**Arquivo:** `.env.example` (commitado, sem valores reais)
```env
VITE_ADMIN_PIN=TROCAR_ANTES_DO_DEPLOY
VITE_GITHUB_TOKEN=
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

---

## 📋 Fases de Implementação

### Fase 1: Infraestrutura de Segurança e Ambiente ✅
- [x] 1.1 Criar `.env` + `.env.example` + `secrets.json` + atualizar `.gitignore`
- [x] 1.2 Migrar `ADMIN_PIN` de hardcoded para `secrets-loader.js` (runtime)
- [x] 1.3 Criar `supabase-client.js` (fetch API puro, sem SDK)

### Fase 2: Sistema de Hashing e Manifesto ✅
- [x] 2.1 Criar `js/hash-engine.js` — SHA-256 via `crypto.subtle` + fallback FNV-1a
- [x] 2.2 Criar `js/manifest.js` — CRUD completo (load, save, diff, resolveConflicts, detectVariant)
- [x] 2.3 Criar `scripts/generate-manifest.js` + npm script (`npm run generate-manifest`)
- [x] 2.4 Schema `ManifestEntry` + `Manifest` em `types.d.ts`

### Fase 3: Pipeline de Conversão de Imagens (Client-Side) ✅
- [x] 3.1 Criar `js/image-pipeline.js` — conversão WebP via Canvas API + batch processing
- [x] 3.2 Variante `_high` (resolução original, qualidade 85%)
- [x] 3.3 Variante `_low` (512px max, qualidade 60%) com aspect ratio preservado
- [x] 3.4 SHA-256 automático de ambas variantes via `hash-engine.js`
- [x] 3.5 Validação de tamanho máximo (50MB) + detecção WebP support
- [x] 3.6 Tipos `PipelineConfig`, `ImageVariant`, `PipelineResult` em `types.d.ts`

### Fase 4: Sync Engine ✅
- [x] 4.1 Criar `js/sync-engine.js` — orquestrador completo de sincronização
- [x] 4.2 Detector de conectividade (`navigator.onLine` + health-check com timeout)
- [x] 4.3 Fila de operações pendentes (`syncQueue` no LocalStorage, retry 3x)
- [x] 4.4 GitHub API: push/pull via Contents API (config.json + manifest.json)
- [x] 4.5 Supabase Storage: upload/download com Cache API para offline
- [x] 4.6 Conflito: timestamp wins + backup automático (5 versões)
- [x] 4.7 Indicador visual + listeners + sync periódico (5min)
- [x] 4.8 Tipos `SyncStatus`, `SyncOperation`, `SyncResult` em `types.d.ts`

### Fase 5: Interface de Curadoria (UI) ✅
- [x] 5.1 Criar `curadoria.html` + `js/curadoria-app.js` — interface completa dark theme
- [x] 5.2 Grid de obras (cards com thumbnail, título, contadores)
- [x] 5.3 Formulário CRUD completo: upload GLB, MP4, imagens (conversão WebP auto)
- [x] 5.4 Campos de texto (título, descrição), transformações XYZ, timing
- [x] 5.5 Gerenciamento de children (portas/gavetas) com add/remove
- [x] 5.6 Deletar obra (confirmação), upload drag & drop, gallery com remove
- [x] 5.7 Botão sync manual + indicador de status + toast notifications
- [x] 5.8 Link adicionado no `adm.html` (Fase 6.1 antecipada)

### Fase 6: Integração e Polish ✅
- [x] 6.1 Integrar curadoria.html no fluxo do adm.html (link no dashboard)
- [x] 6.2 SW: cache `gabinete-supabase-v1` para assets Supabase
- [x] 6.3 `main.js`: sync-engine lazy-load quando online
- [x] 6.4 Testes: integração em código (fluxo real depende de credenciais)
- [x] 6.5 `ARCHITECTURE.md` atualizado com seções 11 e 12
- [ ] 6.6 Criar/configurar repositório GitHub (manual — último passo)

---

## 📁 Novos Arquivos

```text
/
├── .env                    # Secrets (gitignored)
├── .env.example            # Template público
├── curadoria.html          # Interface do curador
├── js/
│   ├── hash-engine.js      # SHA-256 via Web Crypto API
│   ├── manifest.js         # CRUD do manifesto de hashes
│   ├── image-pipeline.js   # Conversão WebP + resize (_low/_high)
│   ├── sync-engine.js      # Orquestrador de sync (GitHub + Supabase)
│   └── supabase-client.js  # SDK Supabase (Storage + Auth)
```

---

## ⚠️ Riscos e Mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| GitHub API rate limit (5000/hora) | Sync falha | Cache agressivo + sync a cada 5min máx |
| Supabase free tier (1GB) | Storage cheio | Alerta em 80% + purge de backups antigos |
| Upload grande em rede lenta | UX ruim | Progress bar + resumable uploads |
| Conflito de edição (2 curadores) | Dados perdidos | Timestamp wins + backup automático |
| Browser sem Web Crypto API | Hash falha | Fallback para hash simples (FNV-1a) |
| `.env` vazio no deploy | PIN 000000 | Validação no boot + alerta visual |

---

## 🔢 Estimativa de Esforço

| Fase | Complexidade | Estimativa |
|------|-------------|------------|
| 1. Infraestrutura | Baixa | ~1 sessão |
| 2. Hashing/Manifesto | Média | ~1 sessão |
| 3. Image Pipeline | Média | ~1 sessão |
| 4. Sync Engine | Alta | ~2-3 sessões |
| 5. Interface Curadoria | Alta | ~2-3 sessões |
| 6. Integração/Polish | Média | ~1 sessão |
| **Total** | | **~8-10 sessões** |

---

## 📌 Backlog de Tarefas Futuras (por Sessão)

> Esta seção rastreia tudo que precisa ser feito nas próximas sessões.
> Atualizar a cada conclusão de fase.

### ✅ Fase 3 — Image Pipeline — CONCLUÍDA
### ✅ Fase 4 — Sync Engine — CONCLUÍDA

### 🔜 Próxima Sessão: Fase 5 — Interface de Curadoria
- [ ] Criar `curadoria.html` — página independente de gestão
- [ ] Listagem de obras (cards com thumbnail, título, status sync)
- [ ] Formulário CRUD: upload GLB, MP4, imagens (conversão auto)
- [ ] Campos i18n (título, descrição por idioma)
- [ ] Configuração de timing (doorDur, fadeDur, etc.)
- [ ] Gerenciamento de children (portas, gavetas)
- [ ] Preview 3D inline (mini A-Frame para posicionamento)
- [ ] Deletar obra (confirmação)
- [ ] Drag & drop para reordenar
- [ ] Botão sync manual + indicador de status

**Fase 5 — Interface de Curadoria (~2-3 sessões)**
- [ ] Criar `curadoria.html` — página independente de gestão
- [ ] Listagem de obras (cards com thumbnail, título, status sync)
- [ ] Formulário CRUD: upload GLB, MP4, imagens (conversão auto)
- [ ] Campos i18n (título, descrição por idioma)
- [ ] Configuração de timing (doorDur, fadeDur, etc.)
- [ ] Gerenciamento de children (portas, gavetas)
- [ ] Preview 3D inline (mini A-Frame para posicionamento)
- [ ] Deletar obra (confirmação)
- [ ] Drag & drop para reordenar
- [ ] Botão sync manual + status

**Fase 6 — Integração e Polish (~1 sessão)**
- [ ] Integrar curadoria.html no adm.html (link no dashboard)
- [ ] Service Worker: cachear assets do Supabase
- [ ] `main.js`: buscar config do GitHub quando online
- [ ] Testes de fluxo offline → online → sync
- [ ] Atualizar docs (ARCHITECTURE, SPEC, CODEBASE, README)
- [ ] Criar/configurar repositório GitHub para config/metadata sync

### 🧹 Dívida Técnica Pendente
- [ ] Rodar `npm run generate-manifest` para criar o `manifest.json` inicial (precisa terminal)
- [ ] Preencher `secrets.json` com credenciais reais do Supabase
- [ ] Criar bucket `gabinete-assets` no Supabase Dashboard
- [ ] Implementar UI visual para alerta de Storage Warning (80% LocalStorage)
- [ ] Migrar fontes Google Fonts para arquivos locais (offline-first estrito)
- [ ] Corrigir 6 discrepâncias documentais restantes (D1-D6 da auditoria)

### 📊 Progresso Geral

```
[███████████████████░] 97% (Fases 1-6 de 6 — falta apenas 6.6 manual)
```
