// @ts-nocheck
/* global THREE */
import { stateManager } from './state-manager.js';
import { cameraRig } from './camera-rig.js';
import { spatialTracker } from './spatial-tracker.js';
import { uiPanel } from './ui-panel.js';
import { appState } from './app-state.js';

/**
 * Controlador de transições de View (Cena 3D ↔ Painel UI).
 * Extraído do main.js (God-Object) para seguir Regra Pétrea 2: Modularidade Total.
 * Todas as dependências recebidas via import de módulo (sem globais).
 */
export class ViewController {

    /**
     * Ponto de entrada — chamado pelo listener 'view-changed' no main.js.
     * @param {string} viewId
     */
    handle(viewId) {
        if (stateManager.isTransitioning()) {
            console.warn('🔒 FSM Bloqueio: Transição da Câmera em andamento.');
            return;
        }
        stateManager.setTransitioning();

        if (viewId === 'scene') {
            this._handleClose();
        } else {
            this._handleOpen(viewId);
        }
    }

    /** Fluxo de FECHAMENTO — volta para a cena 3D */
    _handleClose() {
        const config = stateManager.lastPanelConfig || {};
        const timing = config._timing || { fadeDur: 400, waitClose: 400, doorDur: 1000 };

        const savedState = stateManager.getCameraState();
        if (savedState) {
            const cameraEl = document.querySelector('[camera]');
            let currentY = 0;
            if (cameraEl) {
                // @ts-ignore
                const look = cameraEl.components['look-controls'];
                currentY = look && look.yawObject ? look.yawObject.rotation.y : cameraEl.object3D.rotation.y;
            }
            
            // Shortest Path para voltar sem piruetas
            let targetY = savedState.rot.y;
            let diff = targetY - currentY;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            savedState.rot.y = currentY + diff;

            cameraRig.animate(savedState.pos, savedState.rot, timing.doorDur, () => {
                stateManager.setIdle();
            });
            stateManager.clearCameraState();
        } else {
            setTimeout(() => stateManager.setIdle(), timing.doorDur + 50);
        }

        const sceneEl = document.querySelector('a-scene');
        if (stateManager.lastParentEl && sceneEl && sceneEl.camera) {
            spatialTracker.track(uiPanel.elements.panel, stateManager.lastParentEl, sceneEl, timing.doorDur, true, config);
        }

        uiPanel.toggleVisibility(false);

        const triggerDoorClose = () => {
            this._animateDoors(stateManager.lastParentEl, timing);
        };

        if (timing.waitClose === 0) {
            triggerDoorClose();
        } else {
            setTimeout(triggerDoorClose, timing.waitClose);
        }

        setTimeout(() => {
            uiPanel.completeHide();
            stateManager.saveInteractionState(null, null);
        }, Math.max(timing.fadeDur, 600));
    }

    /**
     * Fluxo de ABERTURA — exibe painel de objeto.
     * @param {string} viewId
     */
    _handleOpen(viewId) {
        const obj = appState.findObject(viewId);
        if (!obj) {
            stateManager.setIdle();
            return;
        }

        /** @type {PanelTiming} */
        const timing = obj.timing || { doorDur: 1000, fadeDur: 500, waitOpen: 0, waitClose: 0 };
        if (obj.panel) obj.panel._timing = timing;

        // Pre-loading de imagens das galerias
        if (obj.panel && obj.panel.galleries) {
            obj.panel.galleries.forEach(gal => {
                if (gal.images) gal.images.forEach(imgSrc => { new Image().src = imgSrc; });
            });
        }

        const parentEl = document.getElementById(viewId);
        const cameraEl = document.querySelector('[camera]');

        if (cameraEl && parentEl) {
            if (!stateManager.getCameraState()) {
                // @ts-ignore
                const look = cameraEl.components['look-controls'];
                stateManager.saveCameraState({
                    pos: { x: cameraEl.object3D.position.x, y: cameraEl.object3D.position.y, z: cameraEl.object3D.position.z },
                    rot: {
                        x: look ? look.pitchObject.rotation.x : cameraEl.object3D.rotation.x,
                        y: look ? look.yawObject.rotation.y : cameraEl.object3D.rotation.y,
                        z: 0
                    }
                });
            }

            const targetPos = new THREE.Vector3(0, 1.6, 2.0);
            if (obj.panel && obj.panel.camera_offset) {
                const cParts = obj.panel.camera_offset.split(' ').map(Number);
                if (cParts.length === 3 && !isNaN(cParts[0])) {
                    targetPos.set(cParts[0], cParts[1], cParts[2]);
                }
            }
            targetPos.applyMatrix4(parentEl.object3D.matrixWorld);

            const cabinetPos = new THREE.Vector3();
            parentEl.object3D.getWorldPosition(cabinetPos);

            const tempObj = new THREE.Object3D();
            tempObj.position.copy(targetPos);
            
            if (obj.panel && obj.panel.camera_rotation && obj.panel.camera_rotation.trim() !== '') {
                const rParts = obj.panel.camera_rotation.split(' ').map(Number);
                if (rParts.length === 3 && !isNaN(rParts[0])) {
                    const localEuler = new THREE.Euler(
                        THREE.MathUtils.degToRad(rParts[0]), 
                        THREE.MathUtils.degToRad(rParts[1]), 
                        THREE.MathUtils.degToRad(rParts[2])
                    );
                    const localQuat = new THREE.Quaternion().setFromEuler(localEuler);
                    const parentQuat = new THREE.Quaternion();
                    parentEl.object3D.getWorldQuaternion(parentQuat);
                    const finalQuat = parentQuat.multiply(localQuat);
                    tempObj.setRotationFromQuaternion(finalQuat);
                } else {
                    tempObj.lookAt(cabinetPos.x, targetPos.y, cabinetPos.z);
                }
            } else {
                tempObj.lookAt(cabinetPos.x, targetPos.y, cabinetPos.z);
            }

            // Evitar pirueta (Gimbal lock / Euler flip) - Shortest Path Rotation
            let currentY = 0;
            let currentX = 0;
            // @ts-ignore
            const look = cameraEl.components['look-controls'];
            if (look && look.yawObject) {
                currentY = look.yawObject.rotation.y;
                currentX = look.pitchObject.rotation.x;
            } else {
                currentY = cameraEl.object3D.rotation.y;
                currentX = cameraEl.object3D.rotation.x;
            }

            let targetY = tempObj.rotation.y;
            let diff = targetY - currentY;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            targetY = currentY + diff;

            let targetX = tempObj.rotation.x;
            let diffX = targetX - currentX;
            while (diffX > Math.PI) diffX -= Math.PI * 2;
            while (diffX < -Math.PI) diffX += Math.PI * 2;
            targetX = currentX + diffX;

            cameraRig.animate(
                { x: targetPos.x, y: targetPos.y, z: targetPos.z },
                { x: targetX, y: targetY, z: tempObj.rotation.z },
                timing.doorDur,
                () => { stateManager.setIdle(); }
            );
        } else {
            setTimeout(() => stateManager.setIdle(), timing.doorDur + 50);
        }

        this._animateDoors(parentEl, timing);

        if (!obj.panel) return;
        stateManager.saveInteractionState(parentEl, obj.panel);

        if (parentEl && parentEl.object3D) {
            const sceneEl = document.querySelector('a-scene');
            if (sceneEl && sceneEl.camera) {
                spatialTracker.track(uiPanel.elements.panel, parentEl, sceneEl, timing.doorDur, false, obj.panel);
            }
        }

        uiPanel.loadContent(obj);
        uiPanel.toggleVisibility(true);
    }

    /**
     * Dispara toggle de animações (portas/gavetas) nos filhos do objeto.
     * @param {HTMLElement|null} parentEl
     * @param {any} timing
     */
    _animateDoors(parentEl, timing) {
        if (!parentEl) return;
        if (window.GABINETE_DEBUG) console.log(`🚪 _animateDoors chamado para:`, parentEl.id, timing);

        const allTargets = [parentEl, ...Array.from(parentEl.querySelectorAll('*'))];
        let animFound = false;

        allTargets.forEach((targetNode) => {
            /** @type {any} */
            const child = targetNode;
            if (!child.components) return;

            const keys = Object.keys(child.components);
            if (window.GABINETE_DEBUG) console.log(`🧩 Componentes em ${child.id || child.tagName}:`, keys.join(', '));

            keys.forEach(compName => {
                if (compName === 'animated-object' || compName.startsWith('gltf-part-animation')) {
                    animFound = true;
                    if (window.GABINETE_DEBUG) console.log(`🎬 Componente encontrado: ${compName} em <${child.tagName.toLowerCase()} id="${child.id}">`);
                    const comp = child.components[compName];
                    // Respeita a duração local da animação definida no painel
                    if (comp && typeof comp.toggle === 'function') {
                        if (window.GABINETE_DEBUG) console.log(`▶️ Acionando toggle() em ${compName}`);
                        comp.toggle();
                    } else {
                        if (window.GABINETE_DEBUG) console.log(`❌ Falha: comp.toggle não é função em ${compName}`);
                    }
                }
            });
        });

        if (!animFound && window.GABINETE_DEBUG) console.log(`⚠️ Nenhuma animação (gltf-part-animation) achada na árvore de ${parentEl.id}`);
    }
}

export const viewController = new ViewController();
