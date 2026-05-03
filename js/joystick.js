// @ts-check

/**
 * Joystick Mobile
 * Ativado apenas em dispositivos com suporte a toque.
 * Simula eventos de teclado (KeyW, KeyA, KeyS, KeyD) para interagir nativamente com o
 * wasd-controls do A-Frame e o motor kiosk-physics.
 */

export class Joystick {
    constructor() {
        /** @type {HTMLElement|null} */
        this.zone = null;
        /** @type {HTMLElement|null} */
        this.knob = null;
        this.active = false;
        this.keys = { up: false, down: false, left: false, right: false };
        
        this.onStart = this.onStart.bind(this);
        this.onMove = this.onMove.bind(this);
        this.onEnd = this.onEnd.bind(this);
    }

    init() {
        // Detecta se é mobile/touch
        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        if (!isTouch) return;
        
        this.zone = document.getElementById('mobile-joystick-zone');
        this.knob = document.getElementById('mobile-joystick-knob');
        
        if (!this.zone || !this.knob) return;
        
        this.zone.style.display = 'block';

        this.zone.addEventListener('touchstart', this.onStart, {passive: false});
        this.zone.addEventListener('touchmove', this.onMove, {passive: false});
        this.zone.addEventListener('touchend', this.onEnd);
        this.zone.addEventListener('touchcancel', this.onEnd);
        
        console.log('🕹️ Mobile Joystick ativado.');
    }

    onStart(/** @type {TouchEvent} */ e) {
        e.preventDefault(); // Impede scroll
        this.active = true;
        this.updatePos(e.touches[0]);
    }

    onMove(/** @type {TouchEvent} */ e) {
        if (!this.active) return;
        e.preventDefault(); // Impede scroll
        this.updatePos(e.touches[0]);
    }

    onEnd() {
        this.active = false;
        if (this.knob) this.knob.style.transform = `translate(-50%, -50%)`;
        this.updateKeys(0, 0);
    }

    updatePos(/** @type {Touch} */ touch) {
        if (!this.zone || !this.knob) return;
        
        const rect = this.zone.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const maxDist = rect.width / 2;

        let dx = touch.clientX - centerX;
        let dy = touch.clientY - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > maxDist) {
            dx = (dx / dist) * maxDist;
            dy = (dy / dist) * maxDist;
        }

        // Move knob mantendo-o centralizado via translate(-50%,-50%)
        this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

        // Normaliza de -1 a 1
        const nx = dx / maxDist;
        const ny = dy / maxDist;

        this.updateKeys(nx, ny);
    }

    updateKeys(/** @type {number} */ nx, /** @type {number} */ ny) {
        const threshold = 0.3; // Zona morta central
        const newKeys = {
            up: ny < -threshold,
            down: ny > threshold,
            left: nx < -threshold,
            right: nx > threshold
        };

        const checkKey = (/** @type {keyof typeof newKeys} */ key, /** @type {string} */ code) => {
            if (newKeys[key] !== this.keys[key]) {
                const type = newKeys[key] ? 'keydown' : 'keyup';
                window.dispatchEvent(new KeyboardEvent(type, { code }));
                this.keys[key] = newKeys[key];
            }
        };

        checkKey('up', 'KeyW');
        checkKey('down', 'KeyS');
        checkKey('left', 'KeyA');
        checkKey('right', 'KeyD');
    }
}

export const joystick = new Joystick();
