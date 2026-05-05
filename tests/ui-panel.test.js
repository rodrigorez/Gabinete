import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UIPanel } from '../js/ui-panel.js';
import { appState } from '../js/app-state.js';
import { i18n } from '../js/i18n.js';

vi.mock('../js/app-state.js', () => ({
  appState: { getConfig: vi.fn() }
}));

vi.mock('../js/i18n.js', () => ({
  i18n: { t: vi.fn((key) => `translated_${key}`) }
}));

vi.mock('../js/navigation.js', () => ({
  nav: { reset: vi.fn() }
}));

describe('UIPanel', () => {
  let panel;

  beforeEach(() => {
    // Setup minimal DOM
    document.body.innerHTML = `
      <div id="info-panel"></div>
      <div id="info-title"></div>
      <div id="video-container"></div>
      <div id="dynamic-content"></div>
      <div id="video-controls"></div>
      <div id="carousel-controls"></div>
      <button id="btn-gallery-1"></button>
      <button id="btn-gallery-2"></button>
      <button id="btn-video"></button>
      <button id="btn-text"></button>
      <button id="next-btn"></button>
      <button id="prev-btn"></button>
      <button id="info-close-btn"></button>
      <button id="custom-fs-btn"></button>
      <video id="main-video"></video>
      <button id="video-toggle"></button>
      <button id="video-stop"></button>
    `;

    panel = new UIPanel();
    panel.init();
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('deve inicializar mapeando os elementos do DOM', () => {
    expect(panel.elements.panel).toBeDefined();
    expect(panel.elements.title).toBeDefined();
    expect(panel.elements.btnGal1).toBeDefined();
  });

  it('nextImage e prevImage devem rotacionar a galeria', () => {
    panel.currentGallery = ['img1.jpg', 'img2.jpg', 'img3.jpg'];
    
    panel.nextImage();
    expect(panel.galleryIndex).toBe(1);
    expect(panel.elements.dynamicContent.innerHTML).toContain('img2.jpg');
    
    panel.prevImage();
    expect(panel.galleryIndex).toBe(0);
    expect(panel.elements.dynamicContent.innerHTML).toContain('img1.jpg');
    
    panel.prevImage();
    expect(panel.galleryIndex).toBe(2);
    expect(panel.elements.dynamicContent.innerHTML).toContain('img3.jpg');
  });

  it('hideAllSections deve ocultar contêineres dinâmicos', () => {
    panel.hideAllSections();
    expect(panel.elements.videoContainer.style.display).toBe('none');
    expect(panel.elements.dynamicContent.style.display).toBe('none');
    expect(panel.elements.videoControls.style.display).toBe('none');
    expect(panel.elements.carouselControls.style.display).toBe('none');
  });

  it('reset deve limpar o HTML e pausar vídeo se existir', () => {
    const videoMock = { pause: vi.fn() };
    vi.spyOn(document, 'getElementById').mockImplementation((id) => {
      if (id === 'main-video') return videoMock;
      return null;
    });

    panel.elements.videoContainer.innerHTML = '<div>vídeo velho</div>';
    panel.reset();

    expect(panel.elements.videoContainer.innerHTML).toBe('');
    expect(videoMock.pause).toHaveBeenCalled();
  });

  it('loadContent deve preencher o título e botões', () => {
    appState.getConfig.mockReturnValue({
      settings: {
        labels: { galleryA: 'Gal A', galleryB: 'Gal B', video: 'Vid', text: 'Txt' }
      }
    });

    const mockConfig = {
      panel: {
        title_key: 'TITLE_1',
        description_key: 'DESC_1',
        galleries: [{ images: ['g1.jpg'] }],
        video: { src: 'video.mp4' }
      }
    };

    panel.loadContent(mockConfig);

    expect(i18n.t).toHaveBeenCalledWith('TITLE_1');
    expect(panel.elements.title.innerText).toBe('translated_TITLE_1');
    expect(panel.elements.btnGal1.innerText).toBe('Gal A');
    expect(panel.elements.btnGal1.style.display).toBe('block');
  });

  it('toggleVisibility deve exibir e ocultar o painel modal e o botão fullscreen', () => {
    const fsBtn = document.getElementById('custom-fs-btn');
    
    panel.toggleVisibility(true);
    expect(panel.elements.panel.style.display).toBe('block');
    expect(fsBtn.style.display).toBe('none');

    panel.toggleVisibility(false);
    // panel.active class removida testada, mas style mantém para animação CSS
    expect(fsBtn.style.display).toBe('block');
  });

  it('completeHide deve ocultar totalmente e resetar', () => {
    panel.completeHide();
    expect(panel.elements.panel.style.display).toBe('none');
    expect(panel.elements.dynamicContent.innerHTML).toBe('');
  });

  it('botão de texto deve atualizar o dinamic content com o container textContent preventivo de xss', () => {
    appState.getConfig.mockReturnValue({ settings: { labels: {} } });
    
    panel.loadContent({
      panel: { description_key: 'HTML_KEY' }
    });
    
    i18n.t.mockReturnValue('<b>Texto Limpo</b>');
    
    // Clicar no botão texto
    panel.elements.btnText.click();
    
    const textContainer = panel.elements.dynamicContent.querySelector('.panel-text-content');
    expect(textContainer).not.toBeNull();
    expect(textContainer.textContent).toBe('<b>Texto Limpo</b>');
    expect(panel.elements.dynamicContent.style.display).toBe('flex');
  });
});
