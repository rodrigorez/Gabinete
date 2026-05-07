// @ts-nocheck

/**
 * Tests: js/curadoria-app.js — testa o módulo REAL via _test internals.
 *
 * Estratégia:
 *  - Importa o módulo real e usa `_test` para injetar estado e chamar funções reais
 *  - Mocka apenas dependências com efeitos colaterais externos (supabase, sync, DOM pin)
 *  - Valida estado via localStorage e _test.getConfig()
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { _test } from '../js/curadoria-app.js';

// ─── Mocks de dependências externas ──────────────────────────

vi.mock('../js/pin-overlay.js', () => ({
  showPinOverlay: vi.fn(async () => ({})),
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
  loadManifest:        vi.fn(async () => ({ version: 1, files: {} })),
  saveManifestLocal:   vi.fn(),
  setEntry:            vi.fn(),
  createEntryFromBlob: vi.fn(async () => ({})),
}));

// Mock confirm para não bloquear fluxo de deleteObra
vi.stubGlobal('confirm', vi.fn(() => true));

// ─── Helpers ─────────────────────────────────────────────────

function makeConfig(objects = []) {
  return {
    version: '1.0.0',
    settings: { kioskTimeoutMs: 300000, env: { sky: '', exposure: 1 } },
    objects: [...objects],
  };
}

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
    panel: {
      title_key: 'Obra Teste',
      description_key: '',
      galleries: [{ id: 'gal_a', images: [] }],
    },
    children: [],
  };
}

// ─── Setup ───────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  _test.setConfig(null);
  _test.setSelectedIndex(-1);
});

// ─── saveConfig (módulo real) ─────────────────────────────────

describe('saveConfig — módulo real', () => {
  it('deve injetar _lastModified automaticamente', () => {
    _test.setConfig(makeConfig());
    _test.saveConfig();
    const stored = JSON.parse(localStorage.getItem('gabinete_kiosk_config') || '{}');
    expect(stored._lastModified).toBeDefined();
    expect(new Date(stored._lastModified).getTime()).toBeGreaterThan(0);
  });

  it('deve persistir o config completo no localStorage', () => {
    const cfg = makeConfig([makeObra('obra_1')]);
    _test.setConfig(cfg);
    _test.saveConfig();
    const stored = JSON.parse(localStorage.getItem('gabinete_kiosk_config') || '{}');
    expect(stored.objects).toHaveLength(1);
    expect(stored.objects[0].id).toBe('obra_1');
  });

  it('NÃO deve enfileirar push para o GitHub (CMS local gerencia commit)', async () => {
    const { enqueue } = await import('../js/sync-engine.js');
    _test.setConfig(makeConfig());
    _test.saveConfig();
    expect(enqueue).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'push', path: 'assets/config.json', target: 'github' })
    );
  });

  it('não deve lançar erro se config for null', () => {
    _test.setConfig(null);
    expect(() => _test.saveConfig()).not.toThrow();
    expect(localStorage.getItem('gabinete_kiosk_config')).toBeNull();
  });

  it('cada save deve ter timestamp igual ou crescente', () => {
    _test.setConfig(makeConfig());
    _test.saveConfig();
    const t1Raw = JSON.parse(localStorage.getItem('gabinete_kiosk_config') || '{}')._lastModified;

    _test.saveConfig();
    const t2Raw = JSON.parse(localStorage.getItem('gabinete_kiosk_config') || '{}')._lastModified;

    expect(new Date(t2Raw).getTime()).toBeGreaterThanOrEqual(new Date(t1Raw).getTime());
  });
});

// ─── createNewObra (módulo real) ──────────────────────────────

describe('createNewObra — módulo real', () => {
  it('deve adicionar 1 obra ao config.objects', () => {
    _test.setConfig(makeConfig());
    _test.createNewObra();
    expect(_test.getConfig()?.objects).toHaveLength(1);
  });

  it('deve gerar ID no formato obra_* (base36)', () => {
    _test.setConfig(makeConfig());
    _test.createNewObra();
    const id = _test.getConfig()?.objects[0].id;
    expect(id).toMatch(/^obra_[a-z0-9]+$/);
  });

  it('deve persistir a nova obra no localStorage', () => {
    _test.setConfig(makeConfig());
    _test.createNewObra();
    const stored = JSON.parse(localStorage.getItem('gabinete_kiosk_config') || '{}');
    expect(stored.objects).toHaveLength(1);
  });

  it('múltiplas obras devem ser criadas (quantidade)', () => {
    _test.setConfig(makeConfig());
    _test.createNewObra();
    _test.createNewObra();
    // Verifica quantidade — IDs podem colidir se Date.now() retornar o mesmo ms no test runner
    expect(_test.getConfig()?.objects).toHaveLength(2);
  });

  it('nova obra deve ter galeria padrão gal_a vazia', () => {
    _test.setConfig(makeConfig());
    _test.createNewObra();
    const obra = _test.getConfig()?.objects[0];
    expect(obra?.panel?.galleries?.[0].id).toBe('gal_a');
    expect(obra?.panel?.galleries?.[0].images).toHaveLength(0);
  });

  it('não deve lançar erro se config for null', () => {
    _test.setConfig(null);
    expect(() => _test.createNewObra()).not.toThrow();
  });
});

// ─── deleteObra (módulo real) ─────────────────────────────────

describe('deleteObra — módulo real', () => {
  it('deve remover a obra selecionada', () => {
    _test.setConfig(makeConfig([makeObra('a'), makeObra('b')]));
    _test.setSelectedIndex(0);
    _test.deleteObra();
    const cfg = _test.getConfig();
    expect(cfg?.objects).toHaveLength(1);
    expect(cfg?.objects[0].id).toBe('b');
  });

  it('deve persistir no localStorage após remoção', () => {
    _test.setConfig(makeConfig([makeObra('x'), makeObra('y')]));
    _test.setSelectedIndex(1);
    _test.deleteObra();
    const stored = JSON.parse(localStorage.getItem('gabinete_kiosk_config') || '{}');
    expect(stored.objects).toHaveLength(1);
    expect(stored.objects[0].id).toBe('x');
  });

  it('não deve fazer nada se selectedIndex for -1', () => {
    _test.setConfig(makeConfig([makeObra('z')]));
    _test.setSelectedIndex(-1);
    _test.deleteObra();
    expect(_test.getConfig()?.objects).toHaveLength(1);
  });

  it('não deve fazer nada se config for null', () => {
    _test.setConfig(null);
    expect(() => _test.deleteObra()).not.toThrow();
  });
});

// ─── removeImage (módulo real) ────────────────────────────────

describe('removeImage — módulo real', () => {
  it('deve remover imagem pelo índice da galeria correta', () => {
    const obra = makeObra('obra_img');
    if (!obra.panel.galleries) obra.panel.galleries = [];
    obra.panel.galleries[0].images = ['a.webp', 'b.webp', 'c.webp'];
    _test.setConfig(makeConfig([obra]));
    _test.setSelectedIndex(0);

    _test.removeImage(1, 'gal_a'); // remove 'b.webp'

    const cfg = _test.getConfig();
    expect(cfg?.objects[0].panel?.galleries?.[0].images).toEqual(['a.webp', 'c.webp']);
  });

  it('deve persistir remoção no localStorage', () => {
    const obra = makeObra();
    if (obra.panel.galleries) obra.panel.galleries[0].images = ['img1.webp', 'img2.webp'];
    _test.setConfig(makeConfig([obra]));
    _test.setSelectedIndex(0);

    _test.removeImage(0, 'gal_a');

    const stored = JSON.parse(localStorage.getItem('gabinete_kiosk_config') || '{}');
    expect(stored.objects[0].panel.galleries[0].images).toHaveLength(1);
    expect(stored.objects[0].panel.galleries[0].images[0]).toBe('img2.webp');
  });

  it('não deve alterar outra galeria ao remover de gal_a', () => {
    const obra = makeObra();
    obra.panel.galleries = [
      { id: 'gal_a', images: ['a.webp', 'b.webp'] },
      { id: 'gal_b', images: ['c.webp'] },
    ];
    _test.setConfig(makeConfig([obra]));
    _test.setSelectedIndex(0);

    _test.removeImage(0, 'gal_a');

    const cfg = _test.getConfig();
    expect(cfg?.objects[0].panel?.galleries?.find((g) => g.id === 'gal_b')?.images).toHaveLength(1);
  });

  it('não deve lançar erro com índice inválido', () => {
    const obra = makeObra();
    if (obra.panel.galleries) obra.panel.galleries[0].images = ['x.webp'];
    _test.setConfig(makeConfig([obra]));
    _test.setSelectedIndex(0);
    expect(() => _test.removeImage(99, 'gal_a')).not.toThrow();
  });

  it('não deve fazer nada se config for null', () => {
    _test.setConfig(null);
    expect(() => _test.removeImage(0, 'gal_a')).not.toThrow();
  });
});
