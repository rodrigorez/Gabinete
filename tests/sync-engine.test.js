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
      GITHUB_TOKEN: 'fake-token',
    };
    return secrets[key] || '';
  }),
  loadSecrets: vi.fn(async () => ({ success: true })),
}));

const { loadQueue, enqueue, getStatus, onStatusChange, checkConnectivity, checkGithubAccess, resolveConfigAtBoot } =
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

// ─── Conectividade e Acesso ───────────────────────────────────

describe('checkConnectivity', () => {
  let originalOnLine;
  beforeEach(() => {
    originalOnLine = navigator.onLine;
    vi.stubGlobal('fetch', vi.fn());
  });
  
  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: originalOnLine, writable: true });
  });

  it('retorna false se navigator.onLine for false', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
    expect(await checkConnectivity()).toBe(false);
  });

  it('retorna true se fetch responder como opaque (no-cors)', async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
    globalThis.fetch.mockResolvedValueOnce({ type: 'opaque' });
    expect(await checkConnectivity()).toBe(true);
  });

  it('retorna false se fetch falhar', async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
    globalThis.fetch.mockRejectedValueOnce(new Error('Net Error'));
    expect(await checkConnectivity()).toBe(false);
  });
});

describe('checkGithubAccess', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('retorna ok:false se repositorio retornar 404', async () => {
    globalThis.fetch.mockResolvedValueOnce({ status: 404 });
    const result = await checkGithubAccess();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('não encontrado');
  });

  it('retorna ok:true se repositorio existir e ok', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: true });
    const result = await checkGithubAccess();
    expect(result.ok).toBe(true);
  });

  it('retorna ok:false se ocorrer erro de rede', async () => {
    globalThis.fetch.mockRejectedValueOnce(new Error('Fetch Fail'));
    const result = await checkGithubAccess();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Falha de rede');
  });
});

// ─── Resolve Config At Boot ───────────────────────────────────

describe('resolveConfigAtBoot', () => {
  let originalOnLine;
  beforeEach(() => {
    originalOnLine = navigator.onLine;
    vi.stubGlobal('fetch', vi.fn());
    localStorage.clear();
  });
  
  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: originalOnLine, writable: true });
  });

  const mockGithubContent = (jsonObj) => {
    // btoa(unescape(encodeURIComponent(str))) => btoa() base64 encoding
    // githubGet faz decodeURIComponent(escape(atob(data.content)))
    const str = JSON.stringify(jsonObj);
    const content = btoa(str);
    return {
      ok: true,
      json: () => Promise.resolve({ content, sha: 'fake-sha' })
    };
  };

  it('retorna config local se offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
    localStorage.setItem('gabinete_kiosk_config', JSON.stringify({ local: true }));
    
    const config = await resolveConfigAtBoot();
    expect(config).toEqual({ local: true });
  });

  it('retorna nulo se offline e sem config local', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
    const config = await resolveConfigAtBoot();
    expect(config).toBeNull();
  });

  it('faz push se apenas config local existir (e online)', async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
    localStorage.setItem('gabinete_kiosk_config', JSON.stringify({ local: true }));
    
    // checkConnectivity, checkGithubAccess, githubGet(check), githubGet(existing), githubPut
    globalThis.fetch
      .mockResolvedValueOnce({ ok: true }) // connectivity
      .mockResolvedValueOnce({ ok: true }) // checkGithubAccess
      .mockResolvedValueOnce({ ok: false, status: 404 }) // githubGet config.json (not found)
      .mockResolvedValueOnce({ ok: false, status: 404 }) // githubGet config.json (check before put)
      .mockResolvedValueOnce({ ok: true }); // githubPut
      
    const config = await resolveConfigAtBoot();
    expect(config).toEqual({ local: true });
    // fetch foi chamado várias vezes (1. connect, 2. access, 3. get, 4. get existing, 5. put)
    expect(globalThis.fetch).toHaveBeenCalledTimes(5);
  });

  it('faz pull se apenas config remota existir', async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
    
    const remoteData = { remote: true };
    globalThis.fetch
      .mockResolvedValueOnce({ ok: true }) // connectivity
      .mockResolvedValueOnce({ ok: true }) // checkGithubAccess
      .mockResolvedValueOnce(mockGithubContent(remoteData)); // githubGet config.json
      
    const config = await resolveConfigAtBoot();
    expect(config).toEqual(remoteData);
    expect(localStorage.getItem('gabinete_kiosk_config')).toBe(JSON.stringify(remoteData));
  });

  it('compara timestamps e puxa do remoto se remoto for mais novo', async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
    
    const localData = { _lastModified: '2023-01-01T00:00:00Z', objects: [1] };
    const remoteData = { _lastModified: '2023-01-02T00:00:00Z', objects: [1, 2] };
    
    localStorage.setItem('gabinete_kiosk_config', JSON.stringify(localData));
    
    globalThis.fetch
      .mockResolvedValueOnce({ ok: true }) // connectivity
      .mockResolvedValueOnce({ ok: true }) // checkGithubAccess
      .mockResolvedValueOnce(mockGithubContent(remoteData)); // githubGet config.json
      
    const config = await resolveConfigAtBoot();
    expect(config).toEqual(remoteData);
  });

  it('compara timestamps e faz push se local for mais novo', async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
    
    const localData = { _lastModified: '2023-01-02T00:00:00Z', objects: [1, 2] };
    const remoteData = { _lastModified: '2023-01-01T00:00:00Z', objects: [1] };
    
    localStorage.setItem('gabinete_kiosk_config', JSON.stringify(localData));
    
    globalThis.fetch
      .mockResolvedValueOnce({ ok: true }) // connectivity
      .mockResolvedValueOnce({ ok: true }) // checkGithubAccess
      .mockResolvedValueOnce(mockGithubContent(remoteData)) // githubGet config.json
      .mockResolvedValueOnce({ ok: true }); // githubPut
      
    const config = await resolveConfigAtBoot();
    expect(config).toEqual(localData);
  });
});


