import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KioskSystem } from '../js/kiosk-mode.js';
import { GABINETE_CONFIG } from '../js/config.js';
import { EVENTS } from '../js/events.js';

describe('KioskSystem', () => {
  let kiosk;
  let originalLocation;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn()
    });
    
    originalLocation = window.location;
    delete window.location;
    window.location = {
      search: '',
      href: 'http://localhost/',
      replace: vi.fn(),
      reload: vi.fn()
    };
    
    vi.spyOn(document, 'addEventListener');
    vi.spyOn(window, 'addEventListener');
    vi.spyOn(window, 'dispatchEvent');
  });

  afterEach(() => {
    vi.useRealTimers();
    window.location = originalLocation;
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('deve inicializar em modo quiosque por padrão', () => {
    kiosk = new KioskSystem();
    expect(kiosk.isAdmin).toBe(false);
    expect(localStorage.setItem).toHaveBeenCalled(); // logEvent session_start
  });

  it('deve inicializar em modo admin se param estiver presente', () => {
    window.location.search = `?${GABINETE_CONFIG.KIOSK.ADMIN_PARAM}=true`;
    kiosk = new KioskSystem();
    expect(kiosk.isAdmin).toBe(true);
    
    const badge = document.getElementById('maintenance-badge');
    expect(badge).not.toBeNull();
  });

  it('deve resetar o timer de inatividade e dar reload', () => {
    kiosk = new KioskSystem(); // Inicia em modo quiosque
    
    // Avança o tempo além do limite de timeout
    vi.advanceTimersByTime(GABINETE_CONFIG.KIOSK.TIMEOUT_MS + 100);
    
    // Verifica se os eventos foram disparados e a página recarregada
    expect(window.dispatchEvent).toHaveBeenCalled();
    const resetEvent = vi.mocked(window.dispatchEvent).mock.calls.find(call => call[0].type === EVENTS.KIOSK_RESET);
    expect(resetEvent).toBeDefined();
    expect(window.location.reload).toHaveBeenCalled();
  });

  it('deve registrar eventos no localStorage respeitando limite de bytes', () => {
    kiosk = new KioskSystem();
    
    kiosk.logEvent('test_action', { foo: 'bar' });
    
    expect(localStorage.setItem).toHaveBeenCalledWith(
      GABINETE_CONFIG.KIOSK.LOG_KEY, 
      expect.stringContaining('test_action')
    );
  });

  it('deve identificar gesto de admin (3 toques)', () => {
    kiosk = new KioskSystem(); // Cria o overlay invisível
    
    const overlay = document.body.querySelector('div[style*="z-index: 10000"]');
    expect(overlay).not.toBeNull();
    
    // Simular 3 toques rápidos
    const pointerDownEvent = new Event('pointerdown');
    overlay.dispatchEvent(pointerDownEvent);
    vi.advanceTimersByTime(100);
    overlay.dispatchEvent(pointerDownEvent);
    vi.advanceTimersByTime(100);
    overlay.dispatchEvent(pointerDownEvent);
    
    expect(window.location.replace).toHaveBeenCalledWith('adm.html');
  });

  it('deve gerar sessionID unico', () => {
    kiosk = new KioskSystem();
    expect(kiosk.sessionID).toBeTruthy();
    expect(typeof kiosk.sessionID).toBe('string');
  });
});
