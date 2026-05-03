// @ts-check

/**
 * Tests: js/secrets-loader.js
 * Testa: fallback env vars, modo plaintext, modo criptografado,
 *        PIN incorreto, cache, clearSecrets, e timer de inatividade.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Setup de mocks (antes dos imports dos módulos) ───────────

// Mock do fetch — controlado por cada teste
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import APÓS os mocks
const { loadSecrets, getSecret, clearSecrets, resetClearTimer } =
  await import('../js/secrets-loader.js');

// ─── Helpers ──────────────────────────────────────────────────

/** Retorna fetch mock que falha (simula secrets.json ausente) */
function fetchFails() {
  mockFetch.mockRejectedValue(new Error('Not Found'));
}

/** Retorna fetch mock com secrets.json em plaintext */
function fetchPlaintext(secrets = {}) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => secrets,
  });
}

/** Retorna fetch mock com HTTP 404 */
function fetch404() {
  mockFetch.mockResolvedValue({ ok: false, status: 404 });
}

// ─── Encrypted secrets helper ────────────────────────────────

/**
 * Gera um secrets.json criptografado em memória usando WebCrypto.
 * Replica a lógica de reEncryptSecrets para uso nos testes.
 */
async function encryptSecrets(pin, plainSecrets) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));

  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt']
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(plainSecrets))
  );

  const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

  return {
    _encrypted: true,
    salt: toB64(salt),
    iv:   toB64(iv),
    data: toB64(encrypted),
  };
}

// ─── Testes ───────────────────────────────────────────────────

beforeEach(() => {
  clearSecrets();         // garante estado limpo antes de cada teste
  mockFetch.mockReset();
});

afterEach(() => {
  vi.clearAllTimers();
});

// ── Fallback (sem secrets.json) ───────────────────────────────

describe('loadSecrets — fallback env vars', () => {
  it('retorna success:true mesmo sem secrets.json', async () => {
    fetchFails();
    const result = await loadSecrets();
    expect(result.success).toBe(true);
  });

  it('não retorna needsPin no modo fallback', async () => {
    fetchFails();
    const result = await loadSecrets();
    expect(result.needsPin).toBeFalsy();
  });

  it('cache persiste: segunda chamada não faz novo fetch', async () => {
    fetchFails();
    await loadSecrets();
    await loadSecrets(); // segunda chamada

    expect(mockFetch).toHaveBeenCalledTimes(1); // fetch só na primeira
  });
});

// ── Modo Plaintext ────────────────────────────────────────────

describe('loadSecrets — modo plaintext', () => {
  it('carrega secrets e os expõe via getSecret()', async () => {
    fetchPlaintext({ SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_ANON_KEY: 'key123' });

    const result = await loadSecrets();

    expect(result.success).toBe(true);
    expect(getSecret('SUPABASE_URL')).toBe('https://abc.supabase.co');
    expect(getSecret('SUPABASE_ANON_KEY')).toBe('key123');
  });

  it('getSecret retorna fallback para chave inexistente', async () => {
    fetchPlaintext({ SUPABASE_URL: 'https://abc.supabase.co' });
    await loadSecrets();

    expect(getSecret('NAO_EXISTE', 'fallback-value')).toBe('fallback-value');
  });
});

// ── clearSecrets ──────────────────────────────────────────────

describe('clearSecrets', () => {
  it('apaga o cache — getSecret retorna vazio após limpar', async () => {
    fetchPlaintext({ SUPABASE_URL: 'https://abc.supabase.co' });
    await loadSecrets();

    clearSecrets();

    expect(getSecret('SUPABASE_URL')).toBe('');
  });

  it('após clearSecrets, loadSecrets faz novo fetch', async () => {
    fetchPlaintext({ SUPABASE_URL: 'https://abc.supabase.co' });
    await loadSecrets();
    clearSecrets();

    fetchPlaintext({ SUPABASE_URL: 'https://def.supabase.co' }); // novo mock
    await loadSecrets();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(getSecret('SUPABASE_URL')).toBe('https://def.supabase.co');
  });
});

// ── Modo Criptografado ────────────────────────────────────────

describe('loadSecrets — modo criptografado (AES-256-GCM)', () => {
  const PIN   = '123456';
  const WRONG = '000000';
  const PLAIN = { SUPABASE_URL: 'https://secure.supabase.co', SUPABASE_ANON_KEY: 'anon-key' };

  it('retorna needsPin:true quando PIN não é fornecido', async () => {
    const encrypted = await encryptSecrets(PIN, PLAIN);
    mockFetch.mockResolvedValue({ ok: true, json: async () => encrypted });

    const result = await loadSecrets(); // sem PIN

    expect(result.needsPin).toBe(true);
    expect(result.success).toBeFalsy();
  });

  it('decripta com PIN correto → success:true e cache populado', async () => {
    const encrypted = await encryptSecrets(PIN, PLAIN);
    mockFetch.mockResolvedValue({ ok: true, json: async () => encrypted });

    const result = await loadSecrets(PIN);

    expect(result.success).toBe(true);
    expect(getSecret('SUPABASE_URL')).toBe('https://secure.supabase.co');
  });

  it('PIN incorreto → success:false com mensagem de erro', async () => {
    const encrypted = await encryptSecrets(PIN, PLAIN);
    mockFetch.mockResolvedValue({ ok: true, json: async () => encrypted });

    const result = await loadSecrets(WRONG);

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(getSecret('SUPABASE_URL')).toBe(''); // nada no cache
  });

  it('PIN incorreto não popula cache', async () => {
    const encrypted = await encryptSecrets(PIN, PLAIN);
    mockFetch.mockResolvedValue({ ok: true, json: async () => encrypted });

    await loadSecrets(WRONG); // falha

    expect(getSecret('SUPABASE_URL')).toBe('');
  });
});
