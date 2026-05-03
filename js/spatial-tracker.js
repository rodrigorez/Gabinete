// @ts-check
/* global THREE */

export class SpatialTracker {
    constructor() {
        this.rafId = null;
    }

    /**
     * @param {HTMLElement} panelEl 
     * @param {any} cabinetEl 
     * @param {any} sceneEl 
     * @param {number} duration 
     * @param {boolean} isClosing 
     * @param {any} panelConfig 
     * @param {Function=} onComplete 
     */
    track(panelEl, cabinetEl, sceneEl, duration, isClosing, panelConfig = {}, onComplete = null) {
        if (this.rafId) cancelAnimationFrame(this.rafId);
        
        const startTime = performance.now();
        const startScale = parseFloat(panelConfig.start_scale !== undefined ? panelConfig.start_scale : 0.2);
        const anchorY = parseFloat(panelConfig.anchor_y_offset !== undefined ? panelConfig.anchor_y_offset : 1.2);
        const blendYRatio = parseFloat(panelConfig.blend_y_ratio !== undefined ? panelConfig.blend_y_ratio : 0.5);
        
        const opacityCurve = isClosing 
            ? (panelConfig.easing_close || 'cubic-bezier(0.1, 1, 0.2, 1)')
            : (panelConfig.easing_open || 'cubic-bezier(0.85, 0, 1, 1)');

        panelEl.style.transition = `opacity ${duration}ms ${opacityCurve}`;

        const loop = (time) => {
            const elapsed = time - startTime;
            let progress = elapsed / duration;
            if (progress > 1) progress = 1;

            const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

            const currentScale = isClosing 
                ? 1.0 - (1.0 - startScale) * ease 
                : startScale + (1.0 - startScale) * ease;

            const anchorVector = new THREE.Vector3(0, anchorY, 0);
            if (panelConfig.anchor_offset) {
                const parts = panelConfig.anchor_offset.split(' ').map(Number);
                anchorVector.set(parts[0], parts[1], parts[2]);
            }
            // Transforma o offset local no espaço de mundo (segue a rotação/escala do gabinete)
            cabinetEl.object3D.localToWorld(anchorVector);
            anchorVector.project(sceneEl.camera);
            
            let targetLeft = (anchorVector.x * 0.5 + 0.5) * 100;
            let targetTop = (-(anchorVector.y * 0.5) + 0.5) * 100;

            const camPos = new THREE.Vector3();
            sceneEl.camera.getWorldPosition(camPos);
            cabinetEl.object3D.worldToLocal(camPos);
            
            let angleY = -Math.atan2(camPos.x, camPos.z);

            let blendY = 0;
            const blendMultiplier = 1 / (1 - blendYRatio);
            if (!isClosing) {
                if (progress > blendYRatio) blendY = (progress - blendYRatio) * blendMultiplier;
            } else {
                if (progress < (1 - blendYRatio)) blendY = 1.0 - (progress * blendMultiplier);
            }
            
            const smoothBlendY = blendY * blendY * (3 - 2 * blendY);
            const finalTop = targetTop + (50 - targetTop) * smoothBlendY;
            const finalLeft = targetLeft + (50 - targetLeft) * smoothBlendY;
            const finalAngleY = angleY + (0 - angleY) * smoothBlendY;

            panelEl.style.left = `${finalLeft}%`;
            panelEl.style.top = `${finalTop}%`;
            panelEl.style.transform = `translate(-50%, -50%) perspective(1500px) rotateY(${finalAngleY}rad) scale(${currentScale})`;

            if (progress < 1) {
                this.rafId = requestAnimationFrame(loop);
            } else {
                if (!isClosing) {
                    panelEl.style.left = '50%';
                    panelEl.style.top = '50%';
                    panelEl.style.transform = `translate(-50%, -50%) perspective(1500px) rotateY(0rad) scale(1)`;
                    
                    requestAnimationFrame(() => {
                        panelEl.style.transition = ''; 
                    });
                }
                if (onComplete) onComplete();
            }
        };
        this.rafId = requestAnimationFrame(loop);
    }
}

export const spatialTracker = new SpatialTracker();
