import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nav } from '../js/navigation.js';
import { EVENTS } from '../js/events.js';
import { kiosk } from '../js/kiosk-mode.js';

vi.mock('../js/kiosk-mode.js', () => ({
  kiosk: {
    logEvent: vi.fn()
  }
}));

describe('NavigationManager', () => {
  beforeEach(() => {
    nav.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deve inicializar com stack apenas com scene', () => {
    expect(nav.stack).toEqual(['scene']);
  });

  it('deve fazer push de nova view e disparar evento', () => {
    const spyDispatch = vi.spyOn(window, 'dispatchEvent');
    
    nav.push('panel1');
    
    expect(nav.stack).toEqual(['scene', 'panel1']);
    expect(kiosk.logEvent).toHaveBeenCalledWith('navigation_push', { target: 'panel1' });
    expect(spyDispatch).toHaveBeenCalled();
    const pushEvent = spyDispatch.mock.calls.find(call => call[0].type === EVENTS.UI_PUSH);
    expect(pushEvent).toBeDefined();
    expect(pushEvent[0].detail).toBe('panel1');
  });

  it('não deve duplicar view no topo da pilha', () => {
    nav.push('panel1');
    nav.push('panel1');
    expect(nav.stack).toEqual(['scene', 'panel1']);
  });

  it('deve fazer pop e disparar evento', () => {
    const spyDispatch = vi.spyOn(window, 'dispatchEvent');
    
    nav.push('panel1');
    nav.pop();
    
    expect(nav.stack).toEqual(['scene']);
    expect(kiosk.logEvent).toHaveBeenCalledWith('navigation_pop', { target: 'panel1' });
    const popEvent = spyDispatch.mock.calls.find(call => call[0].type === EVENTS.UI_POP);
    expect(popEvent).toBeDefined();
    expect(popEvent[0].detail).toBe('panel1');
  });

  it('não deve fazer pop se estiver apenas na scene', () => {
    nav.pop();
    expect(nav.stack).toEqual(['scene']);
  });

  it('deve resetar a pilha', () => {
    nav.push('panel1');
    nav.push('panel2');
    nav.reset();
    expect(nav.stack).toEqual(['scene']);
    expect(kiosk.logEvent).toHaveBeenCalledWith('navigation_reset', {});
  });

  it('updateVisibility deve emitir evento VIEW_CHANGED com elemento do topo', () => {
    const spyDispatch = vi.spyOn(window, 'dispatchEvent');
    nav.push('panel1');
    
    const viewEvent = spyDispatch.mock.calls.find(call => call[0].type === EVENTS.VIEW_CHANGED);
    expect(viewEvent).toBeDefined();
    expect(viewEvent[0].detail).toBe('panel1');
  });
});
