// @ts-check

/**
 * Motor de Hashing SHA-256 via Web Crypto API.
 * Calcula hashes de arquivos e strings para integridade e sync.
 *
 * Fallback: FNV-1a (32-bit) para browsers sem Web Crypto API.
 */

/**
 * Calcula o hash SHA-256 de um ArrayBuffer.
 * @param {ArrayBuffer} buffer — Dados binários do arquivo
 * @returns {Promise<string>} Hash hexadecimal (64 caracteres)
 */
export async function hashBuffer(buffer) {
  if (crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return bufferToHex(digest);
  }
  // Fallback: FNV-1a (32-bit) — menos seguro mas funcional
  return fnv1aFallback(new Uint8Array(buffer));
}

/**
 * Calcula o hash SHA-256 de um Blob/File.
 * @param {Blob|File} blob — Arquivo ou blob
 * @returns {Promise<string>} Hash hexadecimal
 */
export async function hashBlob(blob) {
  const buffer = await blob.arrayBuffer();
  return hashBuffer(buffer);
}

/**
 * Calcula o hash SHA-256 de uma string UTF-8.
 * @param {string} text — Texto para hash
 * @returns {Promise<string>} Hash hexadecimal
 */
export async function hashString(text) {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(text).buffer;
  return hashBuffer(buffer);
}

/**
 * Calcula hashes de múltiplos arquivos em paralelo.
 * Retorna um mapa { caminho: hash }.
 * @param {Array<{path: string, blob: Blob}>} files — Lista de arquivos
 * @param {function(number, number): void} [onProgress] — Callback de progresso (current, total)
 * @returns {Promise<Record<string, string>>} Mapa caminho → hash
 */
export async function hashMultiple(files, onProgress) {
  /** @type {Record<string, string>} */
  const results = {};
  let completed = 0;

  // Processa em lotes de 4 para não sobrecarregar
  const BATCH_SIZE = 4;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (f) => {
      const hash = await hashBlob(f.blob);
      results[f.path] = hash;
      completed++;
      if (onProgress) onProgress(completed, files.length);
    });
    await Promise.all(promises);
  }

  return results;
}

/**
 * Converte um ArrayBuffer em string hexadecimal.
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function bufferToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Fallback: FNV-1a 32-bit hash.
 * Usado apenas se Web Crypto API não estiver disponível.
 * @param {Uint8Array} data
 * @returns {string} Hash hex (8 caracteres) com prefixo 'fnv1a_'
 */
function fnv1aFallback(data) {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < data.length; i++) {
    hash ^= data[i];
    hash = (hash * 0x01000193) >>> 0; // FNV prime, force unsigned
  }
  return 'fnv1a_' + hash.toString(16).padStart(8, '0');
}
