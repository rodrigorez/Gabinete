// @ts-check
/// <reference path="./types.d.ts" />
/* global AFRAME, THREE */
import { EVENTS } from './events.js';
import { GABINETE_CONFIG } from './config.js';
import { kiosk } from './kiosk-mode.js';
import { nav } from './navigation.js';
import { appState } from './app-state.js';

/**
 * Registro de Componentes e Sistemas customizados do A-Frame.
 * Segue a Regra Pétrea 3: Encapsulamento A-Frame.
 *
 * Correções aplicadas:
 *  - P2:  Substitui window.__GABINETE_SECURE_CONFIG por appState.findObject()
 *  - P8:  gltf-part-animation sem timeout frágil — usa model-loaded + check síncrono
 *  - P9:  hardware-profiler implementado: detecção de GPU real + monitor FPS adaptativo
 */

// ---------------------------------------------------------------------------
// hardware-profiler (P9: implementação real)
// ---------------------------------------------------------------------------
AFRAME.registerComponent('hardware-profiler', {
  schema: {
    enabled: { type: 'boolean', default: true }
  },

  init: function () {
    if (!this.data.enabled) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === 'true') {
      this.el.setAttribute('stats', '');
      console.log('📈 Hardware Profiler: Stats do A-Frame ativadas.');
    }

    // 1. Detecção de GPU via WebGL debug extension
    const canvas = document.createElement('canvas');
    const gl = /** @type {WebGLRenderingContext|null} */ (
      canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    );
    let isSoftware = false;

    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : 'unknown';

      isSoftware = /SwiftShader|llvmpipe|Software|Microsoft Basic/i.test(renderer);
      console.log(`🖥️ GPU detectada: ${renderer} | Software: ${isSoftware}`);

      if (isSoftware) {
        console.warn('⚠️ GPU por software detectada. Aplicando modo baixo consumo.');
        this._applyLowEndMode();
      }

      window.dispatchEvent(new CustomEvent(EVENTS.HARDWARE_PROFILE_CHANGED, {
        detail: { renderer, isSoftware }
      }));
    }
    canvas.remove();

    // 2. Monitor de FPS adaptativo
    this._fpsHistory = [];
    this._lowFpsStrikes = 0;
    this._rafId = null;
    this._startFpsMonitor();
  },

  /** Aplica configurações de renderização low-end (Spec Técnica §5.1). */
  _applyLowEndMode: function () {
    this.el.setAttribute('renderer', 'precision: lowp; antialias: false; alpha: false');
    const cvs = /** @type {HTMLCanvasElement|null} */ (document.querySelector('canvas'));
    if (cvs) cvs.style.imageRendering = 'pixelated';
  },

  /** Monitor FPS com janela de amostragem — reduz DPR se médio < LOW_PRECISION_FPS. */
  _startFpsMonitor: function () {
    const { LOW_PRECISION_FPS, ADAPTIVE_QUALITY_MIN_DPI, FPS_SAMPLE_INTERVAL_MS, FPS_STRIKE_LIMIT } = GABINETE_CONFIG.HARDWARE;
    let frames = 0;
    let lastTime = performance.now();

    const measure = () => {
      frames++;
      const now = performance.now();

      if (now - lastTime >= FPS_SAMPLE_INTERVAL_MS) {
        const fps = frames / ((now - lastTime) / 1000);
        this._fpsHistory.push(fps);
        if (this._fpsHistory.length > FPS_STRIKE_LIMIT + 1) this._fpsHistory.shift();

        const avgFps = this._fpsHistory.reduce((a, b) => a + b, 0) / this._fpsHistory.length;

        if (avgFps < LOW_PRECISION_FPS) {
          this._lowFpsStrikes++;
          if (this._lowFpsStrikes >= FPS_STRIKE_LIMIT) {
            const currentDPR = this.el.renderer.getPixelRatio();
            const newDPR = Math.max(currentDPR - 0.25, ADAPTIVE_QUALITY_MIN_DPI);
            if (newDPR < currentDPR) {
              this.el.renderer.setPixelRatio(newDPR);
              console.warn(`⚡ FPS baixo (${avgFps.toFixed(1)}fps). DPR reduzido: ${currentDPR.toFixed(2)} → ${newDPR.toFixed(2)}`);
            }
          }
        } else {
          this._lowFpsStrikes = 0;
        }

        frames = 0;
        lastTime = now;
      }

      this._rafId = requestAnimationFrame(measure);
    };

    this._rafId = requestAnimationFrame(measure);
  },

  remove: function () {
    if (this._rafId) cancelAnimationFrame(this._rafId);
  }
});

// ---------------------------------------------------------------------------
// interactive-object
// ---------------------------------------------------------------------------
AFRAME.registerComponent('interactive-object', {
  schema: {
    id: { type: 'string', default: '' },
    name: { type: 'string', default: 'objeto-desconhecido' }
  },

  init: function () {
    this.el.classList.add('clickable');

    this.triggerClick = this.triggerClick.bind(this);
    this.onMouseEnter = this.onMouseEnter.bind(this);
    this.onMouseLeave = this.onMouseLeave.bind(this);

    this.el.addEventListener('click', this.triggerClick);
    this.el.addEventListener('mousedown', this.triggerClick);
    this.el.addEventListener('touchstart', this.triggerClick);
    this.el.addEventListener('mouseenter', this.onMouseEnter);
    this.el.addEventListener('mouseleave', this.onMouseLeave);
  },

  triggerClick: function () {
    const now = Date.now();
    if (this.lastClickTime && (now - this.lastClickTime) < 500) return;
    this.lastClickTime = now;

    console.log(`🖱️ Interação detectada em: ${this.data.id || this.data.name}`);

    kiosk.logEvent('click_object', { target: this.data.id });
    window.dispatchEvent(new CustomEvent(EVENTS.OBJ_CLICKED, { detail: this.data.id }));

    // Flash Cyan on Click in Debug mode
    // @ts-ignore
    if (window.GABINETE_DEBUG && this.lastHoveredDebugBox) {
       this.lastHoveredDebugBox.setAttribute('material', 'wireframe: true; color: #00ffff; opacity: 1; depthTest: false');
       setTimeout(() => {
           if (this.lastHoveredDebugBox) {
               this.lastHoveredDebugBox.setAttribute('material', 'wireframe: true; color: #ff00ff; opacity: 0.8; depthTest: false');
           }
       }, 300);
    }

    if (this.data.id) {
      // W2: appState.hasContent() — DRY, substituiu hasPanelContent duplicado
      if (!appState.hasContent(this.data.id)) {
        // Silent Mode: Anima as portas/gavetas diretamente sem sujar o Navigation Stack da UI
        const parentEl = document.getElementById(this.data.id);
        if (parentEl) {
           const allTargets = [parentEl, ...Array.from(parentEl.querySelectorAll('*'))];
           allTargets.forEach((child) => {
               if (!child.components) return;
               Object.keys(child.components).forEach(k => {
                   if (k.startsWith('gltf-part-animation')) {
                       // @ts-ignore
                       child.components[k].toggle();
                   }
               });
           });
        }
        return;
      }

      const currentView = nav.stack[nav.stack.length - 1];
      if (currentView === this.data.id) {
        nav.pop();
      } else {
        nav.push(this.data.id);
      }
    }
  },

  onMouseEnter: function (evt) {
    // Modo Debug: Destaca a caixa exata que foi tocada
    // @ts-ignore
    if (window.GABINETE_DEBUG && evt && evt.detail && evt.detail.intersection) {
      const hitEl = evt.detail.intersection.object.el;
      if (hitEl && hitEl.tagName.toLowerCase() === 'a-box') {
        hitEl.setAttribute('material', 'wireframe: true; color: #00ff00; opacity: 1; depthTest: false');
        this.lastHoveredDebugBox = hitEl;
      }
    }

    // W2: appState.hasContent() substitui hasPanelContent local duplicado
    if (!appState.hasContent(this.data.id)) return;
    const configObj = appState.findObject(this.data.id);

    let baseS = { x: 1, y: 1, z: 1 };

    if (configObj && configObj.scale) {
      const p = String(configObj.scale).split(' ').map(Number);
      if (p.length === 3 && !isNaN(p[0])) baseS = { x: p[0], y: p[1], z: p[2] };
    } else {
      baseS = this.el.getAttribute('scale') || { x: 1, y: 1, z: 1 };
    }

    this.el.setAttribute('animation__scale', {
      property: 'scale',
      to: `${baseS.x * 1.05} ${baseS.y * 1.05} ${baseS.z * 1.05}`,
      dur: 200,
      easing: 'easeOutQuad'
    });
  },

  onMouseLeave: function (evt) {
    // Modo Debug: Restaura a cor da caixa
    // @ts-ignore
    if (window.GABINETE_DEBUG && this.lastHoveredDebugBox) {
      this.lastHoveredDebugBox.setAttribute('material', 'wireframe: true; color: #ff00ff; opacity: 0.8; depthTest: false');
      this.lastHoveredDebugBox = null;
    }

    // W2: appState.hasContent() substitui hasPanelContent local duplicado
    if (!appState.hasContent(this.data.id)) return;
    const configObj = appState.findObject(this.data.id);

    let baseS = { x: 1, y: 1, z: 1 };

    if (configObj && configObj.scale) {
      const p = String(configObj.scale).split(' ').map(Number);
      if (p.length === 3 && !isNaN(p[0])) baseS = { x: p[0], y: p[1], z: p[2] };
    } else {
      baseS = this.el.getAttribute('scale') || { x: 1, y: 1, z: 1 };
    }

    this.el.setAttribute('animation__scale', {
      property: 'scale',
      to: `${baseS.x} ${baseS.y} ${baseS.z}`,
      dur: 200,
      easing: 'easeOutQuad'
    });
  },

  remove: function () {
    this.el.removeEventListener('click', this.triggerClick);
    this.el.removeEventListener('mousedown', this.triggerClick);
    this.el.removeEventListener('touchstart', this.triggerClick);
    this.el.removeEventListener('mouseenter', this.onMouseEnter);
    this.el.removeEventListener('mouseleave', this.onMouseLeave);
  }
});

// ---------------------------------------------------------------------------
// gltf-part-animation (P8: remove timeout frágil, usa model-loaded confiável)
// ---------------------------------------------------------------------------
AFRAME.registerComponent('gltf-part-animation', {
  multiple: true,
  schema: {
    partName: { type: 'string' },
    property: { type: 'string', default: 'rotation' },
    to: { type: 'string', default: '0 90 0' },
    dur: { type: 'number', default: 1000 }
  },

  init: function () {
    this.toggled = false;
    this.isAnimating = false;
    this.part = null;
    this.initialValue = new THREE.Vector3();

    this.findModel = this.findModel.bind(this);

    // Caso 1: Mesh já carregada sincronamente (componente inicializado depois do modelo)
    if (this.el.getObject3D('mesh')) {
      this.findModel();
      return;
    }

    // Caso 2: Aguarda carregamento no próprio elemento
    this.el.addEventListener('model-loaded', this.findModel);

    // Caso 3: Modelo está no pai (GLTF composto)
    const parent = /** @type {any} */ (this.el.parentElement);
    if (parent && parent.getAttribute && parent.getAttribute('gltf-model')) {
      if (parent.getObject3D && parent.getObject3D('mesh')) {
        this.findModel(); // Pai já carregado
      } else {
        // @ts-ignore — campo dinâmico do A-Frame component
        this._parentListener = this.findModel;
        parent.addEventListener('model-loaded', this._parentListener);
      }
    }
  },

  findModel: function () {
    let targetEl = this.el;
    let model = targetEl.getObject3D('mesh');

    if (!model && this.el.parentElement) {
      targetEl = /** @type {any} */ (this.el.parentElement);
      model = targetEl.getObject3D('mesh');
    }

    if (model) {
      this.part = model.getObjectByName(this.data.partName);

      if (this.part) {
        console.log(`✅ Parte encontrada: ${this.data.partName}`);
        this.initialValue.copy(this.part[this.data.property]);
      } else {
        /** @type {string[]} */
        const allNames = [];
        model.traverse((/** @type {any} */ node) => {
          if (node.name) allNames.push(node.name);
          if (node.name === this.data.partName) {
            this.part = node;
            console.log(`🎯 Parte encontrada via traverse: ${this.data.partName}`);
            this.initialValue.copy(this.part[this.data.property]);
          }
        });

        if (!this.part) {
          console.warn(`❌ Parte '${this.data.partName}' não encontrada. Disponíveis:`, allNames.join(', '));
        }
      }
    }
  },

  toggle: function () {
    console.log(`🔄 gltf-part-animation: toggle() chamado para '${this.data.partName}'`);
    if (!this.part) {
      console.error(`❌ Não é possível animar: parte '${this.data.partName}' não vinculada. Model carregado?`, !!this.el.getObject3D('mesh'));
      return;
    }
    if (this.isAnimating) {
      console.warn(`⏳ Parte '${this.data.partName}' já animando. Ignorando.`);
      return;
    }

    this.isAnimating = true;
    this.toggled = !this.toggled;

    const target = { x: this.initialValue.x, y: this.initialValue.y, z: this.initialValue.z };
    console.log(`📊 toggle() data.to é: '${this.data.to}'. property: ${this.data.property}`);

    if (this.toggled) {
      if (this.data.to.includes(':')) {
        const parts = this.data.to.split(':');
        const axis = parts[0];
        const val = Number(parts[1]);
        target[axis] = THREE.MathUtils.degToRad(val);
      } else {
        // Fallback for legacy format '0 0 -90'
        const parts = this.data.to.split(' ').map(Number);
        target.x = THREE.MathUtils.degToRad(parts[0]);
        target.y = THREE.MathUtils.degToRad(parts[1]);
        target.z = THREE.MathUtils.degToRad(parts[2]);
      }
    }

    AFRAME.ANIME({
      targets: this.part.rotation,
      x: target.x, y: target.y, z: target.z,
      duration: this.data.dur,
      easing: 'easeInOutQuad',
      complete: () => { this.isAnimating = false; }
    });
  },

  remove: function () {
    this.el.removeEventListener('model-loaded', this.findModel);
    const parent = this.el.parentElement;
    // @ts-ignore — campo dinâmico do A-Frame component
    if (parent && this._parentListener) {
      parent.removeEventListener('model-loaded', this._parentListener);
    }
    // Deep WebGL Disposal (Regra 9)
    if (this.part && this.part.material) {
      if (this.part.material.map) this.part.material.map.dispose();
      this.part.material.dispose();
    }
    if (this.part && this.part.geometry) {
      this.part.geometry.dispose();
    }
  }
});

// ---------------------------------------------------------------------------
// animated-object (P1: componente fantasma — agora registrado)
// ---------------------------------------------------------------------------
AFRAME.registerComponent('animated-object', {
  schema: {
    id: { type: 'string', default: '' },
    property: { type: 'string', default: 'rotation' },
    to: { type: 'string', default: '0 90 0' },
    dur: { type: 'number', default: 1000 }
  },

  init: function () {
    this.toggled = false;
    this.isAnimating = false;
    const prop = this.el.object3D[this.data.property];
    this.initialValue = { x: prop.x, y: prop.y, z: prop.z };
  },

  toggle: function () {
    if (this.isAnimating) return;
    this.isAnimating = true;
    this.toggled = !this.toggled;

    const target = { x: this.initialValue.x, y: this.initialValue.y, z: this.initialValue.z };

    if (this.toggled) {
      const parts = this.data.to.split(' ').map(Number);
      const isRotation = this.data.property === 'rotation';
      target.x = isRotation ? THREE.MathUtils.degToRad(parts[0]) : parts[0];
      target.y = isRotation ? THREE.MathUtils.degToRad(parts[1]) : parts[1];
      target.z = isRotation ? THREE.MathUtils.degToRad(parts[2]) : parts[2];
    }

    AFRAME.ANIME({
      targets: this.el.object3D[this.data.property],
      x: target.x, y: target.y, z: target.z,
      duration: this.data.dur,
      easing: 'easeInOutQuad',
      complete: () => { this.isAnimating = false; }
    });
  },

  remove: function () {
    // Cleanup: entidade gerenciada pelo A-Frame, sem recursos extras
  }
});
