import { describe, it, expect } from 'vitest';
import { EVENTS } from '../js/events.js';

describe('Events Constants', () => {
  it('deve conter as propriedades requeridas', () => {
    expect(EVENTS).toHaveProperty('KIOSK_RESET');
    expect(EVENTS).toHaveProperty('UI_PUSH');
    expect(EVENTS).toHaveProperty('UI_POP');
    expect(EVENTS).toHaveProperty('SCENE_LOADED');
    expect(EVENTS).toHaveProperty('ASSET_ERROR');
  });

  it('deve ser imutável (Object.isFrozen)', () => {
    expect(Object.isFrozen(EVENTS)).toBe(true);
  });
});
