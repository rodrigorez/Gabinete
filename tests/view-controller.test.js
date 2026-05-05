import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { viewController } from '../js/view-controller.js';
import { stateManager } from '../js/state-manager.js';
import { cameraRig } from '../js/camera-rig.js';
import { spatialTracker } from '../js/spatial-tracker.js';
import { uiPanel } from '../js/ui-panel.js';
import { appState } from '../js/app-state.js';

vi.mock('../js/state-manager.js', () => ({
  stateManager: {
    isTransitioning: vi.fn(),
    setTransitioning: vi.fn(),
    setIdle: vi.fn(),
    getCameraState: vi.fn(),
    clearCameraState: vi.fn(),
    saveCameraState: vi.fn(),
    saveInteractionState: vi.fn(),
    lastPanelConfig: {},
    lastParentEl: null
  }
}));

vi.mock('../js/camera-rig.js', () => ({
  cameraRig: { animate: vi.fn() }
}));

vi.mock('../js/spatial-tracker.js', () => ({
  spatialTracker: { track: vi.fn() }
}));

vi.mock('../js/ui-panel.js', () => ({
  uiPanel: {
    toggleVisibility: vi.fn(),
    completeHide: vi.fn(),
    loadContent: vi.fn(),
    elements: { panel: document.createElement('div') }
  }
}));

vi.mock('../js/app-state.js', () => ({
  appState: { findObject: vi.fn() }
}));

describe('View Controller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    document.body.innerHTML = '';
    
    // Mock THREE
    globalThis.THREE = {
      Vector3: class {
        constructor(x=0, y=0, z=0) { this.x = x; this.y = y; this.z = z; }
        applyMatrix4() {}
      },
      Object3D: class {
        constructor() { 
          this.position = { copy: vi.fn() };
          this.rotation = { y: 0 };
        }
        lookAt() {}
      }
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('deve abortar se já estiver em transição', () => {
    stateManager.isTransitioning.mockReturnValue(true);
    viewController.handle('scene');
    expect(stateManager.setTransitioning).not.toHaveBeenCalled();
  });

  it('deve fechar painel e resetar câmera quando handle("scene") for chamado', () => {
    stateManager.isTransitioning.mockReturnValue(false);
    stateManager.getCameraState.mockReturnValue({ pos: {x:0, y:0, z:0}, rot: {x:0, y:0, z:0} });
    
    // Chamar fluxo de fechamento
    viewController.handle('scene');
    
    expect(stateManager.setTransitioning).toHaveBeenCalled();
    expect(cameraRig.animate).toHaveBeenCalled();
    expect(stateManager.clearCameraState).toHaveBeenCalled();
    expect(uiPanel.toggleVisibility).toHaveBeenCalledWith(false);
    
    // Acionar callback do animate
    const animCallback = cameraRig.animate.mock.calls[0][3];
    animCallback();
    expect(stateManager.setIdle).toHaveBeenCalled();
    
    // Avançar timers para limpar a UI
    vi.advanceTimersByTime(1000);
    expect(uiPanel.completeHide).toHaveBeenCalled();
    expect(stateManager.saveInteractionState).toHaveBeenCalledWith(null, null);
  });

  it('deve abrir painel de objeto com sucesso', () => {
    stateManager.isTransitioning.mockReturnValue(false);
    stateManager.getCameraState.mockReturnValue(null); // Simular ausência de estado guardado para salvar

    // Objeto fictício
    const mockObj = { panel: { description: 'test' } };
    appState.findObject.mockReturnValue(mockObj);

    // Mock DOM
    const parentEl = document.createElement('a-entity');
    parentEl.id = 'obj1';
    parentEl.object3D = {
      matrixWorld: {},
      getWorldPosition: vi.fn()
    };
    document.body.appendChild(parentEl);

    const cameraEl = document.createElement('a-entity');
    cameraEl.setAttribute('camera', '');
    cameraEl.components = {};
    cameraEl.object3D = { position: {x:0, y:0, z:0}, rotation: {x:0, y:0, z:0} };
    document.body.appendChild(cameraEl);

    viewController.handle('obj1');

    expect(appState.findObject).toHaveBeenCalledWith('obj1');
    expect(stateManager.saveCameraState).toHaveBeenCalled();
    expect(cameraRig.animate).toHaveBeenCalled();
    expect(stateManager.saveInteractionState).toHaveBeenCalledWith(parentEl, mockObj.panel);
    expect(uiPanel.loadContent).toHaveBeenCalledWith(mockObj);
    expect(uiPanel.toggleVisibility).toHaveBeenCalledWith(true);
  });

  it('deve disparar animações gltf-part-animation nas portas/gavetas', () => {
    stateManager.isTransitioning.mockReturnValue(false);
    appState.findObject.mockReturnValue({});

    // Elemento principal e filho com componente de animação
    const parentEl = document.createElement('a-entity');
    parentEl.id = 'obj_door';
    
    const childEl = document.createElement('a-entity');
    childEl.components = {
      'gltf-part-animation__door': { toggle: vi.fn() }
    };
    parentEl.appendChild(childEl);
    document.body.appendChild(parentEl);

    viewController.handle('obj_door');
    
    // Verifica se _animateDoors acionou o toggle
    expect(childEl.components['gltf-part-animation__door'].toggle).toHaveBeenCalled();
    expect(childEl.getAttribute('gltf-part-animation__door')).toContain('dur');
  });

  it('deve lidar com objeto inexistente abortando a transição', () => {
    stateManager.isTransitioning.mockReturnValue(false);
    appState.findObject.mockReturnValue(null);

    viewController.handle('obj_inexistente');

    expect(stateManager.setIdle).toHaveBeenCalled();
    expect(cameraRig.animate).not.toHaveBeenCalled();
  });
});
