// @ts-check
/* global AFRAME */

export const cameraRig = {
    /**
     * @param {any} toPos 
     * @param {any} toRot 
     * @param {number} dur 
     * @param {Function=} onComplete 
     */
    animate: (toPos, toRot, dur, onComplete) => {
        const cameraEl = document.querySelector('[camera]');
        if (!cameraEl) {
            if(onComplete) onComplete();
            return;
        }

        let posDone = false;
        let rotDone = false;
        
        const checkDone = () => {
            if (posDone && rotDone && onComplete) {
                // Pequeno delay pra garantir que os dados de matriz da engine renderizem
                setTimeout(onComplete, 50);
            }
        };

        // @ts-ignore
        AFRAME.ANIME({
            targets: cameraEl.object3D.position,
            x: toPos.x, y: toPos.y, z: toPos.z,
            duration: dur, easing: 'easeInOutQuad',
            complete: () => { posDone = true; checkDone(); }
        });

        // @ts-ignore
        const look = cameraEl.components['look-controls'];
        if (look && look.yawObject && look.pitchObject) {
            let yawDone = false;
            let pitchDone = false;
            const checkRot = () => { if (yawDone && pitchDone) { rotDone = true; checkDone(); } };

            // @ts-ignore
            AFRAME.ANIME({
                targets: look.yawObject.rotation,
                y: toRot.y,
                duration: dur, easing: 'easeInOutQuad',
                complete: () => { yawDone = true; checkRot(); }
            });
            // @ts-ignore
            AFRAME.ANIME({
                targets: look.pitchObject.rotation,
                x: toRot.x,
                duration: dur, easing: 'easeInOutQuad',
                complete: () => { pitchDone = true; checkRot(); }
            });
        } else {
            // @ts-ignore
            AFRAME.ANIME({
                targets: cameraEl.object3D.rotation,
                x: toRot.x, y: toRot.y, z: toRot.z,
                duration: dur, easing: 'easeInOutQuad',
                complete: () => { rotDone = true; checkDone(); }
            });
        }
    }
};
