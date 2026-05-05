import { describe, it, expect, beforeEach } from 'vitest';
import { stateManager } from '../js/state-manager.js';

describe('StateManager', () => {
  beforeEach(() => {
    stateManager.setIdle();
    stateManager.clearCameraState();
    stateManager.saveInteractionState(null, null);
  });

  it('deve inicializar com IDLE', () => {
    expect(stateManager.currentState).toBe(stateManager.states.IDLE);
    expect(stateManager.isTransitioning()).toBe(false);
  });

  it('deve transitar para TRANSITIONING', () => {
    stateManager.setTransitioning();
    expect(stateManager.currentState).toBe(stateManager.states.TRANSITIONING);
    expect(stateManager.isTransitioning()).toBe(true);
  });

  it('deve retornar para IDLE', () => {
    stateManager.setTransitioning();
    stateManager.setIdle();
    expect(stateManager.currentState).toBe(stateManager.states.IDLE);
    expect(stateManager.isTransitioning()).toBe(false);
  });

  it('deve salvar e recuperar o estado da câmera', () => {
    const mockState = { position: '0 0 0', rotation: '0 0 0' };
    stateManager.saveCameraState(mockState);
    expect(stateManager.getCameraState()).toEqual(mockState);
  });

  it('deve limpar o estado da câmera', () => {
    stateManager.saveCameraState({ position: '1 1 1' });
    stateManager.clearCameraState();
    expect(stateManager.getCameraState()).toBeNull();
  });

  it('deve salvar o estado de interação', () => {
    const mockEl = document.createElement('div');
    const mockConfig = { id: 'test' };
    stateManager.saveInteractionState(mockEl, mockConfig);
    expect(stateManager.lastParentEl).toBe(mockEl);
    expect(stateManager.lastPanelConfig).toEqual(mockConfig);
  });
});
