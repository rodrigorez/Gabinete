// @ts-check
class StateManager {
    constructor() {
        this.states = {
            IDLE: 'IDLE',
            TRANSITIONING: 'TRANSITIONING'
        };
        this.currentState = this.states.IDLE;
        this.cameraState = null;
        this.lastParentEl = null;
        this.lastPanelConfig = null;
    }

    isTransitioning() {
        return this.currentState === this.states.TRANSITIONING;
    }

    setTransitioning() {
        this.currentState = this.states.TRANSITIONING;
    }

    setIdle() {
        this.currentState = this.states.IDLE;
    }

    saveCameraState(state) {
        this.cameraState = state;
    }

    getCameraState() {
        return this.cameraState;
    }

    clearCameraState() {
        this.cameraState = null;
    }

    saveInteractionState(parentEl, panelConfig) {
        this.lastParentEl = parentEl;
        this.lastPanelConfig = panelConfig;
    }
}

export const stateManager = new StateManager();
