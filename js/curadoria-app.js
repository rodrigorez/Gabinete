// @ts-nocheck

/**
 * Curadoria App — Interface de gestão de obras do Gabinete Virtual.
 *
 * Responsabilidades:
 *  - Autenticação via overlay de PIN inline (AES-256-GCM, rate-limited)
 *  - CRUD de obras no config.json (via localStorage + GitHub sync)
 *  - Upload de imagens (→ WebP via image-pipeline → Supabase Storage)
 *  - Upload de modelos 3D GLB (→ Supabase Storage)
 *  - Upload de vídeos (→ Supabase Storage)
 *  - Auditoria de integridade de assets (HEAD requests)
 *  - Detecção e remoção de obras órfãs
 *
 * Dependências: secrets-loader, image-pipeline, manifest, sync-engine, supabase-client
 */

import { showPinOverlay } from './pin-overlay.js';

/** Chave de erros de asset — sincronizada com main.js */
const ASSET_ERROR_KEY = 'gabinete_asset_errors_v1';
import { processImage, generateVariantNames, isWebPSupported } from './image-pipeline.js';
import { loadManifest, saveManifestLocal, setEntry, createEntryFromBlob } from './manifest.js';
import { startSync, forceSync, onStatusChange, enqueue } from './sync-engine.js';
import { initSupabase, uploadAsset, isSupabaseReady } from './supabase-client.js';
import { stampConfig } from './config.js';

// ─── State ───────────────────────────────────────────────────

/** @type {GabineteConfig|null} */
let config = null;
/** @type {number} */
let selectedIndex = -1;
/** @type {Array<{name: string, blob: Blob, gallery: 'gal_a'|'gal_b'}>} */
let pendingImages = [];
/** @type {File|null} */
let pendingModel = null;
/** @type {File|null} */
let pendingVideo = null;

// ─── Boot ────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // showPinOverlay verifica o cache e exibe o overlay se necessário.
  // Resolve apenas quando o PIN está correto (rate-limiting via GABINETE_CONFIG).
  await showPinOverlay({ title: 'Curadoria' });

  // ── 4-B: Banner de erros de GLB ───────────────────────────────────
  // Verifica se o kiosk registrou falhas de modelos 3D desde a última visita.
  const assetErrors = JSON.parse(localStorage.getItem(ASSET_ERROR_KEY) || '[]');
  if (assetErrors.length > 0) {
    const banner = document.createElement('div');
    banner.style.cssText = [
      'position:fixed;top:0;left:0;right:0;z-index:9999;',
      'background:#7c2d12;color:#fef3c7;padding:12px 20px;',
      'font-family:Inter,sans-serif;font-size:13px;',
      'display:flex;align-items:center;justify-content:space-between;gap:12px;',
    ].join('');

    const latest = assetErrors.slice(0, 3).map(e => `<code>${e.id}</code>`).join(', ');
    const more   = assetErrors.length > 3 ? ` (+${assetErrors.length - 3} mais)` : '';

    banner.innerHTML = `
      <span>
        ⚠️ <strong>${assetErrors.length} modelo(s) com falha no kiosk:</strong>
        ${latest}${more}
        — Verifique os arquivos GLB na curadoria.
      </span>
      <button id="asset-err-dismiss"
        style="background:#fef3c7;color:#7c2d12;border:none;border-radius:6px;padding:4px 12px;cursor:pointer;font-weight:600;white-space:nowrap;">
        Descartar
      </button>
    `;
    document.body.prepend(banner);

    const dismissBtn = document.getElementById('asset-err-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        banner.remove();
        localStorage.removeItem(ASSET_ERROR_KEY); // limpa após o curador ver
      });
    }
  }

  initSupabase();
  loadConfig();
  renderGrid();
  bindEvents();
  startSync();

  onStatusChange((status) => {
    const el = document.getElementById('sync-status-indicator');
    if (!el) return;
    const map = { synced: '🟢 Sincronizado', pending: '🟡 Pendente', offline: '🔴 Offline', syncing: '🔄 Sincronizando...', error: '❌ Erro' };
    el.textContent = map[status] || '🔴 Offline';
  });

  if (!isWebPSupported()) {
    showToast('⚠️ Seu navegador não suporta WebP. Imagens não serão convertidas.', 'error');
  }
});

// ─── Config CRUD ─────────────────────────────────────────────

function loadConfig() {
  const stored = localStorage.getItem('gabinete_kiosk_config');
  if (stored) {
    config = JSON.parse(stored);
  } else {
    fetch('assets/config.json')
      .then(r => r.json())
      .then(data => { config = data; saveConfig(); renderGrid(); })
      .catch(() => {
        config = { version: '1.0.0', settings: { kioskTimeoutMs: 300000, env: { sky: '', exposure: 1 } }, objects: [] };
        saveConfig();
      });
  }
}

function saveConfig() {
  if (!config) return;
  // @ts-ignore
  stampConfig(config);
  localStorage.setItem('gabinete_kiosk_config', JSON.stringify(config));
  enqueue({ action: 'push', path: 'assets/config.json', target: 'github', timestamp: Date.now(), retries: 0 });
}

// ─── Render Grid ─────────────────────────────────────────────

function renderGrid() {
  const grid = document.getElementById('obras-grid');
  if (!grid || !config) return;

  if (config.objects.length === 0) {
    grid.innerHTML = '<p style="color:var(--text-dim);grid-column:1/-1;text-align:center;padding:40px;">Nenhuma obra cadastrada. Clique em "＋ Nova Obra" para começar.</p>';
    return;
  }

  grid.innerHTML = config.objects.map((obj, i) => {
    const thumbSrc  = obj.panel?.galleries?.[0]?.images?.[0] || '';
    const thumbHtml = thumbSrc ? `<img src="${thumbSrc}" alt="${obj.name_key || obj.id}">` : '📦';
    const childCount = obj.children?.length || 0;
    const hasVideo   = obj.panel?.video?.src ? '🎬' : '';
    const galCount   = obj.panel?.galleries?.reduce((sum, g) => sum + g.images.length, 0) || 0;

    // ── Detecção de obra vazia (sem modelo E sem imagens) ──────────────
    const hasModel  = !!(obj.model && obj.model.trim() !== '');
    const hasImages = galCount > 0;
    const isEmpty   = !hasModel && !hasImages;
    const badgeHtml = isEmpty
      ? '<span class="badge badge-warn" title="Obra sem modelo e sem imagens — pode estar orphan">⚠️</span>'
      : '<span class="badge badge-synced">✓</span>';

    return `
      <div class="obra-card ${i === selectedIndex ? 'active' : ''} ${isEmpty ? 'obra-empty' : ''}" data-index="${i}" data-search="${(obj.id + ' ' + (obj.name_key||'') + ' ' + (obj.panel?.description_key||'')).toLowerCase()}">
        ${badgeHtml}
        <div class="thumb">${thumbHtml}</div>
        <h3>${obj.name_key || obj.id}</h3>
        <div class="meta">${hasVideo} 🖼️${galCount} 🚪${childCount} · ${obj.position || '0 0 0'}</div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.obra-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(/** @type {HTMLElement} */ (card).dataset.index || '-1');
      selectObra(idx);
    });
  });

  applySearchFilter();
}

function applySearchFilter() {
  const searchInput = /** @type {HTMLInputElement} */ (document.getElementById('search-obra'));
  if (!searchInput) return;
  const term = searchInput.value.toLowerCase();
  
  document.querySelectorAll('.obra-card').forEach(card => {
    const el = /** @type {HTMLElement} */ (card);
    if (term.length >= 3) {
      const searchData = el.dataset.search || '';
      el.style.display = searchData.includes(term) ? 'flex' : 'none';
    } else {
      el.style.display = 'flex';
    }
  });
}

// ─── Select / Edit ───────────────────────────────────────────

function selectObra(index) {
  if (!config || index < 0 || index >= config.objects.length) return;
  selectedIndex = index;
  const obj = config.objects[index];

  /** @type {HTMLElement|null} */ (document.getElementById('editor-empty'))?.style.setProperty('display', 'none');
  /** @type {HTMLElement|null} */ (document.getElementById('editor-form'))?.style.setProperty('display', 'block');

  const setVal = (/** @type {string} */ id, /** @type {string} */ val) => {
    const el = /** @type {HTMLInputElement|null} */ (document.getElementById(id));
    if (el) el.value = val;
  };

  setVal('field-id', obj.id);
  setVal('field-name', obj.name_key || '');
  setVal('field-desc', obj.panel?.description_key || '');

  // Position
  const pos = (obj.position || '0 0 0').split(' ');
  setVal('pos-x', pos[0] || '0'); setVal('pos-y', pos[1] || '0'); setVal('pos-z', pos[2] || '0');

  // Rotation
  const rot = (obj.rotation || '0 0 0').split(' ');
  setVal('rot-x', rot[0] || '0'); setVal('rot-y', rot[1] || '0'); setVal('rot-z', rot[2] || '0');

  // Scale
  const sca = (obj.scale || '1 1 1').split(' ');
  setVal('sca-x', sca[0] || '1'); setVal('sca-y', sca[1] || '1'); setVal('sca-z', sca[2] || '1');

  // Model
  const modelName = document.getElementById('model-filename');
  if (modelName) modelName.textContent = obj.model || '';

  // Video
  const videoName = document.getElementById('video-filename');
  if (videoName) videoName.textContent = obj.panel?.video?.src || '';

  // Timing
  setVal('timing-door', String(obj.timing?.doorDur || 1250));
  setVal('timing-fade', String(obj.timing?.fadeDur || 1000));

  const isInteractive = obj.isInteractive !== false;
  /** @type {HTMLInputElement|null} */ (document.getElementById('field-interactive'))?.setAttribute('checked', isInteractive ? 'true' : 'false');
  const checkbox = /** @type {HTMLInputElement|null} */ (document.getElementById('field-interactive'));
  if (checkbox) checkbox.checked = isInteractive;
  toggleInteractiveContent(isInteractive);

  // Gallery thumbs
  renderGalleryThumbs(obj, 'gal_a', 'gallery-thumbs-a');
  renderGalleryThumbs(obj, 'gal_b', 'gallery-thumbs-b');
  
  renderGrid();

  const title = document.getElementById('editor-title');
  if (title) title.textContent = `Editando: ${obj.name_key || obj.id}`;
}

function toggleInteractiveContent(show) {
  const cont = document.getElementById('interactive-content');
  if (cont) cont.style.display = show ? 'block' : 'none';
  document.querySelectorAll('.interactive-only').forEach(el => {
    /** @type {HTMLElement} */ (el).style.display = show ? 'block' : 'none';
  });
}

function renderGalleryThumbs(/** @type {GabineteObject} */ obj, /** @type {string} */ galId, /** @type {string} */ containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const gal = obj.panel?.galleries?.find(g => g.id === galId);
  const images = gal?.images || [];
  container.innerHTML = images.map((src, i) =>
    `<div class="gthumb" style="position:relative;">
      <img src="${src}" style="width:60px;height:60px;border-radius:6px;object-fit:cover;">
      <button class="remove-img" data-img-index="${i}" data-gal-id="${galId}" title="Remover">×</button>
    </div>`
  ).join('');

  container.querySelectorAll('.remove-img').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const imgIdx = parseInt(/** @type {HTMLElement} */ (btn).dataset.imgIndex || '0');
      removeImage(imgIdx, galId);
    });
  });
}

// ─── Save Obra ───────────────────────────────────────────────

async function saveObra() {
  if (!config || selectedIndex < 0) return;
  const obj = config.objects[selectedIndex];

  const getVal = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ (document.getElementById(id))?.value || '';

  obj.id = getVal('field-id');
  obj.name_key = getVal('field-name');
  obj.isInteractive = /** @type {HTMLInputElement} */ (document.getElementById('field-interactive'))?.checked ?? true;
  obj.position = `${getVal('pos-x')||'0'} ${getVal('pos-y')||'0'} ${getVal('pos-z')||'0'}`;
  obj.rotation = `${getVal('rot-x')||'0'} ${getVal('rot-y')||'0'} ${getVal('rot-z')||'0'}`;
  obj.scale = `${getVal('sca-x')||'1'} ${getVal('sca-y')||'1'} ${getVal('sca-z')||'1'}`;

  if (!obj.panel) obj.panel = { title_key: '' };
  obj.panel.title_key = getVal('field-name');
  obj.panel.description_key = getVal('field-desc');

  if (!obj.timing) obj.timing = { doorDur: 1250, fadeDur: 1000, waitOpen: 0, waitClose: 0 };
  obj.timing.doorDur = parseInt(getVal('timing-door')) || 1250;
  obj.timing.fadeDur = parseInt(getVal('timing-fade')) || 1000;

  if (pendingImages.length > 0) {
    showToast('🔄 Convertendo e enviando imagens...', 'success');
    if (!obj.panel.galleries) obj.panel.galleries = [];
    if (!obj.panel.galleries.find(g => g.id === 'gal_a')) obj.panel.galleries.push({ id: 'gal_a', images: [] });
    if (!obj.panel.galleries.find(g => g.id === 'gal_b')) obj.panel.galleries.push({ id: 'gal_b', images: [] });

    const manifest = await loadManifest();
    const supOk = isSupabaseReady();
    let uploadErrors = 0;

    // Helper para gravar o binário no disco via server Vite
    const saveBlobToDisk = async (blob, path) => {
      try {
        await fetch(`/api/save-asset?path=${encodeURIComponent(path)}`, { method: 'POST', body: blob });
        console.log(`💾 Escrito no disco local: ${path}`);
      } catch(e) { console.error('Erro ao gravar fisicamente local:', e); }
    };

    for (const imgData of pendingImages) {
      const result = await processImage(imgData.blob);
      if (!result.success || !result.high || !result.low) continue;

      const names = generateVariantNames(imgData.name);
      const supPath = `images/${names.high}`; // caminho no bucket Supabase
      
      const targetGallery = obj.panel.galleries.find(g => g.id === imgData.gallery);
      if (!targetGallery) continue;

      const localPathHigh = `assets/images/${names.high}`;
      const localPathLow = `assets/images/${names.low}`;

      if (supOk) {
        const up = await uploadAsset(supPath, result.high.blob, 'image/webp');
        if (up.success && up.url) {
          targetGallery.images.push(up.url);
          console.log('☁️ Imagem enviada:', up.url);
        } else {
          uploadErrors++;
          console.warn('⚠️ Falha no upload:', up.error);
          targetGallery.images.push(localPathHigh);
          await saveBlobToDisk(result.high.blob, localPathHigh);
          await saveBlobToDisk(result.low.blob, localPathLow);
        }
      } else {
        console.warn('⚠️ Supabase não disponível, salvando no disco local.');
        targetGallery.images.push(localPathHigh);
        await saveBlobToDisk(result.high.blob, localPathHigh);
        await saveBlobToDisk(result.low.blob, localPathLow);
      }

      // Mantém manifesto local atualizado
      const highEntry = await createEntryFromBlob(localPathHigh, result.high.blob, 'local');
      setEntry(manifest, localPathHigh, highEntry);
    }

    saveManifestLocal(manifest);
    pendingImages = [];

    if (uploadErrors > 0) {
      showToast(`⚠️ ${uploadErrors} imagem(ns) com falha no upload. Verifique o Supabase.`, 'error');
    }
  }

  // ─── Upload do modelo 3D (GLB) ───────────────────────────────
  if (pendingModel) {
    showToast('🔄 Enviando modelo 3D...', 'success');
    const supPath = `models/${pendingModel.name}`;
    const localModelPath = `assets/models/${pendingModel.name}`;

    const saveBlobToDisk = async (blob, path) => {
      try { await fetch(`/api/save-asset?path=${encodeURIComponent(path)}`, { method: 'POST', body: blob }); } catch(e) {}
    };

    if (isSupabaseReady()) {
      const up = await uploadAsset(supPath, pendingModel, 'model/gltf-binary');
      if (up.success && up.url) {
        obj.model = up.url; // URL pública do Supabase
        console.log('☁️ Modelo 3D enviado:', up.url);
      } else {
        console.warn('⚠️ Falha no upload do modelo:', up.error);
        showToast(`⚠️ Falha no upload do modelo: ${up.error}`, 'error');
        obj.model = localModelPath; // fallback local
        await saveBlobToDisk(pendingModel, localModelPath);
      }
    } else {
      console.warn('⚠️ Supabase não disponível, modelo salvo no disco local.');
      obj.model = localModelPath;
      await saveBlobToDisk(pendingModel, localModelPath);
    }

    pendingModel = null;
  }

  // ─── Upload do vídeo ──────────────────────────────────────
  if (pendingVideo) {
    showToast('🔄 Enviando vídeo...', 'success');
    const supPath = `videos/${pendingVideo.name}`;
    const localVideoPath = `assets/videos/${pendingVideo.name}`;
    const mime = pendingVideo.type || 'video/mp4';

    const saveBlobToDisk = async (blob, path) => {
      try { await fetch(`/api/save-asset?path=${encodeURIComponent(path)}`, { method: 'POST', body: blob }); } catch(e) {}
    };

    if (isSupabaseReady()) {
      const up = await uploadAsset(supPath, pendingVideo, mime);
      if (up.success && up.url) {
        if (!obj.panel) obj.panel = { title_key: '' };
        obj.panel.video = { src: up.url }; // URL pública do Supabase
        console.log('☁️ Vídeo enviado:', up.url);
      } else {
        console.warn('⚠️ Falha no upload do vídeo:', up.error);
        showToast(`⚠️ Falha no upload do vídeo: ${up.error}`, 'error');
        if (!obj.panel) obj.panel = { title_key: '' };
        obj.panel.video = { src: localVideoPath };
        await saveBlobToDisk(pendingVideo, localVideoPath);
      }
    } else {
      console.warn('⚠️ Supabase não disponível, vídeo salvo no disco local.');
      if (!obj.panel) obj.panel = { title_key: '' };
      obj.panel.video = { src: localVideoPath };
      await saveBlobToDisk(pendingVideo, localVideoPath);
    }

    pendingVideo = null;
  }

  saveConfig();
  renderGrid();
  selectObra(selectedIndex);
  showToast('✅ Obra salva com sucesso!', 'success');
}

// ─── New Obra ────────────────────────────────────────────────

function createNewObra() {
  if (!config) return;
  const id = `obra_${Date.now().toString(36)}`;
  /** @type {GabineteObject} */
  const newObj = {
    id,
    name_key: 'Nova Obra',
    type: 'gltf-model',
    model: '',
    position: '0 0 0',
    rotation: '0 0 0',
    scale: '1 1 1',
    timing: { doorDur: 1250, fadeDur: 1000, waitOpen: 0, waitClose: 0 },
    panel: { title_key: 'Nova Obra', description_key: '', galleries: [{ id: 'gal_a', images: [] }] },
    children: []
  };
  config.objects.push(newObj);
  saveConfig();
  renderGrid();
  selectObra(config.objects.length - 1);
  showToast('📦 Nova obra criada!', 'success');
}

// ─── Delete Obra ─────────────────────────────────────────────

function deleteObra() {
  if (!config || selectedIndex < 0) return;
  const obj = config.objects[selectedIndex];
  if (!confirm(`Tem certeza que deseja deletar "${obj.name_key || obj.id}"?`)) return;

  config.objects.splice(selectedIndex, 1);
  selectedIndex = -1;
  saveConfig();
  renderGrid();
  /** @type {HTMLElement|null} */ (document.getElementById('editor-form'))?.style.setProperty('display', 'none');
  /** @type {HTMLElement|null} */ (document.getElementById('editor-empty'))?.style.setProperty('display', 'flex');
  showToast('🗑️ Obra removida.', 'error');
}

// ─── Auditoria de Integridade ─────────────────────────────────

/**
 * Verifica se cada asset referenciado nas obras está acessível.
 * Faz fetch HEAD em cada URL e marca obras com arquivos quebrados (404/erro).
 * Também marca obras completamente vazias (sem modelo + sem imagens).
 */
async function auditAssets() {
  if (!config) return;

  const grid = document.getElementById('obras-grid');
  showToast('🔍 Verificando assets...', 'success');

  /** @param {string} url */
  const isAccessible = async (url) => {
    if (!url || url.trim() === '') return false;
    try {
      const res = await fetch(url, { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  };

  let broken = 0;

  for (let i = 0; i < config.objects.length; i++) {
    const obj = config.objects[i];
    const card = grid?.querySelector(`[data-index="${i}"]`);
    if (!card) continue;

    /** @type {string[]} */
    const refs = [];
    if (obj.model) refs.push(obj.model);
    if (obj.panel?.video?.src) refs.push(obj.panel.video.src);
    obj.panel?.galleries?.forEach(g => g.images.forEach(img => refs.push(img)));

    if (refs.length === 0) {
      // Obra totalmente vazia — já marcada como ⚠️ pelo renderGrid
      card.classList.add('obra-broken');
      broken++;
      continue;
    }

    const results = await Promise.all(refs.map(isAccessible));
    const hasBroken = results.some(ok => !ok);

    if (hasBroken) {
      card.classList.add('obra-broken');
      broken++;
      card.setAttribute('title', `⚠️ ${results.filter(ok => !ok).length} arquivo(s) inacessível(is)`);
    } else {
      card.classList.remove('obra-broken');
      card.classList.remove('obra-empty');
      // Atualiza badge para ✓
      const badge = card.querySelector('.badge');
      if (badge) { badge.textContent = '✓'; badge.className = 'badge badge-synced'; }
    }
  }

  const msg = broken === 0
    ? '✅ Todos os assets estão acessíveis!'
    : `⚠️ ${broken} obra(s) com problemas. Clique em "Remover Órfãos" para limpar.`;
  showToast(msg, broken === 0 ? 'success' : 'error');

  // Mostra botão de remoção se houver órfãos
  const btnRemove = document.getElementById('btn-remove-orphans');
  if (btnRemove) btnRemove.style.display = broken > 0 ? 'inline-flex' : 'none';
}

/**
 * Remove do config todas as obras marcadas como quebradas (obra-broken)
 * que também sejam obras vazias (sem model e sem imagens).
 */
function removeOrphans() {
  if (!config) return;

  const grid = document.getElementById('obras-grid');
  const brokenIndexes = /** @type {number[]} */ ([]);

  config.objects.forEach((obj, i) => {
    const card = grid?.querySelector(`[data-index="${i}"]`);
    if (card?.classList.contains('obra-broken')) {
      brokenIndexes.push(i);
    }
  });

  if (brokenIndexes.length === 0) {
    showToast('Nenhum órfão encontrado. Execute "Verificar Assets" primeiro.', 'error');
    return;
  }

  if (!confirm(`Remover ${brokenIndexes.length} obra(s) sem assets do config?`)) return;

  // Remove em ordem reversa para não deslocar os índices
  [...brokenIndexes].reverse().forEach(i => config?.objects.splice(i, 1));

  selectedIndex = -1;
  saveConfig();
  renderGrid();

  const btnRemove = document.getElementById('btn-remove-orphans');
  if (btnRemove) btnRemove.style.display = 'none';

  /** @type {HTMLElement|null} */ (document.getElementById('editor-form'))?.style.setProperty('display', 'none');
  /** @type {HTMLElement|null} */ (document.getElementById('editor-empty'))?.style.setProperty('display', 'flex');

  showToast(`🗑️ ${brokenIndexes.length} obra(s) órfã(s) removida(s) do config.`, 'error');
}


// ─── Remove Image ────────────────────────────────────────────

function removeImage(/** @type {number} */ imgIdx, /** @type {string} */ galId) {
  if (!config || selectedIndex < 0) return;
  const obj = config.objects[selectedIndex];
  const gal = obj.panel?.galleries?.find(g => g.id === galId);
  if (gal && imgIdx >= 0 && imgIdx < gal.images.length) {
    gal.images.splice(imgIdx, 1);
  }
  selectObra(selectedIndex);
  saveConfig(); // persiste a remoção imediatamente
}

// ─── Upload Handlers ─────────────────────────────────────────

function setupUploadZone(/** @type {string} */ zoneId, /** @type {string} */ inputId, /** @type {function(FileList): void} */ handler) {
  const zone = document.getElementById(zoneId);
  const input = /** @type {HTMLInputElement|null} */ (document.getElementById(inputId));
  if (!zone || !input) return;

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    if (e.dataTransfer?.files) handler(e.dataTransfer.files);
  });
  input.addEventListener('change', () => { if (input.files) handler(input.files); });
}

// ─── Events ──────────────────────────────────────────────────

function bindEvents() {
  document.getElementById('btn-new-obra')?.addEventListener('click', createNewObra);
  document.getElementById('btn-save')?.addEventListener('click', saveObra);
  document.getElementById('btn-delete-obra')?.addEventListener('click', deleteObra);
  document.getElementById('btn-sync')?.addEventListener('click', () => {
    forceSync().then(r => showToast(r.success ? '🟢 Sync OK' : `❌ ${r.errorDetails[0] || 'Erro'}`, r.success ? 'success' : 'error'));
  });
  document.getElementById('btn-audit')?.addEventListener('click', () => auditAssets());
  document.getElementById('btn-remove-orphans')?.addEventListener('click', () => removeOrphans());
  document.getElementById('btn-cancel')?.addEventListener('click', () => {
    selectedIndex = -1;
    /** @type {HTMLElement|null} */ (document.getElementById('editor-form'))?.style.setProperty('display', 'none');
    /** @type {HTMLElement|null} */ (document.getElementById('editor-empty'))?.style.setProperty('display', 'flex');
    renderGrid();
  });

  const getVal = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ (document.getElementById(id))?.value || '';

  document.getElementById('btn-global-labels')?.addEventListener('click', () => {
    if (!config) return;
    const l = config.settings.labels || { text: 'Texto', galleryA: 'Galeria A', galleryB: 'Galeria B', video: 'Vídeo' };
    
    const safeDecode = (str) => {
      if (!str) return str;
      try {
        let decoded = str;
        while(decoded.includes('Ã')) {
            decoded = decodeURIComponent(escape(decoded));
        }
        return decoded;
      } catch(e) { return str; }
    };

    const setVal = (/** @type {string} */ id, /** @type {string} */ val) => {
      const el = /** @type {HTMLInputElement|null} */ (document.getElementById(id));
      if (el) el.value = val;
    };
    setVal('label-text', safeDecode(l.text));
    setVal('label-gal-a', safeDecode(l.galleryA));
    setVal('label-gal-b', safeDecode(l.galleryB));
    setVal('label-video', safeDecode(l.video));
    const modal = document.getElementById('modal-labels');
    if (modal) modal.style.display = 'flex';
  });

  const searchInput = document.getElementById('search-obra');
  if (searchInput) {
    searchInput.addEventListener('input', applySearchFilter);
  }

  document.getElementById('btn-save-labels')?.addEventListener('click', () => {
    if (!config) return;
    if (!config.settings.labels) config.settings.labels = { text: '', galleryA: '', galleryB: '', video: '' };
    config.settings.labels.text = getVal('label-text');
    config.settings.labels.galleryA = getVal('label-gal-a');
    config.settings.labels.galleryB = getVal('label-gal-b');
    config.settings.labels.video = getVal('label-video');
    saveConfig();
    const modal = document.getElementById('modal-labels');
    if (modal) modal.style.display = 'none';
    showToast('⚙️ Labels globais salvos.', 'success');
  });

  document.getElementById('field-interactive')?.addEventListener('change', (e) => {
    const isInteractive = /** @type {HTMLInputElement} */ (e.target).checked;
    toggleInteractiveContent(isInteractive);
  });

  // Upload zones
  setupUploadZone('upload-model', 'input-model', (files) => {
    pendingModel = files[0] || null;
    const el = document.getElementById('model-filename');
    if (el && pendingModel) {
      el.textContent = `📁 ${pendingModel.name} (${(pendingModel.size / 1024).toFixed(0)}KB)`;
      if (config && selectedIndex >= 0) config.objects[selectedIndex].model = `assets/models/${pendingModel.name}`;
    }
  });

  setupUploadZone('upload-video', 'input-video', (files) => {
    pendingVideo = files[0] || null;
    const el = document.getElementById('video-filename');
    if (el && pendingVideo) {
      el.textContent = `🎬 ${pendingVideo.name} (${(pendingVideo.size / 1024 / 1024).toFixed(1)}MB)`;
      if (config && selectedIndex >= 0) {
        const obj = config.objects[selectedIndex];
        if (!obj.panel) obj.panel = { title_key: '' };
        obj.panel.video = { src: `assets/videos/${pendingVideo.name}` };
      }
    }
  });

  setupUploadZone('upload-images-a', 'input-images-a', (files) => {
    for (let i = 0; i < files.length; i++) {
      pendingImages.push({ name: files[i].name, blob: files[i], gallery: 'gal_a' });
    }
    showToast(`📸 ${files.length} imagem(ns) adicionada(s) à Galeria A. Salve para converter.`, 'success');
  });

  setupUploadZone('upload-images-b', 'input-images-b', (files) => {
    for (let i = 0; i < files.length; i++) {
      pendingImages.push({ name: files[i].name, blob: files[i], gallery: 'gal_b' });
    }
    showToast(`📸 ${files.length} imagem(ns) adicionada(s) à Galeria B. Salve para converter.`, 'success');
  });
}

// ─── Utils ───────────────────────────────────────────────────

function showToast(/** @type {string} */ msg, /** @type {'success'|'error'} */ type) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ─── Test Internals ───────────────────────────────────────────
// Expõe estado interno e funções para testes unitários.
// NÃO usar em código de produção.
export const _test = {
  setConfig:         (c) => { config = c; },
  getConfig:         ()  => config,
  setSelectedIndex:  (i) => { selectedIndex = i; },
  saveConfig,
  createNewObra,
  deleteObra,
  removeImage,
};
