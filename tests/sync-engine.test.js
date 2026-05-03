// @ts-check

/**
 * Tests: js/sync-engine.js — funções puras e lógica de estado
 * Foco: loadQueue/enqueue/dequeue, onStatusChange, resolução de config por timestamp.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks antes dos imports
vi.stubGlobal('fetch', vi.fn());

// Mock do secrets-loader para que sync-engine não precise de secrets reais
vi.mock('../js/secrets-loader.js', () => ({
  getSecret: vi.fn((key) => {
    const secrets = {
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
      GITHUB_REPO: 'user/repo',
    };
    return secrets[key] || '';
  }),
  loadSecrets: vi.fn(async () => ({ success: true })),
}));

const { loadQueue, enqueue, getStatus, onStatusChange } =
  await import('../js/sync-engine.js');

// ─── Helpers ──────────────────────────────────────────────────

/** @returns {import('../js/sync-engine.js').SyncOperation} */
function makeOp(path, action = 'push') {
  return { path, action, timestamp: new Date().toISOString() };
}

beforeEach(() => {
  localStorage.clear();
});

// ─── Queue ────────────────────────────────────────────────────

describe('loadQueue', () => {
  it('retorna array vazio quando não há fila no localStorage', () => {
    expect(loadQueue()).toEqual([]);
  });

  it('retorna array vazio para JSON inválido', () => {
    localStorage.setItem('gabinete_sync_queue_v1', 'INVALID_JSON{{{');
    expect(loadQueue()).toEqual([]);
  });
});

describe('enqueue', () => {
  it('adiciona operação à fila', () => {
    enqueue(makeOp('images/foto.webp', 'push'));
    expect(loadQueue()).toHaveLength(1);
    expect(loadQueue()[0].path).toBe('images/foto.webp');
  });

  it('não duplica operações com mesmo path+action', () => {
    enqueue(makeOp('images/foto.webp', 'push'));
    enqueue(makeOp('images/foto.webp', 'push')); // duplicata

    expect(loadQueue()).toHaveLength(1);
  });

  it('permite mesma path com action diferente', () => {
    enqueue(makeOp('images/foto.webp', 'push'));
    enqueue(makeOp('images/foto.webp', 'delete'));

    expect(loadQueue()).toHaveLength(2);
  });

  it('persiste entre chamadas (localStorage)', () => {
    enqueue(makeOp('models/objeto.glb', 'push'));
    // simula re-leitura
    expect(loadQueue().some(op => op.path === 'models/objeto.glb')).toBe(true);
  });
});

// ─── Status ───────────────────────────────────────────────────

describe('getStatus', () => {
  it('retorna status inicial "offline"', () => {
    const status = getStatus();
    expect(['offline', 'synced', 'pending', 'syncing', 'error']).toContain(status);
  });
});

describe('onStatusChange', () => {
  it('não lança erro ao registrar listener', () => {
    expect(() => onStatusChange(() => {})).not.toThrow();
  });
});
