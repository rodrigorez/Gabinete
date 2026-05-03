// @ts-check

/**
 * Cliente Supabase — Storage de assets grandes.
 * Gerencia upload/download de modelos, vídeos e imagens.
 *
 * Depende de secrets-loader.js para credenciais.
 */

import { getSecret } from './secrets-loader.js';

const BUCKET_NAME = 'gabinete-assets';

/** @type {string} */
let _supabaseUrl = '';
/** @type {string} */
let _supabaseKey = '';

/**
 * Inicializa o cliente Supabase com as credenciais do secrets.json.
 * Chamado após loadSecrets() no boot.
 * @returns {boolean} true se as credenciais estão configuradas
 */
export function initSupabase() {
  _supabaseUrl = getSecret('SUPABASE_URL');
  _supabaseKey = getSecret('SUPABASE_ANON_KEY');

  if (!_supabaseUrl || !_supabaseKey) {
    console.warn('⚠️ Supabase não configurado. Sync de assets desativado.');
    return false;
  }

  console.log('☁️ Supabase inicializado (escrita via Edge Functions):', _supabaseUrl);
  return true;
}

/**
 * Verifica se o Supabase está configurado e acessível.
 * @returns {boolean}
 */
export function isSupabaseReady() {
  return !!_supabaseUrl && !!_supabaseKey;
}

/**
 * Faz upload de um arquivo para o Supabase Storage.
 * @param {string} path — Caminho no bucket (ex: 'models/modeloV5.glb')
 * @param {Blob|File} file — Arquivo para upload
 * @param {string} [contentType] — MIME type (ex: 'model/gltf-binary')
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
export async function uploadAsset(path, file, contentType) {
  if (!isSupabaseReady()) return { success: false, error: 'Supabase não configurado' };

  try {
    // Cria File com o MIME correto para o FormData
    const blob = file instanceof File ? file
      : new File([file], path.split('/').pop() || 'asset', { type: contentType || 'application/octet-stream' });

    const form = new FormData();
    form.append('file', blob);

    // Não enviar Content-Type — browser define o boundary do multipart
    const res = await fetch(`${_supabaseUrl}/functions/v1/asset-manager?path=${encodeURIComponent(path)}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${_supabaseKey}`,
        'apikey': _supabaseKey,
      },
      body: form,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      return { success: false, error: err.error || `HTTP ${res.status}` };
    }

    const data = await res.json();
    return { success: true, url: data.url };
  } catch (err) {
    return { success: false, error: /** @type {Error} */ (err).message };
  }
}

/**
 * Faz download de um arquivo do Supabase Storage.
 * @param {string} path — Caminho no bucket
 * @returns {Promise<{success: boolean, blob?: Blob, error?: string}>}
 */
export async function downloadAsset(path) {
  if (!isSupabaseReady()) return { success: false, error: 'Supabase não configurado' };

  try {
    const res = await fetch(`${_supabaseUrl}/storage/v1/object/public/${BUCKET_NAME}/${path}`);
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` };

    const blob = await res.blob();
    return { success: true, blob };
  } catch (err) {
    return { success: false, error: /** @type {Error} */ (err).message };
  }
}

/**
 * Lista arquivos em um diretório do bucket.
 * @param {string} [prefix] — Prefixo/pasta (ex: 'models/')
 * @returns {Promise<{success: boolean, files?: Array<{name: string, size: number}>, error?: string}>}
 */
export async function listAssets(prefix = '') {
  if (!isSupabaseReady()) return { success: false, error: 'Supabase não configurado' };

  try {
    const res = await fetch(`${_supabaseUrl}/storage/v1/object/list/${BUCKET_NAME}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${_supabaseKey}`,
        'apikey': _supabaseKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prefix, limit: 1000 })
    });

    if (!res.ok) return { success: false, error: `HTTP ${res.status}` };

    const data = await res.json();
    const files = data.map((/** @type {any} */ f) => ({ name: f.name, size: f.metadata?.size || 0 }));
    return { success: true, files };
  } catch (err) {
    return { success: false, error: /** @type {Error} */ (err).message };
  }
}

/**
 * Deleta um arquivo do Supabase Storage.
 * @param {string} path — Caminho no bucket
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteAsset(path) {
  if (!isSupabaseReady()) return { success: false, error: 'Supabase não configurado' };

  try {
    const res = await fetch(`${_supabaseUrl}/functions/v1/asset-manager?path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${_supabaseKey}`,
        'apikey': _supabaseKey,
      },
    });

    if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
    return { success: true };
  } catch (err) {
    return { success: false, error: /** @type {Error} */ (err).message };
  }
}

/**
 * Retorna a URL pública de um asset.
 * @param {string} path — Caminho no bucket
 * @returns {string}
 */
export function getPublicUrl(path) {
  return `${_supabaseUrl}/storage/v1/object/public/${BUCKET_NAME}/${path}`;
}
