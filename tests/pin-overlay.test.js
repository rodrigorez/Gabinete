import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { showPinOverlay } from '../js/pin-overlay.js';
import * as secretsLoader from '../js/secrets-loader.js';
import { GABINETE_CONFIG } from '../js/config.js';

vi.mock('../js/secrets-loader.js', () => ({
  loadSecrets: vi.fn()
}));

describe('Pin Overlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const flushPromises = async () => {
    // Flush microtasks in fake timers environment
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
    }
  };

  it('deve retornar success imediatamente se não precisar de PIN', async () => {
    secretsLoader.loadSecrets.mockResolvedValueOnce({ needsPin: false });

    const result = await showPinOverlay();

    expect(result.success).toBe(true);
    expect(document.querySelector('#pin-ov-form')).toBeNull();
  });

  it('deve exibir o formulário se precisar de PIN', async () => {
    secretsLoader.loadSecrets.mockResolvedValueOnce({ needsPin: true });

    const promise = showPinOverlay();
    await flushPromises();

    const form = document.querySelector('#pin-ov-form');
    expect(form).not.toBeNull();
    
    const input = document.querySelector('#pin-ov-input');
    const btn = document.querySelector('#pin-ov-btn');
    expect(input.disabled).toBe(false);
    expect(btn.disabled).toBe(false);
  });

  it('deve desbloquear a tela e resolver promise após PIN correto', async () => {
    secretsLoader.loadSecrets
      .mockResolvedValueOnce({ needsPin: true })
      .mockResolvedValueOnce({ success: true });

    const promise = showPinOverlay();
    await flushPromises();

    const form = document.querySelector('#pin-ov-form');
    const input = document.querySelector('#pin-ov-input');
    
    input.value = '1234';
    form.dispatchEvent(new Event('submit'));
    
    await flushPromises();
    const result = await promise;
    
    expect(result.success).toBe(true);
    expect(document.querySelector('#pin-ov-form')).toBeNull();
  });

  it('deve incrementar tentativas e bloquear temporariamente', async () => {
    secretsLoader.loadSecrets
      .mockResolvedValueOnce({ needsPin: true })
      .mockResolvedValue({ success: false }); 

    const originalAttempts = GABINETE_CONFIG.KIOSK.ADMIN_PIN_ATTEMPTS;
    GABINETE_CONFIG.KIOSK.ADMIN_PIN_ATTEMPTS = 3;

    showPinOverlay();
    await flushPromises();

    const form = document.querySelector('#pin-ov-form');
    const input = document.querySelector('#pin-ov-input');
    const err = document.querySelector('#pin-ov-err');

    // Tentativa 1
    input.value = '111';
    form.dispatchEvent(new Event('submit'));
    await flushPromises();
    expect(err.textContent).toContain('1/3');

    // Tentativa 2
    input.value = '111';
    form.dispatchEvent(new Event('submit'));
    await flushPromises();
    expect(err.textContent).toContain('2/3');

    // Tentativa 3 (Bloqueio)
    input.value = '111';
    form.dispatchEvent(new Event('submit'));
    await flushPromises();
    
    expect(input.disabled).toBe(true);

    GABINETE_CONFIG.KIOSK.ADMIN_PIN_ATTEMPTS = originalAttempts;
  });
});
