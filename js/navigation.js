// @ts-check
import { EVENTS } from './events.js';
import { kiosk } from './kiosk-mode.js';

/**
 * Gerenciador de Pilha de Navegação (StackManager).
 * Controla a exibição entre a cena 3D e os painéis informativos.
 */

class NavigationManager {
  constructor() {
    this.stack = ['scene']; // Cena 3D é a base
    this.backButton = null;
  }

  init() {
    this.setupUI();
  }

  setupUI() {
    // BOTÃO VISUAL REMOVIDO: Kiosks usam sistema modal invisível (clique fora do modal)
    this.backButton = null;

    // Nova feature sugerida: Fechar o painel (voltar) ao clicar na área fora dele (Fundo 3D)
    window.addEventListener('pointerdown', (/** @type {any} */ e) => {
      if (this.stack.length <= 1) return;
      
      // Se clicou no canvas, verificamos se o cursor do A-Frame atingiu algo interativo
      if (e.target && e.target.tagName && e.target.tagName.toLowerCase() === 'canvas') {
        const scene = document.querySelector('a-scene');
        if (scene) {
            // @ts-ignore
            const cursor = scene.components.cursor;
            // Só faz o Pop se o clique foi no "vazio" (nada intersectado)
            if (cursor && !cursor.intersectedEl) {
                this.pop();
            }
        }
      }
    });

  }

  updateButtonText() {
    // Exemplo de como plugar i18n se importado
  }

  /**
   * Navega para uma nova visualização (Painel).
   * @param {string} viewId
   */
  push(viewId) {
    // Evita duplicatas no topo da pilha
    if (this.stack[this.stack.length - 1] === viewId) return;

    console.log(`🚀 Navigation: Push para ${viewId}`);
    this.stack.push(viewId);
    this.updateVisibility();
    
    // Log Seguro via Import
    kiosk.logEvent("navigation_push", { target: viewId });
    // Emissão Estrita
    window.dispatchEvent(new CustomEvent(EVENTS.UI_PUSH, { detail: viewId }));
  }

  /**
   * Retorna para a visualização anterior.
   */
  pop() {
    if (this.stack.length > 1) {
      const viewId = this.stack.pop();
      console.log(`🔙 Navigation: Pop de ${viewId}`);
      this.updateVisibility();
      
      kiosk.logEvent("navigation_pop", { target: viewId });
      window.dispatchEvent(new CustomEvent(EVENTS.UI_POP, { detail: viewId }));
    }
  }

  /**
   * Fecha tudo e volta para a cena 3D imediatamente.
   */
  reset() {
    console.log(`🏠 Navigation: Reset para Scene`);
    // W5: Registra as views fechadas para rastreabilidade nos logs do museu
    const closed = this.stack.filter(v => v !== 'scene');
    this.stack = ['scene'];
    this.updateVisibility();
    kiosk.logEvent('navigation_reset', { closed });
  }

  updateVisibility() {
    const current = this.stack[this.stack.length - 1];

    // A index.html (no main.js) vai escutar isso para re-renderizar o painel
    window.dispatchEvent(new CustomEvent(EVENTS.VIEW_CHANGED, { detail: current }));
  }
}

/** Objeto Singleton gerencial (Falso modular alertado no Audit 1 corrigido) */
export const nav = new NavigationManager();
