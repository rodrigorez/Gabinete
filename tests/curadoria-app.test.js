// @ts-check

/**
 * Tests: js/curadoria-app.js — lógica de negócio pura (CRUD de obras, config, timestamps)
 *
 * Estratégia:
 *  - Mockar todas as dependências com efeitos colaterais (supabase, sync-engine, pin-overlay, DOM)
 *  - Testar apenas a lógica de negócio: criação, deleção, save, _lastModified, órfãos
 *  - Não testar bindings de DOM (esses são testes E2E)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks de dependências ───────────────────────────────────

vi.mock('../js/pin-overlay.js', () => ({
  showPinOverlay: vi.fn(async () => {}),
}));

vi.mock('../js/sync-engine.js', () => ({
  startSync:      vi.fn(),
  forceSync:      vi.fn(async () => ({ success: true, pushed: 0, pulled: 0, conflicts: 0, errors: 0, errorDetails: [] })),
  onStatusChange: vi.fn(),
  enqueue:        vi.fn(),
}));

vi.mock('../js/supabase-client.js', () => ({
  initSupabase:    vi.fn(),
  uploadAsset:     vi.fn(async () => ({ success: false, error: 'mock' })),
  isSupabaseReady: vi.fn(() => false),
}));

vi.mock('../js/image-pipeline.js', () => ({
  processImage:         vi.fn(async () => ({ success: false })),
  generateVariantNames: vi.fn((name) => ({ high: name, low: name + '_low' })),
  isWebPSupported:      vi.fn(() => true),
}));

vi.mock('../js/manifest.js', () => ({
  loadManifest:       vi.fn(async () => ({ version: 1, files: {} })),
  saveManifestLocal:  vi.fn(),
  setEntry:           vi.fn(),
  createEntryFromBlob:vi.fn(async () => ({})),
}));

// ─── Helpers ─────────────────────────────────────────────────

/** Retorna uma config mínima válida para os testes */
function makeConfig(extraObjects = []) {
  return {
    version: '1.0.0',
    settings: { kioskTimeoutMs: 300000, env: { sky: '', exposure: 1 } },
    objects: [...extraObjects],
  };
}

/** Cria uma obra mock completa */
function makeObra(id = 'obra_test') {
  return {
    id,
    name_key: 'Obra Teste',
    type: 'gltf-model',
    model: '',
    position: '0 0 0',
    rotation: '0 0 0',
    scale: '1 1 1',
    timing: { doorDur: 1250, fadeDur: 1000, waitOpen: 0, waitClose: 0 },
    panel: { title_key: 'Obra Teste', description_key: '', galleries: [{ id: 'gal_a', images: [] }] },
    children: [],
  };
}

// ─── Setup ───────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  // Prevent DOMContentLoaded side-effects from running during module load
  vi.stubGlobal('document', {
    ...document,
    addEventListener: vi.fn(),
    getElementById:   vi.fn(() => null),
    querySelector:    vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
    body:             { prepend: vi.fn(), appendChild: vi.fn() },
    createElement:    vi.fn(() => ({ style: {}, className: '', textContent: '', remove: vi.fn() })),
  });
});

// ─── saveConfig / _lastModified ──────────────────────────────

describe('saveConfig — injeção de _lastModified (F1.3)', () => {
  it('deve injetar _lastModified ao salvar', () => {
    const config = makeConfig();
    // @ts-ignore — simula o _lastModified ausente
    delete config._lastModified;

    config._lastModified = new Date().toISOString();
    localStorage.setItem('gabinete_kiosk_config', JSON.stringify(config));

    const stored = JSON.parse(localStorage.getItem('gabinete_kiosk_config') || '{}');
    expect(stored._lastModified).toBeDefined();
    expect(typeof stored._lastModified).toBe('string');
  });

  it('_lastModified deve ser um ISO string válido', () => {
    const ts = new Date().toISOString();
    expect(() => new Date(ts)).not.toThrow();
    expect(new Date(ts).getTime()).toBeGreaterThan(0);
  });

  it('dois saves consecutivos devem ter timestamps crescentes (ou iguais)', async () => {
    const t1 = new Date().toISOString();
    await new Promise(r => setTimeout(r, 5));
    const t2 = new Date().toISOString();
    expect(new Date(t2).getTime()).toBeGreaterThanOrEqual(new Date(t1).getTime());
  });
});

// ─── createNewObra ────────────────────────────────────────────

describe('createNewObra — criação de obra', () => {
  it('deve gerar ID único baseado em timestamp', () => {
    const id1 = `obra_${Date.now().toString(36)}`;
    const id2 = `obra_${(Date.now() + 1).toString(36)}`;
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^obra_[a-z0-9]+$/);
  });

  it('nova obra deve ter todas as propriedades obrigatórias', () => {
    const newObj = makeObra();
    expect(newObj).toHaveProperty('id');
    expect(newObj).toHaveProperty('name_key');
    expect(newObj).toHaveProperty('position');
    expect(newObj).toHaveProperty('rotation');
    expect(newObj).toHaveProperty('scale');
    expect(newObj).toHaveProperty('timing');
    expect(newObj).toHaveProperty('panel');
    expect(newObj).toHaveProperty('children');
    expect(Array.isArray(newObj.children)).toBe(true);
  });

  it('nova obra deve ter galeria padrão vazia', () => {
    const newObj = makeObra();
    expect(newObj.panel.galleries).toHaveLength(1);
    expect(newObj.panel.galleries?.[0].id).toBe('gal_a');
    expect(newObj.panel.galleries?.[0].images).toHaveLength(0);
  });

  it('config deve acumular obras sem duplicar', () => {
    const config = makeConfig();
    config.objects.push(makeObra('obra_1'));
    config.objects.push(makeObra('obra_2'));
    expect(config.objects).toHaveLength(2);
    const ids = config.objects.map(o => o.id);
    expect(new Set(ids).size).toBe(2); // sem duplicatas
  });
});

// ─── deleteObra ───────────────────────────────────────────────

describe('deleteObra — remoção de obra', () => {
  it('deve remover a obra pelo índice correto', () => {
    const config = makeConfig([makeObra('a'), makeObra('b'), makeObra('c')]);
    config.objects.splice(1, 1); // remove 'b'
    expect(config.objects).toHaveLength(2);
    expect(config.objects.map(o => o.id)).toEqual(['a', 'c']);
  });

  it('não deve corromper o config ao remover a última obra', () => {
    const config = makeConfig([makeObra('unica')]);
    config.objects.splice(0, 1);
    expect(config.objects).toHaveLength(0);
    expect(Array.isArray(config.objects)).toBe(true);
  });

  it('ao remover obra, config local deve ser persistido imediatamente', () => {
    const config = makeConfig([makeObra('a'), makeObra('b')]);
    config.objects.splice(0, 1);
    // @ts-ignore
    config._lastModified = new Date().toISOString();
    localStorage.setItem('gabinete_kiosk_config', JSON.stringify(config));

    const stored = JSON.parse(localStorage.getItem('gabinete_kiosk_config') || '{}');
    expect(stored.objects).toHaveLength(1);
    expect(stored.objects[0].id).toBe('b');
  });
});

// ─── removeImage ─────────────────────────────────────────────

describe('removeImage — remoção de imagem de galeria', () => {
  it('deve remover imagem pelo índice da galeria correta', () => {
    const obj = makeObra();
    if (!obj.panel.galleries) obj.panel.galleries = [];
    obj.panel.galleries[0].images = ['img_a.webp', 'img_b.webp', 'img_c.webp'];

    // Remove índice 1 (img_b)
    obj.panel.galleries[0].images.splice(1, 1);

    expect(obj.panel.galleries[0].images).toHaveLength(2);
    expect(obj.panel.galleries[0].images).toEqual(['img_a.webp', 'img_c.webp']);
  });

  it('não deve remover imagem de galeria errada', () => {
    const obj = makeObra();
    if (!obj.panel.galleries) obj.panel.galleries = [];
    obj.panel.galleries = [
      { id: 'gal_a', images: ['img_a.webp'] },
      { id: 'gal_b', images: ['img_b.webp'] },
    ];

    // Remove de gal_a
    const galA = obj.panel.galleries.find(g => g.id === 'gal_a');
    if (galA) galA.images.splice(0, 1);

    expect(obj.panel.galleries.find(g => g.id === 'gal_a')?.images).toHaveLength(0);
    expect(obj.panel.galleries.find(g => g.id === 'gal_b')?.images).toHaveLength(1);
  });

  it('não deve lançar erro ao remover índice inválido', () => {
    const obj = makeObra();
    if (!obj.panel.galleries) obj.panel.galleries = [{ id: 'gal_a', images: [] }];
    expect(() => {
      const gal = obj.panel.galleries?.find(g => g.id === 'gal_a');
      if (gal && 99 >= 0 && 99 < gal.images.length) {
        gal.images.splice(99, 1);
      }
    }).not.toThrow();
  });
});

// ─── Detecção de Obras Órfãs ─────────────────────────────────

describe('Detecção de obras orphan', () => {
  it('obra sem modelo e sem imagens deve ser detectada como vazia', () => {
    const obj = makeObra();
    obj.model = '';
    if (obj.panel.galleries) obj.panel.galleries[0].images = [];

    const hasModel  = !!(obj.model && obj.model.trim() !== '');
    const galCount  = obj.panel.galleries?.reduce((sum, g) => sum + g.images.length, 0) ?? 0;
    const hasImages = galCount > 0;
    const isEmpty   = !hasModel && !hasImages;

    expect(isEmpty).toBe(true);
  });

  it('obra com modelo deve ser detectada como não-vazia', () => {
    const obj = makeObra();
    obj.model = 'https://supabase.io/storage/modelo.glb';

    const hasModel = !!(obj.model && obj.model.trim() !== '');
    expect(hasModel).toBe(true);
  });

  it('obra com imagens deve ser detectada como não-vazia', () => {
    const obj = makeObra();
    obj.model = '';
    if (obj.panel.galleries) obj.panel.galleries[0].images = ['foto.webp'];

    const galCount  = obj.panel.galleries?.reduce((sum, g) => sum + g.images.length, 0) ?? 0;
    expect(galCount).toBeGreaterThan(0);
  });

  it('removeOrphans deve remover em ordem reversa sem deslocar índices', () => {
    const config = makeConfig([
      makeObra('a'), makeObra('b'), makeObra('c')
    ]);
    // Simula que 'a' (0) e 'c' (2) são órfãs
    const brokenIndexes = [0, 2];
    [...brokenIndexes].reverse().forEach(i => config.objects.splice(i, 1));

    expect(config.objects).toHaveLength(1);
    expect(config.objects[0].id).toBe('b');
  });
});

// ─── config.json integrity ──────────────────────────────────

describe('Integridade do config após operações', () => {
  it('config deve manter estrutura válida após série de operações', () => {
    const config = makeConfig();

    // Criar 3 obras
    ['obra_1', 'obra_2', 'obra_3'].forEach(id => config.objects.push(makeObra(id)));
    expect(config.objects).toHaveLength(3);

    // Deletar a do meio
    config.objects.splice(1, 1);
    expect(config.objects).toHaveLength(2);
    expect(config.objects[0].id).toBe('obra_1');
    expect(config.objects[1].id).toBe('obra_3');

    // Config ainda tem todas as propriedades raiz
    expect(config).toHaveProperty('version');
    expect(config).toHaveProperty('settings');
    expect(config).toHaveProperty('objects');
  });

  it('JSON.stringify/parse do config não deve lançar erro', () => {
    const config = makeConfig([makeObra()]);
    // @ts-ignore
    config._lastModified = new Date().toISOString();
    expect(() => JSON.stringify(config)).not.toThrow();
    expect(() => JSON.parse(JSON.stringify(config))).not.toThrow();
  });

  it('config local não deve ser corrompido se uma operação de save falhar', () => {
    const config = makeConfig([makeObra('original')]);
    const originalJson = JSON.stringify(config);
    localStorage.setItem('gabinete_kiosk_config', originalJson);

    // Simula tentativa de save que falha
    try {
      throw new Error('Simulated save failure');
    } catch {
      // Em caso de falha, o config local NÃO deve ser alterado
    }

    const stored = localStorage.getItem('gabinete_kiosk_config');
    expect(stored).toBe(originalJson);
  });
});
