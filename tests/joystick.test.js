import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Joystick } from '../js/joystick.js';

describe('Joystick', () => {
    let joystick;
    
    beforeEach(() => {
        // Mock do DOM
        document.body.innerHTML = `
            <div id="mobile-joystick-zone" style="display: none; width: 100px; height: 100px;">
                <div id="mobile-joystick-knob"></div>
            </div>
        `;
        joystick = new Joystick();
        
        // Mock window touch support
        global.window.ontouchstart = null;
        global.navigator = { maxTouchPoints: 1 };
    });

    it('deve inicializar corretamente se houver suporte a touch', () => {
        joystick.init();
        expect(joystick.zone.style.display).toBe('block');
    });

    it('não deve inicializar se não houver touch', () => {
        delete global.window.ontouchstart;
        global.navigator.maxTouchPoints = 0;
        
        joystick.init();
        const zone = document.getElementById('mobile-joystick-zone');
        expect(zone.style.display).toBe('none');
    });

    it('deve disparar eventos de teclado ao mover o joystick', () => {
        joystick.init();
        
        // Mock dispatchEvent
        const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');
        
        // Mock do getBoundingClientRect para o zone
        joystick.zone.getBoundingClientRect = () => ({
            left: 0,
            top: 0,
            width: 100,
            height: 100
        });

        // Simula movimento para a frente (cima)
        // Centro é 50,50. Cima é 50,0
        joystick.updatePos({ clientX: 50, clientY: 0 });

        // ny será -1, disparando KeyW
        expect(dispatchEventSpy).toHaveBeenCalled();
        const event = dispatchEventSpy.mock.calls[0][0];
        expect(event.type).toBe('keydown');
        expect(event.code).toBe('KeyW');
        
        // Simula soltar o joystick
        dispatchEventSpy.mockClear();
        joystick.onEnd();
        
        // Deve disparar keyup
        expect(dispatchEventSpy).toHaveBeenCalled();
        const endEvent = dispatchEventSpy.mock.calls[0][0];
        expect(endEvent.type).toBe('keyup');
        expect(endEvent.code).toBe('KeyW');
    });
});
