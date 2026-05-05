import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hashBuffer, hashBlob, hashString, hashMultiple } from '../js/hash-engine.js';

describe('Hash Engine', () => {
  const originalCrypto = globalThis.crypto;

  beforeEach(() => {
    vi.stubGlobal('crypto', { ...originalCrypto });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('FNV-1a Fallback', () => {
    beforeEach(() => {
      // Forçar fallback removendo subtle
      vi.stubGlobal('crypto', { subtle: undefined });
    });

    it('deve usar fallback FNV-1a para hashBuffer', async () => {
      const buffer = new Uint8Array([1, 2, 3]).buffer;
      const hash = await hashBuffer(buffer);
      expect(hash).toMatch(/^fnv1a_[0-9a-f]{8}$/);
    });

    it('deve calcular hashes consistentes usando fallback', async () => {
      const hash1 = await hashString('Teste FNV-1a');
      const hash2 = await hashString('Teste FNV-1a');
      const hash3 = await hashString('Diferente');
      
      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
    });
  });

  describe('Web Crypto API (SHA-256)', () => {
    beforeEach(() => {
      vi.stubGlobal('crypto', {
        subtle: {
          digest: vi.fn().mockResolvedValue(new Uint8Array([255, 0, 15]).buffer)
        }
      });
    });

    it('deve usar SHA-256 para hashBuffer', async () => {
      const buffer = new Uint8Array([1, 2, 3]).buffer;
      const hash = await hashBuffer(buffer);
      
      expect(crypto.subtle.digest).toHaveBeenCalledWith('SHA-256', buffer);
      expect(hash).toBe('ff000f'); // 255 -> ff, 0 -> 00, 15 -> 0f
    });

    it('deve calcular hash de Blob', async () => {
      const buffer = new Uint8Array([1, 2, 3]).buffer;
      const mockBlob = {
        arrayBuffer: vi.fn().mockResolvedValue(buffer)
      };
      
      const hash = await hashBlob(mockBlob);
      
      expect(mockBlob.arrayBuffer).toHaveBeenCalled();
      expect(crypto.subtle.digest).toHaveBeenCalledWith('SHA-256', buffer);
      expect(hash).toBe('ff000f');
    });

    it('deve calcular hash de Múltiplos Arquivos em Lotes', async () => {
      const mockBlob1 = { arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1]).buffer) };
      const mockBlob2 = { arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([2]).buffer) };
      const mockBlob3 = { arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([3]).buffer) };
      const mockBlob4 = { arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([4]).buffer) };
      const mockBlob5 = { arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([5]).buffer) };

      const files = [
        { path: 'f1', blob: mockBlob1 },
        { path: 'f2', blob: mockBlob2 },
        { path: 'f3', blob: mockBlob3 },
        { path: 'f4', blob: mockBlob4 },
        { path: 'f5', blob: mockBlob5 },
      ];

      const onProgress = vi.fn();
      const results = await hashMultiple(files, onProgress);

      expect(results).toHaveProperty('f1', 'ff000f');
      expect(results).toHaveProperty('f5', 'ff000f');
      expect(onProgress).toHaveBeenCalledTimes(5);
      expect(onProgress).toHaveBeenLastCalledWith(5, 5);
    });
  });
});
