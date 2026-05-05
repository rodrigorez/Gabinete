import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  initSupabase, 
  isSupabaseReady, 
  uploadAsset, 
  downloadAsset, 
  listAssets, 
  deleteAsset, 
  getPublicUrl 
} from '../js/supabase-client.js';
import * as secretsLoader from '../js/secrets-loader.js';

vi.mock('../js/secrets-loader.js', () => ({
  getSecret: vi.fn()
}));

describe('Supabase Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  it('deve retornar false se secrets não existirem', () => {
    secretsLoader.getSecret.mockReturnValue(null);
    expect(initSupabase()).toBe(false);
    expect(isSupabaseReady()).toBe(false);
  });

  it('deve inicializar com sucesso', () => {
    secretsLoader.getSecret.mockImplementation((key) => {
      if (key === 'SUPABASE_URL') return 'https://test.supabase.co';
      if (key === 'SUPABASE_ANON_KEY') return 'test_key';
    });
    
    expect(initSupabase()).toBe(true);
    expect(isSupabaseReady()).toBe(true);
  });

  it('getPublicUrl deve formatar a url corretamente', () => {
    secretsLoader.getSecret.mockImplementation((key) => {
      if (key === 'SUPABASE_URL') return 'https://test.supabase.co';
      if (key === 'SUPABASE_ANON_KEY') return 'test_key';
    });
    initSupabase();

    const url = getPublicUrl('models/cube.glb');
    expect(url).toBe('https://test.supabase.co/storage/v1/object/public/gabinete-assets/models/cube.glb');
  });

  it('uploadAsset deve falhar se fetch retornar erro HTTP', async () => {
    secretsLoader.getSecret.mockImplementation((key) => {
      if (key === 'SUPABASE_URL') return 'https://test.supabase.co';
      if (key === 'SUPABASE_ANON_KEY') return 'test_key';
    });
    initSupabase();

    globalThis.fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: () => Promise.resolve({ error: 'Erro de validação' })
    });

    const file = new File(['data'], 'test.png', { type: 'image/png' });
    const result = await uploadAsset('img/test.png', file);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Erro de validação');
  });

  it('uploadAsset deve fazer post corretamente com formdata', async () => {
    secretsLoader.getSecret.mockImplementation((key) => {
      if (key === 'SUPABASE_URL') return 'https://test.supabase.co';
      if (key === 'SUPABASE_ANON_KEY') return 'test_key';
    });
    initSupabase();

    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ url: 'http://upload/ok' })
    });

    const blob = new Blob(['data']);
    const result = await uploadAsset('img/test.png', blob, 'image/png');

    expect(result.success).toBe(true);
    expect(result.url).toBe('http://upload/ok');
    
    // Confirma FormData
    const fetchArgs = globalThis.fetch.mock.calls[0];
    expect(fetchArgs[0]).toContain('path=img%2Ftest.png');
    expect(fetchArgs[1].method).toBe('POST');
    expect(fetchArgs[1].body).toBeInstanceOf(FormData);
  });

  it('downloadAsset deve baixar blob do storage public', async () => {
    secretsLoader.getSecret.mockImplementation((key) => {
      if (key === 'SUPABASE_URL') return 'https://test.supabase.co';
      if (key === 'SUPABASE_ANON_KEY') return 'test_key';
    });
    initSupabase();

    const mockBlob = new Blob(['123']);
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      blob: () => Promise.resolve(mockBlob)
    });

    const result = await downloadAsset('img/test.png');

    expect(result.success).toBe(true);
    expect(result.blob).toBe(mockBlob);
  });

  it('listAssets deve parsear o json e mapear size', async () => {
    secretsLoader.getSecret.mockImplementation((key) => {
      if (key === 'SUPABASE_URL') return 'https://test.supabase.co';
      if (key === 'SUPABASE_ANON_KEY') return 'test_key';
    });
    initSupabase();

    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([
        { name: 'file1.jpg', metadata: { size: 1024 } },
        { name: 'file2.jpg' } // sem size
      ])
    });

    const result = await listAssets('img/');

    expect(result.success).toBe(true);
    expect(result.files).toHaveLength(2);
    expect(result.files[0].size).toBe(1024);
    expect(result.files[1].size).toBe(0);
  });

  it('deleteAsset deve enviar método DELETE', async () => {
    secretsLoader.getSecret.mockImplementation((key) => {
      if (key === 'SUPABASE_URL') return 'https://test.supabase.co';
      if (key === 'SUPABASE_ANON_KEY') return 'test_key';
    });
    initSupabase();

    globalThis.fetch.mockResolvedValueOnce({
      ok: true
    });

    const result = await deleteAsset('img/test.png');

    expect(result.success).toBe(true);
    const fetchArgs = globalThis.fetch.mock.calls[0];
    expect(fetchArgs[1].method).toBe('DELETE');
  });

  it('deve lidar com exception no fetch', async () => {
    secretsLoader.getSecret.mockImplementation((key) => {
      if (key === 'SUPABASE_URL') return 'https://test.supabase.co';
      if (key === 'SUPABASE_ANON_KEY') return 'test_key';
    });
    initSupabase();

    globalThis.fetch.mockRejectedValueOnce(new Error('Network Error'));

    const result = await listAssets('img/');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Network Error');
  });
});
