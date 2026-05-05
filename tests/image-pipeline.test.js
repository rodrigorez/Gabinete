import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  processImage, 
  processMultipleImages, 
  generateVariantNames, 
  isWebPSupported, 
  getDefaultConfig 
} from '../js/image-pipeline.js';
import * as hashEngine from '../js/hash-engine.js';

vi.mock('../js/hash-engine.js', () => ({
  hashBlob: vi.fn().mockResolvedValue('mock_hash_123')
}));

describe('Image Pipeline', () => {
  beforeEach(() => {
    // Mock global objects for canvas and image
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    globalThis.URL.revokeObjectURL = vi.fn();
    
    // Mock HTMLImageElement
    globalThis.Image = class {
      constructor() {
        this.naturalWidth = 1024;
        this.naturalHeight = 768;
        setTimeout(() => this.onload(), 10);
      }
    };
    
    // Mock Canvas and Context
    const mockContext = {
      drawImage: vi.fn(),
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low'
    };
    
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') {
        return {
          getContext: vi.fn().mockReturnValue(mockContext),
          toBlob: vi.fn((callback) => callback(new Blob(['mock_webp_data'], { type: 'image/webp' }))),
          toDataURL: vi.fn().mockReturnValue('data:image/webp;base64,mock')
        };
      }
      return {};
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('deve retornar configuração padrão', () => {
    const config = getDefaultConfig();
    expect(config.highQuality).toBe(0.85);
    expect(config.lowQuality).toBe(0.60);
    expect(config.lowMaxDim).toBe(512);
  });

  it('deve validar se webp é suportado', () => {
    expect(isWebPSupported()).toBe(true);
  });

  it('deve gerar nomes de variantes corretamente', () => {
    const names = generateVariantNames('minha_foto.jpg');
    expect(names.high).toBe('minha_foto_high.webp');
    expect(names.low).toBe('minha_foto_low.webp');
  });

  it('deve falhar se arquivo for maior que maxUploadBytes', async () => {
    const hugeBlob = new Blob(['x'.repeat(51 * 1024 * 1024)]); // 51MB
    const result = await processImage(hugeBlob);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Arquivo muito grande');
  });

  it('deve processar uma imagem com sucesso (gerando high e low)', async () => {
    const blob = new Blob(['mock_image_data'], { type: 'image/jpeg' });
    const result = await processImage(blob);
    
    expect(result.success).toBe(true);
    expect(result.high).toBeDefined();
    expect(result.high.variant).toBe('high');
    expect(result.high.width).toBe(1024);
    expect(result.high.height).toBe(768);
    expect(result.high.sha256).toBe('mock_hash_123');
    
    expect(result.low).toBeDefined();
    expect(result.low.variant).toBe('low');
    expect(result.low.width).toBe(512); // Redimensionado baseado em lowMaxDim=512 (1024x768 -> 512x384)
    expect(result.low.height).toBe(384);
    
    expect(result.stats).toBeDefined();
  });

  it('deve processar múltiplas imagens', async () => {
    const files = [
      { name: 'img1.jpg', file: new Blob(['data1']) },
      { name: 'img2.png', file: new Blob(['data2']) }
    ];
    
    const onProgress = vi.fn();
    const results = await processMultipleImages(files, {}, onProgress);
    
    expect(results.length).toBe(2);
    expect(results[0].name).toBe('img1.jpg');
    expect(results[0].result.success).toBe(true);
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith(2, 2, 'img2.png');
  });

  it('deve lidar com erro se canvas falhar', async () => {
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') {
        return {
          getContext: vi.fn().mockReturnValue(null), // Simulando falha de contexto
          toBlob: vi.fn(),
        };
      }
      return {};
    });

    const blob = new Blob(['mock_image_data'], { type: 'image/jpeg' });
    const result = await processImage(blob);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Canvas 2D context não disponível');
  });
});
