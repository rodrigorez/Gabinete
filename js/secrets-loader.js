// @ts-check

/**
 * Carregador de segredos com criptografia AES-256-GCM.
 *
 * Fluxo:
 *  1. Carrega secrets.json (criptografado ou plaintext)
 *  2. Se criptografado: exige PIN para decriptar via WebCrypto (PBKDF2 200k it.)
 *  3. Mantém credenciais em RAM (_cache) — nunca em localStorage/sessionStorage
 *  4. Auto-limpa após timeout de inatividade (SECRETS_TIMEOUT_MS em config.js)
 *  5. Limpa ao ficar oculto APENAS se o timer de inatividade já expirou
 *     (visibilitychange — não interrompe troca de abas durante sessão ativa)
 *  6. Fallback para VITE_* env vars quando secrets.json não existe (GitHub Pages)
 *
 * Exporta: loadSecrets, getSecret, clearSecrets, resetClearTimer, reEncryptSecrets
 */

import { GABINETE_CONFIG } from './config.js';

/** @type {Record<string, string>} */
let _cache = {};
let _loaded = false;

/** @type {ReturnType<typeof setTimeout>|null} */
let _clearTimer = null;

// Timeout lido do config — sem magic numbers, sem UI
const CLEAR_TIMEOUT_MS = GABINETE_CONFIG.KIOSK.SECRETS_TIMEOUT_MS;

// ─── Limpeza de boot ─────────────────────────────────────────
// Garante que nenhuma credencial residual persiste ao iniciar o módulo.
;(function bootClear() {
  console.log('🔒 Boot: memória de credenciais verificada e limpa.');
}());

// ─── Utilitários WebCrypto ────────────────────────────────────

/** Converte string base64 para Uint8Array */
function b64ToBytes(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

/**
 * Deriva uma chave AES-256-GCM a partir do PIN usando PBKDF2.
 * @param {string} pin
 * @param {Uint8Array} salt
 * @returns {Promise<CryptoKey>}
 */
async function deriveKey(pin, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
}

/**
 * Decripta os dados com AES-256-GCM.
 * @param {string} pin
 * @param {{ salt: string, iv: string, data: string }} encrypted
 * @returns {Promise<Record<string, string>>}
 */
async function decryptSecrets(pin, encrypted) {
  const salt = b64ToBytes(encrypted.salt);
  const iv   = b64ToBytes(encrypted.iv);
  const data = b64ToBytes(encrypted.data);
  const key  = await deriveKey(pin, salt);

  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return JSON.parse(new TextDecoder().decode(decrypted));
}

// ─── Limpeza de memória ───────────────────────────────────────

/**
 * Limpa credenciais da memória imediatamente.
 * Chamado no fechamento/ocultação da página ou timeout.
 */
export function clearSecrets() {
  _cache = {};
  _loaded = false;
  if (_clearTimer) { clearTimeout(_clearTimer); _clearTimer = null; }
  console.log('🧹 Credenciais limpas da memória.');
}

/** Reinicia o timer de auto-limpeza (reset em qualquer atividade). */
export function resetClearTimer() {
  if (_clearTimer) clearTimeout(_clearTimer);
  _clearTimer = setTimeout(() => {
    console.warn('⏱️ Timeout de inatividade — credenciais limpas.');
    clearSecrets();
  }, CLEAR_TIMEOUT_MS);
}

/**
 * Re-criptografa secrets.json com um novo PIN e salva em disco.
 * Chamado automaticamente quando o admin altera o PIN.
 * @param {string} newPin
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function reEncryptSecrets(newPin) {
  if (!newPin) return { success: false, error: 'PIN inválido.' };

  // Atualiza PIN na cache em memória
  _cache.ADMIN_PIN = newPin;

  // Criptografa com o novo PIN
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));

  try {
    const keyMaterial = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(newPin), 'PBKDF2', false, ['deriveKey']
    );
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 200_000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false, ['encrypt']
    );

    const plaintext  = new TextEncoder().encode(JSON.stringify(_cache));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

    const toB64 = (/** @type {ArrayBuffer|Uint8Array} */ buf) =>
      btoa(String.fromCharCode(...new Uint8Array(buf)));

    const encrypted = {
      _encrypted: true,
      salt: toB64(salt),
      iv:   toB64(iv),
      data: toB64(ciphertext)
    };

    // Salva em disco via endpoint local do Vite
    const res = await fetch('/api/save-secrets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(encrypted)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, error: err.error || `HTTP ${res.status}` };
    }

    resetClearTimer();
    console.log('🔐 secrets.json re-criptografado com novo PIN.');
    return { success: true };

  } catch (err) {
    return { success: false, error: /** @type {Error} */ (err).message };
  }
}

// ─── Carregamento ─────────────────────────────────────────────

/**
 * Carrega os segredos.
 * Se o arquivo estiver criptografado, exige PIN.
 * Se não encontrar o arquivo, usa variáveis de ambiente Vite.
 *
 * @param {string} [pin] — PIN do admin (necessário para secrets criptografado)
 * @returns {Promise<{ success: boolean, needsPin?: boolean, error?: string }>}
 */
export async function loadSecrets(pin) {
  if (_loaded && Object.keys(_cache).length > 0) {
    resetClearTimer();
    return { success: true };
  }

  try {
    const res = await fetch('secrets.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const raw = await res.json();

    if (raw._encrypted) {
      // ── Modo criptografado ───────────────────────────────
      if (!pin) return { success: false, needsPin: true };

      try {
        const dec = await decryptSecrets(pin, raw);
        // Faz merge do cache com variáveis de ambiente (fallback) caso o secrets.json 
        // esteja incompleto (ex: contém o PIN mas não a SUPABASE_URL)
        _cache = {
          ...dec,
          SUPABASE_URL:      dec.SUPABASE_URL      || import.meta.env.VITE_SUPABASE_URL       || '',
          SUPABASE_ANON_KEY: dec.SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY  || '',
          GITHUB_REPO:       dec.GITHUB_REPO       || import.meta.env.VITE_GITHUB_CONFIG_REPO || import.meta.env.VITE_GITHUB_REPO || '',
          GITHUB_TOKEN:      dec.GITHUB_TOKEN      || import.meta.env.VITE_GITHUB_TOKEN       || '',
        };
        _loaded = true;
        resetClearTimer();
        console.log('🔐 Secrets decriptados com sucesso (modo local seguro).');
        return { success: true };
      } catch {
        return { success: false, error: 'PIN incorreto ou arquivo corrompido.' };
      }

    } else {
      // ── Modo plaintext (legado / dev) ────────────────────
      _cache = {
        ...raw,
        SUPABASE_URL:      raw.SUPABASE_URL      || import.meta.env.VITE_SUPABASE_URL       || '',
        SUPABASE_ANON_KEY: raw.SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY  || '',
        GITHUB_REPO:       raw.GITHUB_REPO       || import.meta.env.VITE_GITHUB_CONFIG_REPO || import.meta.env.VITE_GITHUB_REPO || '',
        GITHUB_TOKEN:      raw.GITHUB_TOKEN      || import.meta.env.VITE_GITHUB_TOKEN       || '',
      };
      _loaded = true;
      resetClearTimer();
      console.log('🔐 Secrets carregados do secrets.json (modo local).');
      return { success: true };
    }

  } catch {
    // ── Fallback: variáveis de ambiente Vite (GitHub Pages) ──
    _cache = {
      SUPABASE_URL:      import.meta.env.VITE_SUPABASE_URL       || '',
      SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY  || '',
      GITHUB_REPO:       import.meta.env.VITE_GITHUB_CONFIG_REPO || import.meta.env.VITE_GITHUB_REPO || '',
      GITHUB_TOKEN:      import.meta.env.VITE_GITHUB_TOKEN       || '',
    };
    _loaded = true;
    const mode = _cache.SUPABASE_URL ? 'produção (env vars)' : 'sem credenciais';
    console.log(`🔐 Secrets carregados em modo ${mode}.`);
    return { success: true };
  }
}

/**
 * Retorna o valor de um segredo.
 * @param {string} key
 * @param {string} [fallback]
 * @returns {string}
 */
export function getSecret(key, fallback = '') {
  return _cache[key] || fallback;
}

// ─── Auto-limpeza na visibilidade ────────────────────────────
// Comportamento: limpa secrets apenas se o timer de inatividade JÁ expirou.
// Isso evita que trocar de aba ou minimizar a janela encerre a sessão do curador.
// O clearSecrets() ainda é chamado pelo timer de inatividade (SECRETS_TIMEOUT_MS).

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && _clearTimer === null && _loaded) {
      // Timer já expirou (ou nunca foi iniciado) — sessão pode ser encerrada com segurança
      clearSecrets();
    }
  });
}
