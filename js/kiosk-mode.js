// @ts-check
import { GABINETE_CONFIG } from './config.js';
import { EVENTS } from './events.js';

/**
 * Módulo de Segurança e Modo Quiosque / Manutenção.
 * Gerencia inatividade, gesto de admin, logs por bytes e modo manutenção.
 *
 * Fluxo de admin: gesto 3x no canto superior esquerdo → adm.html
 *   O PIN e rate-limiting estão no overlay inline do adm.html.
 *
 * - crypto.randomUUID() para session IDs seguros (sem Math.random)
 * - Purge de log por bytes reais (trigger em 4MB, não por quantidade)
 */

export class KioskSystem {
  constructor() {
    this.params = new URLSearchParams(window.location.search);
    this.isAdmin = this.params.get(GABINETE_CONFIG.KIOSK.ADMIN_PARAM) === 'true';
    this.sessionID = this._generateUUID();

    // Defer URL cleanup so other modules (dev-editor) can read ?admin during DOMContentLoaded
    if (this.isAdmin) {
      document.addEventListener('DOMContentLoaded', () => {
        const url = new URL(window.location.href);
        url.searchParams.delete(GABINETE_CONFIG.KIOSK.ADMIN_PARAM);
        window.history.replaceState({}, '', url);
      }, { once: true });
    }

    this.init();
  }

  init() {
    console.log(`🤖 Gabinete Virtual: Iniciado em modo ${this.isAdmin ? 'MANUTENÇÃO (ADMIN)' : 'QUIOSQUE'}`);

    if (!this.isAdmin) {
      this.setupKioskTimer();
      this.setupAdminGesture();
    } else {
      console.warn('⚠️ MODO MANUTENÇÃO ATIVO: Temporizadores e Bloqueios desativados.');
      this._showMaintenanceIndicator();
    }

    this.logEvent('session_start', { mode: this.isAdmin ? 'maintenance' : 'kiosk' });
  }

  /** Configura o timer de auto-reset por inatividade. */
  setupKioskTimer() {
    let timeout;
    const resetTimer = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        this.logEvent('session_reset', { reason: 'inactivity' });
        window.dispatchEvent(new CustomEvent(EVENTS.KIOSK_RESET));
        location.reload();
      }, GABINETE_CONFIG.KIOSK.TIMEOUT_MS);
    };

    ['mousedown', 'touchstart', 'mousemove', 'keydown'].forEach(evt => {
      window.addEventListener(evt, resetTimer, true);
    });

    resetTimer();
  }

  /**
   * Monitora o gesto secreto de 3 toques no canto superior esquerdo.
   * Navega para adm.html via location.replace() (sem entrada no histórico).
   * O PIN e rate-limiting ficam no overlay inline do adm.html.
   */
  setupAdminGesture() {
    let taps = 0;
    let lastTap = 0;
    const GESTO_AREA = GABINETE_CONFIG.KIOSK.ADMIN_GESTO_DIM;

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0;
      width: ${GESTO_AREA.width}; height: ${GESTO_AREA.height};
      z-index: 10000; cursor: pointer;
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('pointerdown', () => {
      const now = Date.now();
      if (now - lastTap < 500) {
        taps++;
      } else {
        taps = 1;
      }
      lastTap = now;

      if (taps >= 3) {
        taps = 0;
        console.log('🔑 Gesto de Admin detectado. Abrindo painel...');
        location.replace('adm.html'); // adm.html tem seu próprio PIN overlay
      }
    });
  }


  /**
   * Registra um evento no LocalStorage.
   * P6: Purge por tamanho em bytes (4MB), não por quantidade de itens.
   * @param {string} action
   * @param {Record<string, any>} meta
   */
  logEvent(action, meta = {}) {
    const key = GABINETE_CONFIG.KIOSK.LOG_KEY;
    let logs = JSON.parse(localStorage.getItem(key) ?? '[]');

    const event = {
      timestamp: new Date().toISOString(),
      sessionID: this.sessionID,
      action: this.isAdmin ? `[ADMIN] ${action}` : action,
      data: meta
    };

    logs.push(event);

    // Purge por bytes reais (Regra da Spec: trigger em 4MB)
    const MAX_BYTES = 4 * 1024 * 1024;
    let serialized = JSON.stringify(logs);
    while (serialized.length > MAX_BYTES && logs.length > 1) {
      logs.shift(); // Remove o registro mais antigo
      serialized = JSON.stringify(logs);
    }

    localStorage.setItem(key, serialized);
    this._checkStorageHealth();
  }

  /**
   * Verifica a saúde do LocalStorage e dispara alerta se próximo do limite.
   * P6: Emite evento 'gabinete:storage-warning' para o painel ADM.
   */
  _checkStorageHealth() {
    try {
      const total = new Blob([JSON.stringify(localStorage)]).size;
      const MAX_LS = 5 * 1024 * 1024; // 5MB estimado
      if (total / MAX_LS > 0.8) {
        console.warn(`⚠️ LocalStorage em ${((total / MAX_LS) * 100).toFixed(0)}% de capacidade.`);
        window.dispatchEvent(new CustomEvent(EVENTS.STORAGE_WARNING, {
          detail: { usageRatio: total / MAX_LS, bytesUsed: total }
        }));
      }
    } catch {
      // Blob pode falhar em contextos muito restritos — ignorar silenciosamente
    }
  }

  /** P3: UUID criptograficamente seguro. */
  _generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback para browsers muito antigos (improvável no cenário de museu)
    return 'session-' + Math.random().toString(36).substr(2, 9);
  }

  _showMaintenanceIndicator() {
    const badge = document.createElement('div');
    badge.id = 'maintenance-badge';
    badge.innerText = '🛠️ MODO MANUTENÇÃO';
    badge.style.cssText = `
      position: fixed; bottom: 10px; right: 10px;
      background: rgba(255,68,68,0.85); color: white;
      padding: 6px 14px; border-radius: 20px;
      font-family: sans-serif; font-size: 12px; font-weight: bold;
      z-index: 10001; pointer-events: none;
    `;
    document.body.appendChild(badge);
  }
}

/** Singleton exportável */
export const kiosk = new KioskSystem();
