// @ts-check
/* global AFRAME */
import { nav } from './navigation.js';
import { i18n } from './i18n.js';
import { EVENTS } from './events.js';
import { uiPanel } from './ui-panel.js';
import { appState } from './app-state.js';
import { viewController } from './view-controller.js';
import './physics.js';
import './components.js';
import './kiosk-mode.js';
import { loadSecrets } from './secrets-loader.js';
import { joystick } from './joystick.js';

/** Chave localStorage para erros de assets 3D */
const ASSET_ERROR_KEY = 'gabinete_asset_errors_v1';

// Cache URL params ANTES do kiosk-mode limpar ?admin via replaceState
const _bootParams = new URLSearchParams(window.location.search);

/**
 * Ponto de entrada do Gabinete Virtual.
 *
 * Boot flow:
 *  1. Carrega secrets
 *  2. Resolve config final (local vs GitHub — "melhor versão vence")
 *  3. Constrói a cena 3D com a config resolvida
 *  4. Inicia sync periódico em background (atualiza cena se remoto mudar)
 */
document.addEventListener('DOMContentLoaded', async () => {
    await loadSecrets();

    nav.init();
    uiPanel.init();
    joystick.init();

    // DevEditor — lazy-load só quando necessário
    if (_bootParams.get('dev') === 'true' || _bootParams.get('admin') === 'true') {
        const { devEditor } = await import('./dev-editor.js');
        devEditor.init();
    }

    const progress = /** @type {HTMLElement} */ (document.getElementById('loader-progress'));
    const splash   = /** @type {HTMLElement} */ (document.getElementById('splash-screen'));
    const scene    = /** @type {HTMLElement} */ (document.querySelector('a-scene'));

    // ─── createEntity — disponível para boot e para sync em background ───────
    /** @param {GabineteObject} obj @param {HTMLElement} parent */
    const createEntity = (obj, parent) => {
        /** @type {any} */
        const el = document.createElement(`a-${obj.type || 'box'}`);
        el.setAttribute('id', obj.id);
        el.setAttribute('position', obj.position || '0 0 0');
        el.setAttribute('rotation', obj.rotation || '0 0 0');
        el.setAttribute('color', obj.color || '#FFF');
        if (obj.radius) el.setAttribute('radius', String(obj.radius));
        if (obj.width)  el.setAttribute('width',  String(obj.width));
        if (obj.height) el.setAttribute('height', String(obj.height));
        if (obj.depth)  el.setAttribute('depth',  String(obj.depth));
        if (obj.scale)  el.setAttribute('scale',  obj.scale);
        if (obj.model || obj.src) el.setAttribute('src', obj.model || obj.src || '');
        if (obj.visible === false) el.setAttribute('visible', 'false');

        if (obj.action === 'animate') {
            el.setAttribute('animated-object', {
                id: obj.id,
                property: obj.anim_target || 'rotation',
                to: obj.anim_to || '0 90 0'
            });
        }
        
        if (obj.isInteractive !== false && obj.action !== 'inert') {
            el.setAttribute('interactive-object', { id: obj.id, name: obj.name_key });
            el.setAttribute('class', 'clickable'); // Raycaster vai interagir com a malha base
        }

        parent.appendChild(el);

        // Processa filhos estruturais ou as marcações lógicas do GLB
        if (obj.children) {
            obj.children.forEach((child, index) => {
                if (child.role === 'animation' && child.part_name) {
                    // Novo formato prioritário: Animações de nós internos do GLB
                    let axis = child.anim_axis || 'y';
                    let end = child.anim_end || 0;
                    
                    const compName = `gltf-part-animation__${index}`;
                    console.log(`🛠️ [main.js] Injetando ${compName} na entidade ${obj.id} (parte: ${child.part_name}, target: ${axis}:${end})`);
                    
                    // Usa a tag com sufixo mágico do A-Frame para permitir múltiplos componentes
                    el.setAttribute(compName, {
                        partName: child.part_name,
                        property: 'rotation',
                        to: `${axis}:${end}`
                    });
                } else if (child.role === 'collider') {
                    // Novo formato prioritário: Caixa de Colisão invisível atrelada à Entidade
                    const colBox = document.createElement('a-box');
                    
                    const isDebug = window.location.search.includes('debug=1');
                    if (isDebug) /** @type {any} */ (window).GABINETE_DEBUG = true;

                    if (isDebug) {
                        // Modo Debug: Caixa rosa choque sobreposta a tudo
                        colBox.setAttribute('material', 'wireframe: true; color: #ff00ff; opacity: 0.8; depthTest: false');
                    } else {
                        // Produção: Opacidade zero (invisível, mas continua no render-tree para física e click)
                        colBox.setAttribute('material', 'opacity: 0; transparent: true; depthWrite: false');
                    }
                    
                    colBox.setAttribute('class', 'clickable'); // Para motor de física agir
                    colBox.setAttribute('scale', child.scale || '1 1 1');
                    colBox.setAttribute('position', child.position || '0 0 0');
                    el.appendChild(colBox);
                } else if (/** @type {any} */ (child).type && child.id) {
                    // Fallback para Estrutura Legacy (backward compatibility para V1~V4)
                    createEntity(/** @type {any} */ (child), el);
                }
            });
        }
    };

    try {
        // 0. i18n
        await i18n.init();

        // ─── 1. CARGA DE CONFIGURAÇÃO (INSTANTÂNEA / OFFLINE-FIRST) ───────────
        // Prioriza a velocidade do PWA: lê o que está no cache local imediatamente.
        // O sync com o GitHub rodará silenciosamente em background.
        progress.style.width = '20%';

        /** @type {GabineteConfig|null} */
        let config = null;

        try {
            const localRaw = localStorage.getItem('gabinete_kiosk_config');
            if (localRaw) {
                config = JSON.parse(localRaw);
                console.log(`📂 Config carregada do cache local: ${config?.objects?.length ?? 0} objeto(s).`);
            } else {
                const res = await fetch('assets/config.json');
                config = await res.json();
                console.log(`📂 Config base carregada (assets): ${config?.objects?.length ?? 0} objeto(s).`);
            }
        } catch (err) {
            console.error('❌ Falha crítica ao ler config base:', err);
        }

        // Inicia o Sync Engine em background (não bloqueia a renderização da tela atual)
        import('./sync-engine.js').then(({ startSync, onConfigUpdated }) => {
            startSync();
            onConfigUpdated((newConfig) => {
                appState.setConfig(newConfig);
                const container = document.getElementById('scene-container');
                if (!container) return;
                
                // Recria as entidades caso ocorra atualização (hot-reload da cena)
                container.innerHTML = '';
                newConfig.objects.forEach(obj => createEntity(obj, container));
                console.log('✅ Cena atualizada pelo sync em background.');
            });
        }).catch(syncErr => {
            console.warn('⚠️ Sync Engine não pôde ser iniciado em background.', syncErr);
        });

        // ─── 2. Valida schema ────────────────────────────────────────────────
        progress.style.width = '40%';
        if (!config || typeof config !== 'object') throw new Error('Config inválida ou vazia.');
        if (!config.settings?.env) throw new Error("Config requer 'settings.env'.");
        if (!Array.isArray(config.objects)) throw new Error("Config requer array 'objects'.");

        appState.setConfig(config);



        // ─── 3. Configura ambiente ───────────────────────────────────────────
        const sky   = document.getElementById('main-sky');
        const light = document.getElementById('ambient-light');
        if (sky && light) {
            const skyVal = config.settings.env.sky;
            if (skyVal) {
                if (skyVal.startsWith('#') || skyVal.startsWith('rgb')) {
                    sky.setAttribute('color', skyVal);
                    sky.removeAttribute('src');
                } else {
                    sky.setAttribute('src', skyVal);
                    sky.removeAttribute('color');
                }
            }
            /** @type {any} */ (light).setAttribute('light', 'intensity', String(config.settings.env.exposure));
        }

        // ─── 4. Instancia objetos na cena ────────────────────────────────────
        progress.style.width = '80%';
        const container = document.getElementById('scene-container');
        if (container) {
            config.objects.forEach(obj => createEntity(obj, container));

            // ── 4-B: Delegação de model-error ───────────────────────────────
            // A-Frame emite 'model-error' em entidades com gltf-model quando o
            // arquivo falha. O evento sobe até o container via bubbling.
            container.addEventListener('model-error', (/** @type {any} */ e) => {
                const el  = /** @type {HTMLElement} */ (e.target);
                const src = el.getAttribute('gltf-model') || el.getAttribute('src') || 'desconhecido';
                const id  = el.id || el.tagName;

                console.warn(`⚠️ Falha ao carregar modelo 3D: ${id} → ${src}`);

                // Persiste para exibição na curadoria
                const errors = JSON.parse(localStorage.getItem(ASSET_ERROR_KEY) || '[]');
                errors.unshift({ timestamp: new Date().toISOString(), id, src });
                // Mantém apenas os 20 mais recentes
                if (errors.length > 20) errors.pop();
                localStorage.setItem(ASSET_ERROR_KEY, JSON.stringify(errors));

                // Notifica outros módulos (ex: adm.html ouvindo)
                window.dispatchEvent(new CustomEvent(EVENTS.ASSET_ERROR, { detail: { id, src } }));
            });
        }

        // ─── 5. Finaliza carregamento ─────────────────────────────────────────
        progress.style.width = '100%';
        const hideSplash = () => {
            splash.style.opacity = '0';
            scene.removeAttribute('hidden');
            setTimeout(() => { splash.style.display = 'none'; }, 800);
            window.dispatchEvent(new CustomEvent(EVENTS.SCENE_LOADED));
        };
        setTimeout(hideSplash, 500);

        // ─── VR / Flatscreen híbrido ─────────────────────────────────────────
        scene.addEventListener('enter-vr', () => {
            // @ts-ignore
            if (AFRAME.utils.device.checkHeadsetConnected()) {
                scene.removeAttribute('cursor');
                const camera = document.querySelector('[camera]');
                if (camera && !document.getElementById('vr-cursor')) {
                    const vrCursor = document.createElement('a-cursor');
                    vrCursor.setAttribute('id', 'vr-cursor');
                    vrCursor.setAttribute('fuse', 'true');
                    vrCursor.setAttribute('raycaster', 'objects: .clickable');
                    vrCursor.setAttribute('material', 'color: white; shader: flat');
                    vrCursor.setAttribute('geometry', 'primitive: ring; radiusInner: 0.01; radiusOuter: 0.015');
                    vrCursor.setAttribute('position', '0 0 -1');
                    camera.appendChild(vrCursor);
                }
            }
        });

        scene.addEventListener('exit-vr', () => {
            const vrCursor = document.getElementById('vr-cursor');
            if (vrCursor) vrCursor.remove();
            scene.setAttribute('cursor', 'rayOrigin: mouse');
        });

        // ─── Fullscreen (triple-tap) ─────────────────────────────────────────
        const fsBtn = document.getElementById('custom-fs-btn');
        let fsTaps = 0, lastFsTap = 0;
        if (fsBtn) {
            fsBtn.addEventListener('pointerdown', () => {
                const now = Date.now();
                if (now - lastFsTap < 500) fsTaps++; else fsTaps = 1;
                lastFsTap = now;
                if (fsTaps >= 3) {
                    fsTaps = 0;
                    if (!document.fullscreenElement) {
                        document.documentElement.requestFullscreen().catch(() => {});
                    } else {
                        document.exitFullscreen().catch(() => {});
                    }
                }
            });
        }

    } catch (error) {
        console.error('❌ Falha crítica no carregamento:', error);
        if (splash) splash.style.display = 'none';
        if (scene)  scene.removeAttribute('hidden');
    }
});

// Delegação de eventos de view (substitui God-Object de 164 linhas)
window.addEventListener(EVENTS.VIEW_CHANGED, (/** @type {any} */ e) => viewController.handle(e.detail));
