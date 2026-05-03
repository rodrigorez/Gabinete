// @ts-check

/**
 * Sync Engine — Orquestrador de Sincronização Offline-First.
 *
 * Coordena a sincronização entre:
 *   - LocalStorage / Cache (offline)
 *   - GitHub API (config.json + manifest.json)
 *   - Supabase Storage (assets grandes: GLB, MP4, WebP)
 *
 * Fluxo:
 *   1. Detecta conectividade
 *   2. Compara manifestos (local vs remoto) via SHA-256
 *   3. Resolve conflitos (timestamp wins + backup)
 *   4. Executa operações de sync (push/pull)
 *   5. Atualiza indicador visual de status
 */

import { getSecret } from './secrets-loader.js';
import { uploadAsset, downloadAsset, isSupabaseReady } from './supabase-client.js';
import {
  loadManifest, saveManifestLocal, diffManifests,
  resolveConflicts, setEntry, exportManifest, createEmptyManifest
} from './manifest.js';

// ─── Constantes ───────────────────────────────────────────────

const SYNC_QUEUE_KEY = 'gabinete_sync_queue_v1';
const CONFIG_BACKUP_KEY = 'gabinete_config_backups_v1';
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
const HEALTH_CHECK_TIMEOUT_MS = 5000;

/**
 * @typedef {'synced'|'pending'|'offline'|'syncing'|'error'} SyncStatus
 */

/**
 * @typedef {Object} SyncOperation
 * @property {'push'|'pull'|'delete'} action
 * @property {string} path — Caminho do arquivo
 * @property {'github'|'supabase'} target — Destino
 * @property {string} [sha256] — Hash esperado
 * @property {number} timestamp — Quando foi enfileirado
 * @property {number} retries — Tentativas realizadas
 */

/**
 * @typedef {Object} SyncResult
 * @property {boolean} success
 * @property {number} pushed — Arquivos enviados
 * @property {number} pulled — Arquivos recebidos
 * @property {number} conflicts — Conflitos resolvidos
 * @property {number} errors — Erros durante sync
 * @property {string[]} errorDetails — Detalhes dos erros
 */

// ─── Estado Interno ───────────────────────────────────────────

/** @type {SyncStatus} */
let _status = 'offline';

/** @type {number|null} */
let _intervalId = null;

/** @type {Array<function(SyncStatus): void>} */
const _listeners = [];

// ─── Conectividade ────────────────────────────────────────────

/**
 * Verifica se há conexão real (não apenas navigator.onLine).
 * Faz um health-check com timeout para confirmar.
 * @returns {Promise<boolean>}
 */
export async function checkConnectivity() {
  if (!navigator.onLine) return false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

    // Health-check contra o próprio Supabase (sem token)
    const supabaseUrl = getSecret('SUPABASE_URL');
    const target = supabaseUrl
      ? `${supabaseUrl}/rest/v1/`
      : 'https://www.google.com/generate_204';

    // Usamos no-cors para evitar que o navegador bloqueie o ping por motivos de segurança.
    // Isso fará a resposta ser "opaque" (status 0), o que é suficiente para provar conectividade.
    const res = await fetch(target, { method: 'GET', mode: 'no-cors', signal: controller.signal });
    clearTimeout(timeout);
    
    // Se o fetch resolveu (mesmo opaque) e não caiu no catch, há internet.
    return res.type === 'opaque' || res.ok || res.status === 401;
  } catch {
    return false;
  }
}

// ─── Fila de Operações ────────────────────────────────────────

/**
 * Carrega a fila de operações pendentes do LocalStorage.
 * @returns {SyncOperation[]}
 */
export function loadQueue() {
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Salva a fila no LocalStorage.
 * @param {SyncOperation[]} queue
 */
function saveQueue(queue) {
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Adiciona uma operação à fila de sync.
 * @param {SyncOperation} op
 */
export function enqueue(op) {
  const queue = loadQueue();
  // Evita duplicatas do mesmo path+action
  const exists = queue.some(q => q.path === op.path && q.action === op.action);
  if (!exists) {
    queue.push(op);
    saveQueue(queue);
    setStatus('pending');
  }
}

/**
 * Remove uma operação da fila.
 * @param {string} path
 * @param {'push'|'pull'|'delete'} action
 */
function dequeue(path, action) {
  const queue = loadQueue().filter(q => !(q.path === path && q.action === action));
  saveQueue(queue);
}

// ─── GitHub API ───────────────────────────────────────────────

/**
 * Lê um arquivo do GitHub via API (Contents endpoint).
 * @param {string} path — Caminho no repo (ex: 'config.json')
 * @returns {Promise<{content: string, sha: string}|null>}
 */
async function githubGet(path) {
  const repo = getSecret('GITHUB_REPO');
  const token = getSecret('GITHUB_TOKEN');
  if (!repo) return null;

  try {
    const headers = { 'Accept': 'application/vnd.github.v3+json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}?t=${Date.now()}`, {
      headers,
      cache: 'no-store'
    });

    if (!res.ok) return null;
    const data = await res.json();
    // data.content vem em base64 com quebras de linha
    const content = atob(data.content.replace(/\n/g, ''));
    return { content, sha: data.sha };
  } catch {
    return null;
  }
}

/**
 * Verifica se o repositório GitHub está acessível.
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function checkGithubAccess() {
  const repo = getSecret('GITHUB_REPO');
  const token = getSecret('GITHUB_TOKEN');
  if (!repo) return { ok: false, error: 'GITHUB_REPO não configurado.' };

  try {
    const headers = { 'Accept': 'application/vnd.github.v3+json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`https://api.github.com/repos/${repo}`, { headers });
    if (res.status === 404) return { ok: false, error: `Repositório "${repo}" não encontrado ou privado.` };
    if (!res.ok) return { ok: false, error: `GitHub retornou ${res.status}.` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Falha de rede: ${/** @type {Error} */ (e).message}` };
  }
}

/**
 * Escreve/atualiza um arquivo no GitHub via API.
 * @param {string} path — Caminho no repo
 * @param {string} content — Conteúdo em texto
 * @param {string} message — Mensagem do commit
 * @param {string} [existingSha] — SHA do arquivo existente (para update)
 * @returns {Promise<boolean>}
 */
async function githubPut(path, content, message, existingSha) {
  const repo  = getSecret('GITHUB_REPO');
  const token = getSecret('GITHUB_TOKEN');

  // 1. Arquitetura Serverless Direta (MVP): Usa o Token do GitHub do secrets.json (Criptografado)
  if (repo && token) {
    try {
      const body = {
        message: message,
        content: btoa(unescape(encodeURIComponent(content))),
        branch: 'main'
      };
      if (existingSha) body.sha = existingSha;

      const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
      });
      return res.ok;
    } catch (err) {
      console.error('Erro na API do GitHub:', err);
      return false;
    }
  }

  // 2. Fallback: Arquitetura Enterprise via Supabase Edge Functions
  const supabaseUrl = getSecret('SUPABASE_URL');
  const anonKey     = getSecret('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) {
    console.warn('⚠️ Sync impossível: GITHUB_TOKEN local não encontrado e Supabase não configurado.');
    return false;
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/github-sync`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${anonKey}`,
        'apikey': anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path, content, message, sha: existingSha }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Backup de Configuração ──────────────────────────────────

/**
 * Salva uma versão de backup do config no LocalStorage.
 * Mantém no máximo 5 backups.
 * @param {string} configJson — JSON stringified do config
 * @param {string} source — Origem ('local' ou 'remote')
 */
function backupConfig(configJson, source) {
  try {
    const raw = localStorage.getItem(CONFIG_BACKUP_KEY);
    /** @type {Array<{timestamp: string, source: string, data: string}>} */
    const backups = raw ? JSON.parse(raw) : [];

    backups.unshift({
      timestamp: new Date().toISOString(),
      source,
      data: configJson
    });

    // Mantém apenas os 5 mais recentes
    while (backups.length > 5) backups.pop();

    localStorage.setItem(CONFIG_BACKUP_KEY, JSON.stringify(backups));
  } catch (e) {
    console.warn('⚠️ Falha ao salvar backup de config:', e);
  }
}

// ─── Status e Listeners ──────────────────────────────────────

/**
 * Define o status atual do sync e notifica listeners.
 * @param {SyncStatus} status
 */
function setStatus(status) {
  _status = status;
  _listeners.forEach(fn => fn(status));
  updateStatusUI(status);
}

/**
 * Retorna o status atual do sync.
 * @returns {SyncStatus}
 */
export function getStatus() {
  return _status;
}

/**
 * Registra um listener para mudanças de status.
 * @param {function(SyncStatus): void} fn
 */
export function onStatusChange(fn) {
  _listeners.push(fn);
}

/**
 * Registra um listener para quando uma nova config é puxada do remoto.
 * Útil para o kiosk reconstruir a cena sem recarregar a página.
 * @param {function(GabineteConfig): void} fn
 */
export function onConfigUpdated(fn) {
  window.addEventListener('gabinete:config-updated', (/** @type {any} */ e) => fn(e.detail));
}

/**
 * Dispara evento informando que a config foi atualizada pelo sync remoto.
 * @param {GabineteConfig} config
 */
function notifyConfigUpdated(config) {
  window.dispatchEvent(new CustomEvent('gabinete:config-updated', { detail: config }));
  console.log('📡 Config atualizada pelo sync remoto — reconstruindo cena...');
}

// ─── Boot Config Resolution ───────────────────────────────────

/**
 * Resolve a config definitiva no boot do kiosk.
 *
 * Estratégia "melhor versão vence":
 *   1. Se offline → usa localStorage ou assets/config.json
 *   2. Se online → compara local vs GitHub pelo _lastModified e nº de objetos
 *      - GitHub mais novo → pull, salva no localStorage, retorna config remota
 *      - Local mais novo  → push para GitHub, retorna config local
 *      - Só existe local  → push para GitHub, retorna config local
 *      - Só existe remoto → pull, salva no localStorage, retorna config remota
 *
 * Funciona igual para mesma máquina ou dispositivos diferentes.
 *
 * @returns {Promise<GabineteConfig|null>} Config resolvida, ou null se nenhuma encontrada.
 */
export async function resolveConfigAtBoot() {
  const localRaw = localStorage.getItem('gabinete_kiosk_config');

  // ── Offline: usa o que tiver localmente ──────────────────────
  const online = await checkConnectivity();
  if (!online) {
    console.log('📴 Offline — usando config local.');
    return localRaw ? JSON.parse(localRaw) : null;
  }

  // ── Online: verifica acesso ao GitHub ────────────────────────
  const githubCheck = await checkGithubAccess();
  if (!githubCheck.ok) {
    console.warn(`⚠️ GitHub inacessível (${githubCheck.error}) — usando config local.`);
    return localRaw ? JSON.parse(localRaw) : null;
  }

  // ── Busca config remota ───────────────────────────────────────
  const remoteData = await githubGet('assets/config.json');

  // Caso A: só existe local → push para GitHub, retorna local
  if (!remoteData && localRaw) {
    console.log('📤 Config nova (só local) → enviando para GitHub...');
    const existing = await githubGet('assets/config.json');
    await githubPut('assets/config.json', localRaw, 'boot: push config inicial', existing?.sha);
    return JSON.parse(localRaw);
  }

  // Caso B: só existe remota → pull, salva local, retorna remota
  if (remoteData && !localRaw) {
    console.log('📥 Config nova (só GitHub) → salvando localmente...');
    localStorage.setItem('gabinete_kiosk_config', remoteData.content);
    return JSON.parse(remoteData.content);
  }

  // Caso C: ambas existem → compara e usa a mais nova
  if (remoteData && localRaw) {
    /** @type {GabineteConfig} */ let localObj;
    /** @type {GabineteConfig} */ let remoteObj;
    try { localObj = JSON.parse(localRaw); } catch { return JSON.parse(remoteData.content); }
    try { remoteObj = JSON.parse(remoteData.content); } catch { return localObj; }

    const localTime  = localObj._lastModified  ? new Date(/** @type {any} */ (localObj)._lastModified).getTime()  : 0;
    const remoteTime = remoteObj._lastModified ? new Date(/** @type {any} */ (remoteObj)._lastModified).getTime() : 0;
    const localCount  = Array.isArray(localObj.objects)  ? localObj.objects.length  : 0;
    const remoteCount = Array.isArray(remoteObj.objects) ? remoteObj.objects.length : 0;

    const remoteMaisNovo    = remoteTime > localTime;
    const remoteMaisObjetos = remoteCount > localCount;

    if (remoteMaisNovo || remoteMaisObjetos) {
      // GitHub vence → pull
      console.log(`📥 GitHub mais atual (${remoteCount} obj / ${new Date(remoteTime).toLocaleTimeString()}) → usando remoto.`);
      localStorage.setItem('gabinete_kiosk_config', remoteData.content);
      return remoteObj;
    } else {
      // Local vence → push para manter GitHub em sync
      console.log(`📤 Local mais atual (${localCount} obj / ${new Date(localTime).toLocaleTimeString()}) → enviando para GitHub.`);
      await githubPut('assets/config.json', localRaw, 'boot: push config local mais recente', remoteData.sha);
      return localObj;
    }
  }

  // Fallback: nenhuma config encontrada
  return null;
}

/**
 * Atualiza o indicador visual de status no DOM (se existir).
 * @param {SyncStatus} status
 */
function updateStatusUI(status) {
  const el = document.getElementById('sync-status-indicator');
  if (!el) return;

  const map = {
    synced:  { emoji: '🟢', text: 'Sincronizado' },
    pending: { emoji: '🟡', text: 'Pendente' },
    offline: { emoji: '🔴', text: 'Offline' },
    syncing: { emoji: '🔄', text: 'Sincronizando...' },
    error:   { emoji: '❌', text: 'Erro de Sync' }
  };

  const info = map[status] || map.offline;
  el.textContent = `${info.emoji} ${info.text}`;
  el.dataset.status = status;
}

// ─── Sync Principal ──────────────────────────────────────────

/**
 * Executa o ciclo completo de sincronização.
 * @returns {Promise<SyncResult>}
 */
export async function sync() {
  /** @type {SyncResult} */
  const result = { success: false, pushed: 0, pulled: 0, conflicts: 0, errors: 0, errorDetails: [] };

  // 1. Verifica conectividade
  const online = await checkConnectivity();
  if (!online) {
    setStatus('offline');
    result.errorDetails.push('Sem conexão com internet.');
    return result;
  }

  // 1b. Valida acesso ao GitHub antes de prosseguir
  const githubCheck = await checkGithubAccess();
  if (!githubCheck.ok) {
    setStatus('error');
    result.errors++;
    result.errorDetails.push(`GitHub: ${githubCheck.error}`);
    return result;
  }

  setStatus('syncing');

  try {
    // 2. Carrega manifestos
    const localManifest = await loadManifest();

    // 3. Tenta carregar manifesto remoto do GitHub
    const remoteData = await githubGet('manifest.json');
    /** @type {import('./manifest.js').Manifest} */
    let remoteManifest;

    if (remoteData) {
      try {
        remoteManifest = JSON.parse(remoteData.content);
      } catch {
        remoteManifest = createEmptyManifest('remote');
      }
    } else {
      remoteManifest = createEmptyManifest('remote');
    }

    // 4. Compara manifestos
    const diff = diffManifests(localManifest, remoteManifest);

    // 5. Resolve conflitos
    const { pushPaths: conflictPush, pullPaths: conflictPull } =
      resolveConflicts(localManifest, remoteManifest, diff.conflicts);
    result.conflicts = diff.conflicts.length;

    // 6. Processar pushes (local → remoto)
    const allPushPaths = [...diff.toPush, ...conflictPush];
    for (const path of allPushPaths) {
      const entry = localManifest.files[path];
      if (!entry) continue;

      try {
        if (entry.storage === 'supabase' && isSupabaseReady()) {
          // Upload para Supabase
          const res = await fetch(path);
          if (res.ok) {
            const blob = await res.blob();
            const uploadResult = await uploadAsset(path, blob);
            if (uploadResult.success) {
              result.pushed++;
              dequeue(path, 'push');
            } else {
              result.errors++;
              result.errorDetails.push(`Push falhou: ${path} — ${uploadResult.error}`);
            }
          }
        }
        // Config/manifest vão para o GitHub (tratado abaixo)
      } catch (e) {
        result.errors++;
        result.errorDetails.push(`Push erro: ${path} — ${/** @type {Error} */ (e).message}`);
      }
    }

    // 7. Processar pulls (remoto → local)
    const allPullPaths = [...diff.toPull, ...conflictPull];
    for (const path of allPullPaths) {
      const entry = remoteManifest.files[path];
      if (!entry) continue;

      try {
        if (entry.storage === 'supabase') {
          const downloadResult = await downloadAsset(path);
          if (downloadResult.success && downloadResult.blob) {
            // Cache via Cache API para acesso offline
            const cache = await caches.open('gabinete-sync-v1');
            const response = new Response(downloadResult.blob);
            await cache.put(new Request(path), response);

            // Atualiza manifesto local
            setEntry(localManifest, path, { ...entry });
            result.pulled++;
            dequeue(path, 'pull');
          } else {
            result.errors++;
            result.errorDetails.push(`Pull falhou: ${path} — ${downloadResult.error}`);
          }
        }
      } catch (e) {
        result.errors++;
        result.errorDetails.push(`Pull erro: ${path} — ${/** @type {Error} */ (e).message}`);
      }
    }

    // 8. Sync do config.json via GitHub
    const configSynced = await syncConfigViaGitHub(localManifest);
    if (!configSynced) {
      result.errors++;
      result.errorDetails.push('Falha ao sincronizar config.json com GitHub.');
    }

    // 9. Push do manifesto atualizado para GitHub
    const manifestJson = exportManifest(localManifest);
    const existingManifest = await githubGet('manifest.json');
    const manifestPushed = await githubPut(
      'manifest.json',
      manifestJson,
      `sync: atualiza manifesto (v${localManifest.version})`,
      existingManifest?.sha
    );
    if (!manifestPushed) {
      result.errors++;
      result.errorDetails.push('Falha ao enviar manifest.json para GitHub.');
    }

    // 10. Salva manifesto local
    saveManifestLocal(localManifest);

    // 11. Processa fila pendente
    await processQueue();

    result.success = result.errors === 0;
    setStatus(result.success ? 'synced' : 'error');
  } catch (e) {
    result.errors++;
    result.errorDetails.push(`Sync fatal: ${/** @type {Error} */ (e).message}`);
    setStatus('error');
  }

  return result;
}

/**
 * Sincroniza config.json via GitHub (bidirecional).
 * @param {import('./manifest.js').Manifest} localManifest
 * @returns {Promise<boolean>} — true se o sync foi bem-sucedido
 */
async function syncConfigViaGitHub(_localManifest) {
  const remoteConfig = await githubGet('assets/config.json');
  const localConfigRaw = localStorage.getItem('gabinete_kiosk_config');

  try {
    if (!remoteConfig && localConfigRaw) {
      // Só existe local → push
      backupConfig(localConfigRaw, 'local');
      const existing = await githubGet('assets/config.json');
      const ok = await githubPut('assets/config.json', localConfigRaw, 'sync: push config local', existing?.sha);
      return ok;
    } else if (remoteConfig && !localConfigRaw) {
      // Só existe remoto → pull
      backupConfig(remoteConfig.content, 'remote');
      localStorage.setItem('gabinete_kiosk_config', remoteConfig.content);
      try { notifyConfigUpdated(JSON.parse(remoteConfig.content)); } catch { /* ignore */ }
      return true;
    } else if (remoteConfig && localConfigRaw) {
      // Ambos existem — compara conteúdo real para detectar divergência
      let localObj, remoteObj;
      try { localObj = JSON.parse(localConfigRaw); } catch { return false; }
      try { remoteObj = JSON.parse(remoteConfig.content); } catch { return false; }

      const localTime = localObj._lastModified ? new Date(localObj._lastModified).getTime() : 0;
      const remoteTime = remoteObj._lastModified ? new Date(remoteObj._lastModified).getTime() : 0;
      const localCount = Array.isArray(localObj.objects) ? localObj.objects.length : 0;
      const remoteCount = Array.isArray(remoteObj.objects) ? remoteObj.objects.length : 0;

      // Remoto tem mais objetos, ou timestamp remoto mais novo → pull
      const remoteMaisNovo = remoteTime > localTime;
      const remoteMaisObjetos = remoteCount > localCount;

      if (remoteMaisNovo || remoteMaisObjetos) {
        console.log(`📥 Config remoto mais atual (${remoteCount} obj vs ${localCount} local) — pull`);
        backupConfig(localConfigRaw, 'local');
        localStorage.setItem('gabinete_kiosk_config', remoteConfig.content);
        try { notifyConfigUpdated(remoteObj); } catch { /* ignore */ }
        return true;
      } else {
        // Local mais recente ou igual → push para garantir sync
        console.log(`📤 Config local mais atual (${localCount} obj) — push`);
        backupConfig(remoteConfig.content, 'remote');
        const ok = await githubPut('assets/config.json', localConfigRaw, 'sync: config local mais recente', remoteConfig.sha);
        return ok;
      }
    }
    return true; // nada a fazer
  } catch (e) {
    console.warn('⚠️ syncConfigViaGitHub falhou:', e);
    return false;
  }
}

/**
 * Processa a fila de operações pendentes.
 * @returns {Promise<number>} Número de operações processadas
 */
async function processQueue() {
  const queue = loadQueue();
  if (queue.length === 0) return 0;

  let processed = 0;
  const MAX_RETRIES = 3;

  for (const op of queue) {
    if (op.retries >= MAX_RETRIES) {
      console.warn(`⚠️ Operação descartada após ${MAX_RETRIES} tentativas:`, op.path);
      dequeue(op.path, op.action);
      continue;
    }

    try {
      let success = false;

      if (op.action === 'push' && op.target === 'supabase') {
        const res = await fetch(op.path);
        if (res.ok) {
          const blob = await res.blob();
          const result = await uploadAsset(op.path, blob);
          success = result.success;
        }
      } else if (op.action === 'push' && op.target === 'github') {
        const res = await fetch(op.path);
        if (res.ok) {
          const content = await res.text();
          const existing = await githubGet(op.path);
          success = await githubPut(op.path, content, `sync: push ${op.path}`, existing?.sha);
        }
      } else if (op.action === 'delete' && op.target === 'supabase') {
        const { deleteAsset } = await import('./supabase-client.js');
        const result = await deleteAsset(op.path);
        success = result.success;
      }

      if (success) {
        dequeue(op.path, op.action);
        processed++;
      } else {
        op.retries++;
        saveQueue(loadQueue().map(q =>
          q.path === op.path && q.action === op.action ? { ...q, retries: op.retries } : q
        ));
      }
    } catch (e) {
      op.retries++;
      console.warn(`⚠️ Queue retry ${op.retries}/${MAX_RETRIES}:`, op.path, e);
    }
  }

  return processed;
}

// ─── Lifecycle ───────────────────────────────────────────────

/**
 * Inicia o sync engine com verificação periódica.
 */
export function startSync() {
  // Verifica status inicial
  checkConnectivity().then(online => {
    setStatus(online ? (loadQueue().length > 0 ? 'pending' : 'synced') : 'offline');
  });

  // Listeners de conectividade do browser
  window.addEventListener('online', () => {
    console.log('🌐 Conectado — iniciando sync...');
    sync();
  });

  window.addEventListener('offline', () => {
    console.log('📴 Desconectado');
    setStatus('offline');
  });

  // Sync periódico
  if (_intervalId) clearInterval(_intervalId);
  _intervalId = window.setInterval(() => {
    if (navigator.onLine) sync();
  }, SYNC_INTERVAL_MS);

  console.log('🔄 Sync Engine iniciado (intervalo: 5min)');
}

/**
 * Para o sync engine.
 */
export function stopSync() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
  console.log('⏹️ Sync Engine parado.');
}

/**
 * Força um sync manual imediato.
 * @returns {Promise<SyncResult>}
 */
export async function forceSync() {
  console.log('🔄 Sync manual iniciado...');
  const result = await sync();
  console.log('✅ Sync manual concluído:', result);
  return result;
}

/**
 * Retorna estatísticas da fila.
 * @returns {{ pending: number, status: SyncStatus }}
 */
export function getSyncStats() {
  return {
    pending: loadQueue().length,
    status: _status
  };
}
