// @ts-check

/**
 * pin-overlay.js — Overlay de PIN reutilizável para autenticação administrativa.
 *
 * - Rate-limiting lido de GABINETE_CONFIG (fonte única de verdade)
 * - Feedback de "Verificando..." durante PBKDF2 (sem congelar UI)
 * - Compatível com adm.html e curadoria-app.js
 *
 * @param {{ title?: string }} [opts]
 * @returns {Promise<{ success: boolean }>}  Resolve APENAS quando o PIN está correto.
 */

import { GABINETE_CONFIG } from './config.js';
import { loadSecrets } from './secrets-loader.js';

export async function showPinOverlay(opts = {}) {
  // Se secrets já estão em memória, não exibe overlay
  const check = await loadSecrets();
  if (!check.needsPin) return { success: true };

  return new Promise(resolve => {
    const MAX_ATTEMPTS = GABINETE_CONFIG.KIOSK.ADMIN_PIN_ATTEMPTS;
    const LOCKOUT_MS   = GABINETE_CONFIG.KIOSK.ADMIN_PIN_LOCKOUT_MS;
    const title        = /** @type {any} */ (opts).title ?? 'Acesso Administrativo';

    let attempts    = 0;
    let lockedUntil = 0;
    /** @type {ReturnType<typeof setInterval>|null} */
    let lockInterval = null;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:#0a0a0a;display:flex;align-items:center;justify-content:center;z-index:99999;font-family:Inter,sans-serif;';
    overlay.innerHTML = `
      <form id="pin-ov-form" style="background:#0d1117;border:1px solid #00D1FF;border-radius:16px;padding:32px 28px;width:320px;text-align:center;box-shadow:0 0 40px rgba(0,209,255,0.15);">
        <p style="color:#00D1FF;font-size:.7rem;letter-spacing:3px;margin:0 0 6px;text-transform:uppercase;">${title}</p>
        <h2 style="color:#fff;font-size:1rem;margin:0 0 20px;font-weight:600;">🔐 Digite o PIN</h2>
        <input id="pin-ov-input" type="password" maxlength="20" placeholder="PIN" autocomplete="current-password"
          style="width:100%;padding:12px;background:#111;border:1px solid #333;color:#fff;border-radius:8px;font-size:1.1rem;text-align:center;box-sizing:border-box;">
        <p id="pin-ov-err" style="color:#f44;font-size:.8rem;min-height:20px;margin:8px 0;"></p>
        <button id="pin-ov-btn" type="submit" style="width:100%;padding:12px;background:#00D1FF;color:#000;border:none;border-radius:8px;font-weight:700;font-size:.95rem;cursor:pointer;transition:opacity .15s;">
          Entrar
        </button>
      </form>
    `;
    document.body.appendChild(overlay);

    const form  = /** @type {HTMLFormElement}   */ (overlay.querySelector('#pin-ov-form'));
    const input = /** @type {HTMLInputElement}  */ (overlay.querySelector('#pin-ov-input'));
    const btn   = /** @type {HTMLButtonElement} */ (overlay.querySelector('#pin-ov-btn'));
    const err   = /** @type {HTMLElement}       */ (overlay.querySelector('#pin-ov-err'));

    /** @param {boolean} locked */
    function setLocked(locked) {
      input.disabled = btn.disabled = locked;
      btn.style.opacity    = locked ? '0.4' : '1';
      btn.style.cursor     = locked ? 'not-allowed' : 'pointer';
      input.style.opacity  = locked ? '0.5' : '1';
    }

    function startLockout() {
      setLocked(true);
      if (lockInterval) clearInterval(lockInterval);
      lockInterval = setInterval(() => {
        const rem = Math.ceil((lockedUntil - Date.now()) / 1000);
        if (rem <= 0) {
          clearInterval(/** @type {any} */ (lockInterval));
          lockInterval = null;
          attempts = 0;
          setLocked(false);
          btn.textContent = 'Entrar';
          err.textContent = '';
          input.focus();
        } else {
          err.textContent = `⛔ Bloqueado. Aguarde ${rem}s...`;
          err.style.color = '#f90';
        }
      }, 500);
    }

    async function tryPin() {
      if (Date.now() < lockedUntil) return;

      // Feedback imediato enquanto PBKDF2 executa (pode levar 1-3s em hardware fraco)
      btn.textContent = '🔄 Verificando...';
      setLocked(true);

      const r = await loadSecrets(input.value);

      if (r.success) {
        if (lockInterval) clearInterval(lockInterval);
        overlay.remove();
        resolve({ success: true });
      } else {
        attempts++;
        input.value = '';

        if (attempts >= MAX_ATTEMPTS) {
          lockedUntil = Date.now() + LOCKOUT_MS;
          startLockout();
        } else {
          setLocked(false);
          btn.textContent = 'Entrar';
          err.textContent = `❌ PIN incorreto. Tentativa ${attempts}/${MAX_ATTEMPTS}.`;
          err.style.color = '#f44';
          input.focus();
        }
      }
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      tryPin();
    });
    input.focus();
  });
}
