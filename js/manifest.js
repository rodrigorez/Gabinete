// @ts-check

/**
 * Gerenciador de Manifesto de Hashes.
 * CRUD completo para rastrear integridade e sincronização de assets.
 *
 * O manifesto é a fonte de verdade para o Sync Engine:
 * - Cada arquivo tem seu SHA-256, tamanho, timestamp e storage provider
 * - Imagens possuem metadados de variantes (_low / _high) com par linkado
 */

import { hashBlob } from './hash-engine.js';

/** @type {string} */
const MANIFEST_KEY = 'gabinete_manifest_v1';

/** @type {string} */
const MANIFEST_FILE = 'assets/manifest.json';

/**
 * @typedef {Object} ManifestEntry
 * @property {string} sha256 — Hash SHA-256 do arquivo
 * @property {number} size — Tamanho em bytes
 * @property {string} modified — ISO timestamp da última modificação
 * @property {'local'|'supabase'|'github'} [storage] — Onde o arquivo está armazenado
 * @property {'low'|'high'} [variant] — Variante de imagem
 * @property {string} [pair] — Caminho do par _low/_high correspondente
 */

/**
 * @typedef {Object} Manifest
 * @property {number} version — Número incremental de versão
 * @property {string} timestamp — ISO timestamp da última atualização
 * @property {string} device_id — Identificador do dispositivo
 * @property {Record<string, ManifestEntry>} files — Mapa de arquivos
 */

/**
 * Cria um manifesto vazio.
 * @param {string} [deviceId]
 * @returns {Manifest}
 */
export function createEmptyManifest(deviceId = 'default') {
  return {
    version: 1,
    timestamp: new Date().toISOString(),
    device_id: deviceId,
    files: {}
  };
}

/**
 * Carrega o manifesto — prioriza LocalStorage, depois tenta arquivo estático.
 * @returns {Promise<Manifest>}
 */
export async function loadManifest() {
  // 1. Tenta LocalStorage (mais recente, editado localmente)
  const cached = localStorage.getItem(MANIFEST_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      console.warn('⚠️ Manifesto no LocalStorage corrompido. Tentando arquivo estático.');
    }
  }

  // 2. Tenta arquivo estático
  try {
    const res = await fetch(MANIFEST_FILE);
    if (res.ok) {
      const manifest = await res.json();
      saveManifestLocal(manifest);
      return manifest;
    }
  } catch {
    console.warn('⚠️ manifest.json não encontrado. Criando novo.');
  }

  // 3. Manifesto novo
  const fresh = createEmptyManifest();
  saveManifestLocal(fresh);
  return fresh;
}

/**
 * Salva o manifesto no LocalStorage.
 * @param {Manifest} manifest
 */
export function saveManifestLocal(manifest) {
  manifest.timestamp = new Date().toISOString();
  localStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest));
}

/**
 * Adiciona ou atualiza uma entrada no manifesto.
 * @param {Manifest} manifest
 * @param {string} path — Caminho relativo do arquivo (ex: 'assets/images/02_img_01_high.webp')
 * @param {ManifestEntry} entry
 * @returns {Manifest} Manifesto atualizado (mutado in-place)
 */
export function setEntry(manifest, path, entry) {
  manifest.files[path] = entry;
  manifest.version++;
  manifest.timestamp = new Date().toISOString();
  return manifest;
}

/**
 * Remove uma entrada do manifesto.
 * @param {Manifest} manifest
 * @param {string} path
 * @returns {Manifest}
 */
export function removeEntry(manifest, path) {
  delete manifest.files[path];
  manifest.version++;
  manifest.timestamp = new Date().toISOString();
  return manifest;
}

/**
 * Obtém uma entrada do manifesto.
 * @param {Manifest} manifest
 * @param {string} path
 * @returns {ManifestEntry|undefined}
 */
export function getEntry(manifest, path) {
  return manifest.files[path];
}

/**
 * Detecta variantes de imagem e vincula pares _low/_high automaticamente.
 * @param {string} path — Caminho do arquivo
 * @returns {{ variant?: 'low'|'high', pair?: string }}
 */
export function detectVariant(path) {
  const lowMatch = path.match(/^(.+)_low\.(\w+)$/);
  if (lowMatch) {
    return { variant: 'low', pair: `${lowMatch[1]}_high.${lowMatch[2]}` };
  }
  const highMatch = path.match(/^(.+)_high\.(\w+)$/);
  if (highMatch) {
    return { variant: 'high', pair: `${highMatch[1]}_low.${highMatch[2]}` };
  }
  return {};
}

/**
 * Compara dois manifestos e retorna as diferenças.
 * @param {Manifest} local
 * @param {Manifest} remote
 * @returns {{ toPush: string[], toPull: string[], conflicts: string[], synced: string[] }}
 */
export function diffManifests(local, remote) {
  /** @type {string[]} */
  const toPush = [];  // Existe só localmente → Upload
  /** @type {string[]} */
  const toPull = [];  // Existe só remotamente → Download
  /** @type {string[]} */
  const conflicts = []; // Existe em ambos com hash diferente
  /** @type {string[]} */
  const synced = [];  // Existe em ambos com hash igual

  const allPaths = new Set([
    ...Object.keys(local.files),
    ...Object.keys(remote.files)
  ]);

  for (const path of allPaths) {
    const localEntry = local.files[path];
    const remoteEntry = remote.files[path];

    if (localEntry && !remoteEntry) {
      toPush.push(path);
    } else if (!localEntry && remoteEntry) {
      toPull.push(path);
    } else if (localEntry && remoteEntry) {
      if (localEntry.sha256 === remoteEntry.sha256) {
        synced.push(path);
      } else {
        conflicts.push(path);
      }
    }
  }

  return { toPush, toPull, conflicts, synced };
}

/**
 * Resolve conflitos usando estratégia "timestamp mais recente vence".
 * @param {Manifest} local
 * @param {Manifest} remote
 * @param {string[]} conflictPaths
 * @returns {{ pushPaths: string[], pullPaths: string[] }}
 */
export function resolveConflicts(local, remote, conflictPaths) {
  /** @type {string[]} */
  const pushPaths = [];
  /** @type {string[]} */
  const pullPaths = [];

  for (const path of conflictPaths) {
    const localTime = new Date(local.files[path].modified).getTime();
    const remoteTime = new Date(remote.files[path].modified).getTime();

    if (localTime >= remoteTime) {
      pushPaths.push(path); // Local é mais novo → push
    } else {
      pullPaths.push(path); // Remoto é mais novo → pull
    }
  }

  return { pushPaths, pullPaths };
}

/**
 * Cria uma entrada de manifesto a partir de um Blob/File.
 * Calcula hash automaticamente e detecta variante.
 * @param {string} path
 * @param {Blob|File} blob
 * @param {'local'|'supabase'|'github'} [storage]
 * @returns {Promise<ManifestEntry>}
 */
export async function createEntryFromBlob(path, blob, storage = 'local') {
  const sha256 = await hashBlob(blob);
  const { variant, pair } = detectVariant(path);

  /** @type {ManifestEntry} */
  const entry = {
    sha256,
    size: blob.size,
    modified: new Date().toISOString(),
    storage
  };

  if (variant) entry.variant = variant;
  if (pair) entry.pair = pair;

  return entry;
}

/**
 * Exporta o manifesto como string JSON formatada.
 * @param {Manifest} manifest
 * @returns {string}
 */
export function exportManifest(manifest) {
  return JSON.stringify(manifest, null, 2);
}
