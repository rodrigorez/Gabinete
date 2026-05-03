// @ts-check

/**
 * Tests: js/manifest.js
 * Foco nas funções puras (sem I/O, sem DOM, sem WebCrypto).
 * Padrão: AAA (Arrange → Act → Assert)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createEmptyManifest,
  setEntry,
  removeEntry,
  getEntry,
  detectVariant,
  diffManifests,
  resolveConflicts,
  exportManifest,
} from '../js/manifest.js';

// ─── Fixtures ─────────────────────────────────────────────────

/** @returns {import('../js/manifest.js').ManifestEntry} */
function makeEntry(sha256, modifiedIso) {
  return { sha256, size: 1024, modified: modifiedIso, storage: 'supabase' };
}

// ─── createEmptyManifest ──────────────────────────────────────

describe('createEmptyManifest', () => {
  it('cria manifesto com campos obrigatórios', () => {
    const m = createEmptyManifest('device-1');
    expect(m.version).toBe(1);
    expect(m.device_id).toBe('device-1');
    expect(m.files).toEqual({});
    expect(m.timestamp).toBeTruthy();
  });

  it('usa "default" como device_id quando não informado', () => {
    const m = createEmptyManifest();
    expect(m.device_id).toBe('default');
  });
});

// ─── setEntry / getEntry / removeEntry ────────────────────────

describe('setEntry', () => {
  it('adiciona uma entrada e incrementa a versão', () => {
    const m = createEmptyManifest();
    const entry = makeEntry('abc123', new Date().toISOString());

    setEntry(m, 'images/foto.webp', entry);

    expect(m.files['images/foto.webp']).toEqual(entry);
    expect(m.version).toBe(2);
  });

  it('sobrescreve entrada existente', () => {
    const m = createEmptyManifest();
    setEntry(m, 'images/foto.webp', makeEntry('old-hash', '2024-01-01T00:00:00Z'));
    setEntry(m, 'images/foto.webp', makeEntry('new-hash', '2024-06-01T00:00:00Z'));

    expect(m.files['images/foto.webp'].sha256).toBe('new-hash');
    expect(m.version).toBe(3); // 2 incrementos
  });
});

describe('getEntry', () => {
  it('retorna a entrada existente', () => {
    const m = createEmptyManifest();
    const entry = makeEntry('abc123', new Date().toISOString());
    setEntry(m, 'models/objeto.glb', entry);

    expect(getEntry(m, 'models/objeto.glb')).toEqual(entry);
  });

  it('retorna undefined para path inexistente', () => {
    const m = createEmptyManifest();
    expect(getEntry(m, 'nao-existe.webp')).toBeUndefined();
  });
});

describe('removeEntry', () => {
  it('remove a entrada e incrementa a versão', () => {
    const m = createEmptyManifest();
    setEntry(m, 'images/foto.webp', makeEntry('abc123', new Date().toISOString()));
    const versionBefore = m.version;

    removeEntry(m, 'images/foto.webp');

    expect(m.files['images/foto.webp']).toBeUndefined();
    expect(m.version).toBe(versionBefore + 1);
  });

  it('não lança erro ao remover path inexistente', () => {
    const m = createEmptyManifest();
    expect(() => removeEntry(m, 'nao-existe.webp')).not.toThrow();
  });
});

// ─── detectVariant ────────────────────────────────────────────

describe('detectVariant', () => {
  it('detecta variante _low', () => {
    const result = detectVariant('assets/images/02_img_01_low.webp');
    expect(result.variant).toBe('low');
    expect(result.pair).toBe('assets/images/02_img_01_high.webp');
  });

  it('detecta variante _high', () => {
    const result = detectVariant('assets/images/02_img_01_high.webp');
    expect(result.variant).toBe('high');
    expect(result.pair).toBe('assets/images/02_img_01_low.webp');
  });

  it('retorna objeto vazio para arquivo sem variante', () => {
    const result = detectVariant('assets/models/objeto.glb');
    expect(result.variant).toBeUndefined();
    expect(result.pair).toBeUndefined();
  });
});

// ─── diffManifests ────────────────────────────────────────────

describe('diffManifests', () => {
  it('detecta arquivo só local → toPush', () => {
    const local  = createEmptyManifest();
    const remote = createEmptyManifest();
    setEntry(local, 'images/nova.webp', makeEntry('hash1', '2024-01-01T00:00:00Z'));

    const diff = diffManifests(local, remote);

    expect(diff.toPush).toContain('images/nova.webp');
    expect(diff.toPull).toHaveLength(0);
    expect(diff.conflicts).toHaveLength(0);
  });

  it('detecta arquivo só remoto → toPull', () => {
    const local  = createEmptyManifest();
    const remote = createEmptyManifest();
    setEntry(remote, 'images/remota.webp', makeEntry('hash2', '2024-01-01T00:00:00Z'));

    const diff = diffManifests(local, remote);

    expect(diff.toPull).toContain('images/remota.webp');
    expect(diff.toPush).toHaveLength(0);
  });

  it('detecta hashes iguais → synced', () => {
    const local  = createEmptyManifest();
    const remote = createEmptyManifest();
    const entry  = makeEntry('hash-igual', '2024-01-01T00:00:00Z');
    setEntry(local,  'images/igual.webp', entry);
    setEntry(remote, 'images/igual.webp', entry);

    const diff = diffManifests(local, remote);

    expect(diff.synced).toContain('images/igual.webp');
    expect(diff.conflicts).toHaveLength(0);
  });

  it('detecta hashes diferentes → conflicts', () => {
    const local  = createEmptyManifest();
    const remote = createEmptyManifest();
    setEntry(local,  'images/conflito.webp', makeEntry('hash-local',  '2024-01-01T00:00:00Z'));
    setEntry(remote, 'images/conflito.webp', makeEntry('hash-remoto', '2024-06-01T00:00:00Z'));

    const diff = diffManifests(local, remote);

    expect(diff.conflicts).toContain('images/conflito.webp');
  });

  it('manifesto vazio → sem diferenças', () => {
    const local  = createEmptyManifest();
    const remote = createEmptyManifest();

    const diff = diffManifests(local, remote);

    expect(diff.toPush).toHaveLength(0);
    expect(diff.toPull).toHaveLength(0);
    expect(diff.synced).toHaveLength(0);
    expect(diff.conflicts).toHaveLength(0);
  });
});

// ─── resolveConflicts ─────────────────────────────────────────

describe('resolveConflicts', () => {
  it('local mais recente → pushPaths', () => {
    const local  = createEmptyManifest();
    const remote = createEmptyManifest();
    setEntry(local,  'img.webp', makeEntry('hash-l', '2024-12-01T00:00:00Z'));
    setEntry(remote, 'img.webp', makeEntry('hash-r', '2024-01-01T00:00:00Z'));

    const result = resolveConflicts(local, remote, ['img.webp']);

    expect(result.pushPaths).toContain('img.webp');
    expect(result.pullPaths).toHaveLength(0);
  });

  it('remoto mais recente → pullPaths', () => {
    const local  = createEmptyManifest();
    const remote = createEmptyManifest();
    setEntry(local,  'img.webp', makeEntry('hash-l', '2024-01-01T00:00:00Z'));
    setEntry(remote, 'img.webp', makeEntry('hash-r', '2024-12-01T00:00:00Z'));

    const result = resolveConflicts(local, remote, ['img.webp']);

    expect(result.pullPaths).toContain('img.webp');
    expect(result.pushPaths).toHaveLength(0);
  });

  it('timestamps iguais → local vence (push)', () => {
    const ts = '2024-06-01T12:00:00Z';
    const local  = createEmptyManifest();
    const remote = createEmptyManifest();
    setEntry(local,  'img.webp', makeEntry('hash-l', ts));
    setEntry(remote, 'img.webp', makeEntry('hash-r', ts));

    const result = resolveConflicts(local, remote, ['img.webp']);

    expect(result.pushPaths).toContain('img.webp');
  });

  it('lista vazia → sem resultados', () => {
    const result = resolveConflicts(createEmptyManifest(), createEmptyManifest(), []);
    expect(result.pushPaths).toHaveLength(0);
    expect(result.pullPaths).toHaveLength(0);
  });
});

// ─── exportManifest ───────────────────────────────────────────

describe('exportManifest', () => {
  it('retorna JSON válido e formatado', () => {
    const m = createEmptyManifest('test-device');
    setEntry(m, 'test.webp', makeEntry('hash123', new Date().toISOString()));

    const exported = exportManifest(m);
    const parsed = JSON.parse(exported); // não deve lançar

    expect(parsed.device_id).toBe('test-device');
    expect(parsed.files['test.webp'].sha256).toBe('hash123');
  });
});
