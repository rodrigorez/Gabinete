// @ts-check

/**
 * Pipeline de Conversão de Imagens (Client-Side).
 * Converte imagens para WebP em duas variantes (_high e _low)
 * usando Canvas API — sem dependências externas.
 *
 * Fluxo:
 *   Input (JPG/PNG/BMP) → Canvas → WebP _high (original, q85%)
 *                                 → WebP _low  (512px, q60%)
 *                                 → SHA-256 de cada variante
 */

import { hashBlob } from './hash-engine.js';

/**
 * Limite máximo de upload para Supabase (50MB).
 * @type {number}
 */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * Configuração padrão do pipeline.
 * @typedef {Object} PipelineConfig
 * @property {number} highQuality — Qualidade WebP _high (0-1). Default: 0.85
 * @property {number} lowQuality — Qualidade WebP _low (0-1). Default: 0.60
 * @property {number} lowMaxDim — Dimensão máxima _low em pixels. Default: 512
 * @property {number} maxUploadBytes — Tamanho máximo em bytes. Default: 50MB
 */

/** @type {PipelineConfig} */
const DEFAULT_CONFIG = {
  highQuality: 0.85,
  lowQuality: 0.60,
  lowMaxDim: 512,
  maxUploadBytes: MAX_UPLOAD_BYTES
};

/**
 * @typedef {Object} ImageVariant
 * @property {Blob} blob — Blob WebP resultante
 * @property {string} sha256 — Hash SHA-256 do blob
 * @property {number} width — Largura em pixels
 * @property {number} height — Altura em pixels
 * @property {number} size — Tamanho em bytes
 * @property {'high'|'low'} variant — Tipo da variante
 */

/**
 * @typedef {Object} PipelineResult
 * @property {boolean} success
 * @property {ImageVariant} [high] — Variante alta qualidade
 * @property {ImageVariant} [low] — Variante baixa qualidade
 * @property {string} [error] — Mensagem de erro
 * @property {{ original: number, high: number, low: number, savings: string }} [stats] — Estatísticas
 */

/**
 * Carrega uma imagem a partir de um File/Blob no browser.
 * @param {Blob|File} source — Arquivo de imagem
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(source);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Falha ao carregar imagem.'));
    };

    img.src = url;
  });
}

/**
 * Renderiza uma imagem no Canvas com dimensões específicas e exporta como WebP.
 * @param {HTMLImageElement} img — Imagem carregada
 * @param {number} targetWidth — Largura alvo
 * @param {number} targetHeight — Altura alvo
 * @param {number} quality — Qualidade WebP (0-1)
 * @returns {Promise<Blob>}
 */
function renderToWebP(img, targetWidth, targetHeight, quality) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas 2D context não disponível.'));
      return;
    }

    // Bilinear filtering (default do canvas) — boa qualidade para downscale
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Falha ao converter para WebP.'));
      },
      'image/webp',
      quality
    );
  });
}

/**
 * Calcula dimensões mantendo aspect ratio com limite máximo.
 * @param {number} origWidth
 * @param {number} origHeight
 * @param {number} maxDim — Dimensão máxima (largura ou altura)
 * @returns {{ width: number, height: number }}
 */
function fitDimensions(origWidth, origHeight, maxDim) {
  if (origWidth <= maxDim && origHeight <= maxDim) {
    return { width: origWidth, height: origHeight };
  }

  const ratio = origWidth / origHeight;
  if (origWidth > origHeight) {
    return { width: maxDim, height: Math.round(maxDim / ratio) };
  } else {
    return { width: Math.round(maxDim * ratio), height: maxDim };
  }
}

/**
 * Processa uma imagem gerando ambas as variantes WebP (_high e _low).
 *
 * @param {File|Blob} source — Arquivo de imagem original (JPG, PNG, BMP, etc.)
 * @param {Partial<PipelineConfig>} [options] — Configuração opcional
 * @returns {Promise<PipelineResult>}
 *
 * @example
 * const input = document.querySelector('input[type=file]');
 * input.addEventListener('change', async (e) => {
 *   const file = e.target.files[0];
 *   const result = await processImage(file);
 *   if (result.success) {
 *     console.log('High:', result.high.size, 'bytes');
 *     console.log('Low:', result.low.size, 'bytes');
 *   }
 * });
 */
export async function processImage(source, options) {
  const config = { ...DEFAULT_CONFIG, ...options };

  // Validação de tamanho
  if (source.size > config.maxUploadBytes) {
    return {
      success: false,
      error: `Arquivo muito grande (${(source.size / 1024 / 1024).toFixed(1)}MB). Máximo: ${(config.maxUploadBytes / 1024 / 1024).toFixed(0)}MB.`
    };
  }

  try {
    const img = await loadImage(source);
    const origWidth = img.naturalWidth;
    const origHeight = img.naturalHeight;

    // --- Variante HIGH: resolução original, qualidade 85% ---
    const highBlob = await renderToWebP(img, origWidth, origHeight, config.highQuality);
    const highHash = await hashBlob(highBlob);

    /** @type {ImageVariant} */
    const high = {
      blob: highBlob,
      sha256: highHash,
      width: origWidth,
      height: origHeight,
      size: highBlob.size,
      variant: 'high'
    };

    // --- Variante LOW: redimensionada, qualidade 60% ---
    const { width: lowW, height: lowH } = fitDimensions(origWidth, origHeight, config.lowMaxDim);
    const lowBlob = await renderToWebP(img, lowW, lowH, config.lowQuality);
    const lowHash = await hashBlob(lowBlob);

    /** @type {ImageVariant} */
    const low = {
      blob: lowBlob,
      sha256: lowHash,
      width: lowW,
      height: lowH,
      size: lowBlob.size,
      variant: 'low'
    };

    // Estatísticas
    const totalOutput = highBlob.size + lowBlob.size;
    const savings = ((1 - totalOutput / source.size) * 100).toFixed(1);

    return {
      success: true,
      high,
      low,
      stats: {
        original: source.size,
        high: highBlob.size,
        low: lowBlob.size,
        savings: `${savings}%`
      }
    };
  } catch (err) {
    return {
      success: false,
      error: /** @type {Error} */ (err).message
    };
  }
}

/**
 * Processa múltiplas imagens em sequência.
 * @param {Array<{name: string, file: File|Blob}>} files
 * @param {Partial<PipelineConfig>} [options]
 * @param {function(number, number, string): void} [onProgress] — (current, total, filename)
 * @returns {Promise<Array<{name: string, result: PipelineResult}>>}
 */
export async function processMultipleImages(files, options, onProgress) {
  /** @type {Array<{name: string, result: PipelineResult}>} */
  const results = [];

  for (let i = 0; i < files.length; i++) {
    const { name, file } = files[i];
    if (onProgress) onProgress(i + 1, files.length, name);

    const result = await processImage(file, options);
    results.push({ name, result });
  }

  return results;
}

/**
 * Gera os nomes de arquivo para as variantes _high e _low.
 * @param {string} originalName — Nome original do arquivo (ex: '02_img_01.jpg')
 * @returns {{ high: string, low: string }}
 *
 * @example
 * generateVariantNames('02_img_01.jpg')
 * // → { high: '02_img_01_high.webp', low: '02_img_01_low.webp' }
 */
export function generateVariantNames(originalName) {
  // 1. Remove acentos e caracteres diacríticos
  const normalized = originalName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // 2. Remove a extensão do arquivo
  const baseName = normalized.replace(/\.[^.]+$/, '');
  // 3. Substitui qualquer caractere não alfanumérico por underscore e remove duplos
  const cleanBase = baseName.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
  
  return {
    high: `${cleanBase}_high.webp`,
    low: `${cleanBase}_low.webp`
  };
}

/**
 * Verifica se o browser suporta exportação WebP via Canvas.
 * @returns {boolean}
 */
export function isWebPSupported() {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL('image/webp').startsWith('data:image/webp');
}

/**
 * Retorna as configurações padrão do pipeline (para exibição na UI).
 * @returns {PipelineConfig}
 */
export function getDefaultConfig() {
  return { ...DEFAULT_CONFIG };
}
