// @ts-check
import { nav } from './navigation.js';
import { i18n } from './i18n.js';
import { appState } from './app-state.js';

export class UIPanel {
    constructor() {
        this.currentGallery = [];
        this.galleryIndex = 0;
        this.elements = {};
    }

    init() {
        this.elements = {
            panel: document.getElementById('info-panel'),
            title: document.getElementById('info-title'),
            videoContainer: document.getElementById('video-container'),
            dynamicContent: document.getElementById('dynamic-content'),
            videoControls: document.getElementById('video-controls'),
            carouselControls: document.getElementById('carousel-controls'),
            btnGal1: document.getElementById('btn-gallery-1'),
            btnGal2: document.getElementById('btn-gallery-2'),
            btnVideo: document.getElementById('btn-video'),
            btnText: document.getElementById('btn-text'),
            nextBtn: document.getElementById('next-btn'),
            prevBtn: document.getElementById('prev-btn'),
            closeBtn: document.getElementById('info-close-btn')
        };

        if (this.elements.nextBtn) this.elements.nextBtn.addEventListener('click', () => this.nextImage());
        if (this.elements.prevBtn) this.elements.prevBtn.addEventListener('click', () => this.prevImage());
        if (this.elements.closeBtn) this.elements.closeBtn.addEventListener('click', () => nav.reset());
    }

    nextImage() {
        if (this.currentGallery.length > 0) {
            this.galleryIndex = (this.galleryIndex + 1) % this.currentGallery.length;
            this.renderImage();
        }
    }

    prevImage() {
        if (this.currentGallery.length > 0) {
            this.galleryIndex = (this.galleryIndex - 1 + this.currentGallery.length) % this.currentGallery.length;
            this.renderImage();
        }
    }

    renderImage() {
        if (this.elements.dynamicContent) {
            this.elements.dynamicContent.innerHTML = `<img src="${this.currentGallery[this.galleryIndex]}" class="gallery-img" alt="Gallery Image">`;
        }
    }

    reset() {
        if(this.elements.videoContainer) this.elements.videoContainer.innerHTML = '';
        if(this.elements.dynamicContent) this.elements.dynamicContent.innerHTML = '';
        const video = document.getElementById('main-video');
        if (video) /** @type {HTMLVideoElement} */ (video).pause();
    }

    hideAllSections() {
        if(this.elements.videoContainer) this.elements.videoContainer.style.display = 'none';
        if(this.elements.dynamicContent) this.elements.dynamicContent.style.display = 'none';
        if(this.elements.videoControls) this.elements.videoControls.style.display = 'none';
        if(this.elements.carouselControls) this.elements.carouselControls.style.display = 'none';
    }

    /**
     * @param {any} objConfig 
     */
    loadContent(objConfig) {
        if (!objConfig || !objConfig.panel) return;
        
        if (this.elements.title) {
            this.elements.title.innerText = i18n.t(objConfig.panel.title_key);
        }

        const currentConfig = appState.getConfig();
        const labels = currentConfig?.settings?.labels || {};
        if (this.elements.btnGal1) this.elements.btnGal1.innerText = labels.galleryA || 'Galeria A';
        if (this.elements.btnGal2) this.elements.btnGal2.innerText = labels.galleryB || 'Galeria B';
        if (this.elements.btnVideo) this.elements.btnVideo.innerText = labels.video || 'Vídeos';
        if (this.elements.btnText) this.elements.btnText.innerText = labels.text || 'Documentos';

        this.hideAllSections();
        this.reset();

        const showVideo = () => {
            if (!objConfig.panel.video || !objConfig.panel.video.src) return;
            this.hideAllSections();
            if(this.elements.videoContainer) this.elements.videoContainer.style.display = 'flex';
            if(this.elements.videoControls) this.elements.videoControls.style.display = 'flex';
            
            const video = /** @type {HTMLVideoElement} */ (document.getElementById('main-video'));
            if (video) video.currentTime = 0;
        };

        if (objConfig.panel.video && objConfig.panel.video.src) {
            if (this.elements.videoContainer) {
                const video = document.createElement('video');
                video.src = objConfig.panel.video.src;
                video.id = 'main-video';
                video.loop = true;
                this.elements.videoContainer.appendChild(video);
                
                const btnToggle = document.getElementById('video-toggle');
                const btnStop = document.getElementById('video-stop');
                
                if (btnToggle) {
                    btnToggle.innerText = 'Play';
                    btnToggle.onclick = () => {
                        if (video.paused) { video.play(); btnToggle.innerText = 'Pause'; }
                        else { video.pause(); btnToggle.innerText = 'Play'; }
                    };
                    video.onplay = () => btnToggle.innerText = 'Pause';
                    video.onpause = () => btnToggle.innerText = 'Play';
                }

                if (btnStop) {
                    btnStop.onclick = () => {
                        video.pause(); video.currentTime = 0;
                        if (btnToggle) btnToggle.innerText = 'Play';
                    };
                }
            }
        }

        const loadGallery = (images) => {
            if (!images || images.length === 0) return;
            this.hideAllSections();
            if(this.elements.dynamicContent) this.elements.dynamicContent.style.display = 'flex';
            
            this.currentGallery = images;
            this.galleryIndex = 0;
            
            if(this.elements.carouselControls) {
                this.elements.carouselControls.style.display = images.length > 1 ? 'flex' : 'none';
            }
            this.renderImage();
        };

        if (this.elements.btnGal1) {
            this.elements.btnGal1.style.display = (objConfig.panel.galleries && objConfig.panel.galleries[0]) ? 'block' : 'none';
            this.elements.btnGal1.onclick = () => loadGallery(objConfig.panel.galleries[0].images);
        }
        if (this.elements.btnGal2) {
            this.elements.btnGal2.style.display = (objConfig.panel.galleries && objConfig.panel.galleries[1]) ? 'block' : 'none';
            this.elements.btnGal2.onclick = () => loadGallery(objConfig.panel.galleries[1].images);
        }
        if (this.elements.btnVideo) {
            this.elements.btnVideo.style.display = (objConfig.panel.video && objConfig.panel.video.src) ? 'block' : 'none';
            this.elements.btnVideo.onclick = () => showVideo();
        }
        if (this.elements.btnText) {
            this.elements.btnText.style.display = objConfig.panel.description_key ? 'block' : 'none';
            this.elements.btnText.onclick = () => {
                this.hideAllSections();
                if(this.elements.dynamicContent) {
                    this.elements.dynamicContent.style.display = 'flex';
                    this.elements.dynamicContent.innerHTML = `<div class="panel-text-content">${i18n.t(objConfig.panel.description_key)}</div>`;
                }
            };
        }

        // Seleção padrão inicial
        if (objConfig.panel.galleries && objConfig.panel.galleries[0]) {
            loadGallery(objConfig.panel.galleries[0].images);
        } else if (objConfig.panel.video && objConfig.panel.video.src) {
            showVideo();
        } else {
            if (this.elements.btnText) this.elements.btnText.click();
        }
    }

    /**
     * @param {boolean} show 
     * @param {Function=} onTransitionComplete
     */
    toggleVisibility(show, onTransitionComplete = null) {
        if (!this.elements.panel) return;

        if (show) {
            this.elements.panel.style.display = 'block';
            setTimeout(() => {
                if (this.elements.panel) this.elements.panel.classList.add('active');
            }, 10);
            
            // Wait for CSS transition (assumes .active transition is quick)
            if (onTransitionComplete) setTimeout(onTransitionComplete, 50); 
        } else {
            this.elements.panel.classList.remove('active');
        }
    }

    completeHide() {
        if (this.elements.panel) {
            this.elements.panel.style.display = 'none';
        }
        this.reset();
    }
}

export const uiPanel = new UIPanel();
