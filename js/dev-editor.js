// @ts-nocheck
/* global AFRAME, THREE */
import { EVENTS } from './events.js';
import { appState } from './app-state.js';
import { stampConfig } from './config.js';

export class DevEditor {
    constructor() {
        this.activeElementId = null;
        this.highlightEl = null;
        /** @type {any} */
        this.anchorHelperEl = null;
    }

    init() {
        console.log("🛠️ Dev Editor UI ativada.");
        this.injectUI();
        this.setupListeners();
    }

    injectUI() {
        const panel = document.createElement('div');
        panel.id = 'dev-editor-panel';
        panel.style.cssText = `
            position: absolute; top: 10px; left: 10px; z-index: 10002;
            background: rgba(0,0,0,0.85); color: #0f0; font-family: monospace;
            padding: 15px; border-radius: 8px; border: 1px solid #0f0;
            width: 280px; box-shadow: 0 4px 15px rgba(0,255,0,0.2);
            font-size: 12px;
        `;

        panel.innerHTML = `
            <h3 style="margin: 0 0 10px 0; border-bottom: 1px solid #0f0; padding-bottom: 5px;">🛠️ GABINETE DEVTOOLS</h3>
            <label>Selecionar Objeto:</label>
            <select id="dev-obj-select" style="width: 100%; margin: 5px 0 15px 0; background: #222; color: #0f0; border: 1px solid #0f0; padding: 4px;">
                <option value="">-- Clique em um objeto na cena --</option>
            </select>

            <button id="dev-update-btn" style="width: 100%; margin-top: 5px; background: #000; color: #0f0; border: 1px solid #0f0; padding: 6px; cursor: pointer;">
                🔄 Salvar Ajustes neste Tablet
            </button>
            <button id="dev-save-btn" style="width: 100%; margin-top: 10px; background: #0f0; color: #000; border: none; padding: 8px; cursor: pointer; font-weight: bold;">
                💾 Exportar Backup (Arquivo)
            </button>
            <button id="dev-publish-btn" style="width: 100%; margin-top: 10px; background: #00D1FF; color: #000; border: none; padding: 10px; cursor: pointer; font-weight: bold; font-size: 13px; box-shadow: 0 0 10px rgba(0,209,255,0.4);">
                ☁️ Publicar Alterações (Sync Oficial)
            </button>
            <button id="dev-clear-btn" style="width: 100%; margin-top: 10px; margin-bottom: 15px; background: #f00; color: #fff; border: none; padding: 6px; cursor: pointer; font-size: 11px;">
                Restaurar Padrão de Fábrica (Apagar Ajustes)
            </button>

            <div id="dev-controls" style="display: none; max-height: 300px; overflow-y: auto; padding-right: 5px; border-top: 1px dashed #0f0; padding-top: 10px;">
                <button id="dev-origin-btn" style="width: 100%; margin-bottom: 10px; background: #444; color: #fff; border: 1px solid #fff; padding: 4px; cursor: pointer;">📍 Trazer para X:0 Y:0 Z:0</button>
                <div class="dev-group">
                    <strong>Position (X, Y, Z)</strong><br>
                    <input type="number" step="0.1" id="dev-pos-x" style="width: 60px;">
                    <input type="number" step="0.1" id="dev-pos-y" style="width: 60px;">
                    <input type="number" step="0.1" id="dev-pos-z" style="width: 60px;">
                </div>
                <div class="dev-group" style="margin-top: 10px;">
                    <strong>Rotation (X, Y, Z)</strong><br>
                    <input type="number" step="1" id="dev-rot-x" style="width: 60px;">
                    <input type="number" step="1" id="dev-rot-y" style="width: 60px;">
                    <input type="number" step="1" id="dev-rot-z" style="width: 60px;">
                </div>
                <div class="dev-group" style="margin-top: 10px;">
                    <strong>Scale (X, Y, Z)</strong><br>
                    <input type="number" step="0.1" id="dev-scale-x" style="width: 60px;">
                    <input type="number" step="0.1" id="dev-scale-y" style="width: 60px;">
                    <input type="number" step="0.1" id="dev-scale-z" style="width: 60px;">
                </div>
                <div class="dev-group" id="dev-panel-settings" style="margin-top: 10px; display: none; border-top: 1px dashed #0f0; padding-top: 5px;">
                    <strong>UI Panel (Ponto Inicial XYZ)</strong><br>
                    Anchor X: <input type="number" step="0.1" id="dev-panel-x" style="width: 40px;">
                    Y: <input type="number" step="0.1" id="dev-panel-y" style="width: 40px;">
                    Z: <input type="number" step="0.1" id="dev-panel-z" style="width: 40px;"><br>
                    Start Scale: <input type="number" step="0.1" id="dev-panel-s" style="width: 60px;">
                </div>

                <div id="dev-children-container" style="margin-top: 15px; border-top: 1px dashed #0f0; padding-top: 10px; display: none;">
                    <strong>Filhos (Meshes do GLB)</strong>
                    <input type="text" id="dev-mesh-search" placeholder="🔍 Buscar mesh (ex: Door)..." style="width: 100%; margin-top: 5px; background: #000; color: #0f0; border: 1px solid #0f0; padding: 4px; box-sizing: border-box;">
                    <div id="dev-meshes-list" style="margin-top: 5px; font-size: 11px;"></div>
                </div>
            </div>
        `;

        document.body.appendChild(panel);
        
        // Populate after global config is loaded
        window.addEventListener(EVENTS.SCENE_LOADED, () => {
            this.populateDropdown();
        });

        // Attach DOM Listeners for Inputs
        setTimeout(() => this.attachInputListeners(), 100);
    }

    populateDropdown() {
        const select = document.getElementById('dev-obj-select');
        if (!select || !appState.getConfig()) return;

        /** @param {GabineteObject[]} objects @param {number} depth */
        const addOptions = (objects, depth) => {
            objects.forEach(obj => {
                const opt = document.createElement('option');
                opt.value = obj.id;
                const prefix = depth > 0 ? '└─ '.padStart(depth * 3 + 3, '  ') : '';
                opt.textContent = `${prefix}[${obj.id}] ${obj.name_key || obj.action || obj.type}`;
                select.appendChild(opt);
                if (obj.children) addOptions(obj.children, depth + 1);
            });
        };
        addOptions(appState.getObjects(), 0);

        select.addEventListener('change', (e) => {
            // @ts-ignore
            this.selectObject(e.target.value);
        });
    }

    setupListeners() {
        // Listen to clicks in the scene
        window.addEventListener(EVENTS.OBJ_CLICKED, (e) => {
            // @ts-ignore
            const id = e.detail;
            if (id) {
                const select = /** @type {HTMLSelectElement} */ (document.getElementById('dev-obj-select'));
                if (select) select.value = id;
                this.selectObject(id);
            }
        });

        // Listen for export and updates
        setTimeout(() => {
            const btnOrigin = document.getElementById('dev-origin-btn');
            if (btnOrigin) {
                let savedPosition = null;
                btnOrigin.addEventListener('click', () => {
                    if (!this.activeElementId) return;
                    const el = document.getElementById(this.activeElementId);
                    if (!el) return;
                    
                    const posX = /** @type {HTMLInputElement} */ (document.getElementById('dev-pos-x'));
                    const posY = /** @type {HTMLInputElement} */ (document.getElementById('dev-pos-y'));
                    const posZ = /** @type {HTMLInputElement} */ (document.getElementById('dev-pos-z'));
                    
                    if (btnOrigin.innerText.includes('X:0 Y:0 Z:0')) {
                        savedPosition = { x: posX.value, y: posY.value, z: posZ.value };
                        posX.value = "0"; posY.value = "0"; posZ.value = "0";
                        el.setAttribute('position', '0 0 0');
                        btnOrigin.innerText = '↩️ Restaurar Posição Anterior';
                    } else {
                        if (savedPosition) {
                            posX.value = savedPosition.x; posY.value = savedPosition.y; posZ.value = savedPosition.z;
                            el.setAttribute('position', `${savedPosition.x} ${savedPosition.y} ${savedPosition.z}`);
                        }
                        btnOrigin.innerText = '📍 Trazer para X:0 Y:0 Z:0';
                    }
                    // Dispara evento manual de update pros inputs
                    posX.dispatchEvent(new Event('input'));
                });
            }

            const btnSave = document.getElementById('dev-save-btn');
            if (btnSave) btnSave.addEventListener('click', () => this.exportConfig());

            const btnUpdate = document.getElementById('dev-update-btn');
            if (btnUpdate) btnUpdate.addEventListener('click', () => {
                localStorage.setItem('gabinete_kiosk_config', JSON.stringify(appState.getConfig()));
                window.location.reload();
            });

            const btnClear = document.getElementById('dev-clear-btn');
            if (btnClear) btnClear.addEventListener('click', () => {
                if(confirm("Tem certeza que deseja apagar os ajustes locais?")) {
                    localStorage.removeItem('gabinete_kiosk_config');
                    window.location.reload();
                }
            });

            const btnPublish = document.getElementById('dev-publish-btn');
            if (btnPublish) btnPublish.addEventListener('click', async () => {
                const proceed = confirm(
                    "Atenção: Você está enviando as alterações locais para o servidor oficial.\n\n" +
                    "As outras máquinas conectadas (Totens) receberão essa atualização automaticamente em até 5 minutos.\n\n" +
                    "Deseja prosseguir?"
                );
                
                if (proceed) {
                    const originalText = btnPublish.innerHTML;
                    
                    try {
                        const { showPinOverlay } = await import('./pin-overlay.js');
                        const auth = await showPinOverlay({ title: 'Destrancar Cofre' });
                        if (!auth.success) return;

                        btnPublish.innerHTML = "⏳ Sincronizando...";
                        btnPublish.style.background = "#f1c40f"; // yellow

                        const { forceSync } = await import('./sync-engine.js');
                        const result = await forceSync();
                        
                        if (result.success) {
                            btnPublish.innerHTML = "✅ Publicado com Sucesso!";
                            btnPublish.style.background = "#2ecc71"; // green
                        } else {
                            console.error("Erros de Sync:", result.errorDetails);
                            btnPublish.innerHTML = "❌ Erro (Veja o F12)";
                            btnPublish.style.background = "#e74c3c"; // red
                        }
                    } catch (e) {
                        console.error(e);
                        btnPublish.innerHTML = "❌ Falha Crítica";
                        btnPublish.style.background = "#e74c3c"; // red
                    }
                    
                    setTimeout(() => {
                        btnPublish.innerHTML = originalText;
                        btnPublish.style.background = "#00D1FF";
                    }, 4000);
                }
            });

            const searchInput = document.getElementById('dev-mesh-search');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    // @ts-ignore
                    const term = e.target.value.toLowerCase();
                    const list = document.getElementById('dev-meshes-list');
                    if (!list) return;
                    
                    list.querySelectorAll('.dev-mesh-item').forEach(item => {
                        const nodeName = item.getAttribute('data-mesh-name') || '';
                        if (term.length >= 3) {
                            // @ts-ignore
                            item.style.display = nodeName.toLowerCase().includes(term) ? 'block' : 'none';
                        } else {
                            // @ts-ignore
                            item.style.display = 'block';
                        }
                    });
                });
            }
        }, 100);
    }

    /** @param {string} id */
    selectObject(id) {
        this.activeElementId = id;
        const controls = document.getElementById('dev-controls');
        const childrenContainer = document.getElementById('dev-children-container');
        
        if (!id) {
            if (controls) controls.style.display = 'none';
            if (childrenContainer) childrenContainer.style.display = 'none';
            this.removeHighlight();
            return;
        }
        
        if (controls) controls.style.display = 'block';
        this.addHighlight(id);

        const el = document.getElementById(id);
        if (!el) return;

        // Escaneamento de GLB via A-Frame
        if (el.components['gltf-model']) {
            if (el.hasLoaded && el.getObject3D('mesh')) {
                this.renderMeshesList(id, el.getObject3D('mesh'));
            } else {
                el.addEventListener('model-loaded', () => {
                    this.renderMeshesList(id, el.getObject3D('mesh'));
                }, { once: true });
            }
        }

        // @ts-ignore
        const pos = el.getAttribute('position') || {x:0, y:0, z:0};
        // @ts-ignore
        const rot = el.getAttribute('rotation') || {x:0, y:0, z:0};
        // @ts-ignore
        let scale = el.getAttribute('scale') || {x:1, y:1, z:1};

        if (typeof scale === 'string') {
             const parts = scale.split(' ').map(Number);
             scale = {x: parts[0], y: parts[1], z: parts[2]};
        }

        // @ts-ignore
        document.getElementById('dev-pos-x').value = typeof pos.x === 'string' ? parseFloat(pos.x).toFixed(2) : pos.x.toFixed(2);
        // @ts-ignore
        document.getElementById('dev-pos-y').value = typeof pos.y === 'string' ? parseFloat(pos.y).toFixed(2) : pos.y.toFixed(2);
        // @ts-ignore
        document.getElementById('dev-pos-z').value = typeof pos.z === 'string' ? parseFloat(pos.z).toFixed(2) : pos.z.toFixed(2);

        // @ts-ignore
        document.getElementById('dev-rot-x').value = typeof rot.x === 'string' ? parseFloat(rot.x).toFixed(1) : rot.x.toFixed(1);
        // @ts-ignore
        document.getElementById('dev-rot-y').value = typeof rot.y === 'string' ? parseFloat(rot.y).toFixed(1) : rot.y.toFixed(1);
        // @ts-ignore
        document.getElementById('dev-rot-z').value = typeof rot.z === 'string' ? parseFloat(rot.z).toFixed(1) : rot.z.toFixed(1);

        // @ts-ignore
        document.getElementById('dev-scale-x').value = scale.x.toFixed(2);
        // @ts-ignore
        document.getElementById('dev-scale-y').value = scale.y.toFixed(2);
        // @ts-ignore
        document.getElementById('dev-scale-z').value = scale.z.toFixed(2);

        // Load Panel settings if they exist
        const configObj = appState.findObject(id);
        const panelGroup = document.getElementById('dev-panel-settings');
        if (configObj && configObj.panel) {
            if (panelGroup) panelGroup.style.display = 'block';
            let px=0, py = configObj.panel.anchor_y_offset || 1.2, pz=0;
            if (configObj.panel.anchor_offset) {
                const parts = configObj.panel.anchor_offset.split(' ').map(Number);
                px = parts[0]; py = parts[1]; pz = parts[2];
            }
            
            // @ts-ignore
            document.getElementById('dev-panel-x').value = px.toFixed(2);
            // @ts-ignore
            document.getElementById('dev-panel-y').value = py.toFixed(2);
            // @ts-ignore
            document.getElementById('dev-panel-z').value = pz.toFixed(2);
            // @ts-ignore
            document.getElementById('dev-panel-s').value = (configObj.panel.start_scale || 1).toFixed(2);
        } else {
            if (panelGroup) panelGroup.style.display = 'none';
        }
    }

    attachInputListeners() {
        const updateTransform = () => {
            if (!this.activeElementId) return;
            const el = document.getElementById(this.activeElementId);
            if (!el) return;

            // @ts-ignore
            const px = document.getElementById('dev-pos-x').value;
            // @ts-ignore
            const py = document.getElementById('dev-pos-y').value;
            // @ts-ignore
            const pz = document.getElementById('dev-pos-z').value;
            el.setAttribute('position', `${px} ${py} ${pz}`);

            // @ts-ignore
            const rx = document.getElementById('dev-rot-x').value;
            // @ts-ignore
            const ry = document.getElementById('dev-rot-y').value;
            // @ts-ignore
            const rz = document.getElementById('dev-rot-z').value;
            el.setAttribute('rotation', `${rx} ${ry} ${rz}`);

            // @ts-ignore
            const sx = document.getElementById('dev-scale-x').value;
            // @ts-ignore
            const sy = document.getElementById('dev-scale-y').value;
            // @ts-ignore
            const sz = document.getElementById('dev-scale-z').value;
            el.setAttribute('scale', `${sx} ${sy} ${sz}`);

            // Update Config Memory via appState
            const configObj = appState.findObject(this.activeElementId);
            if (configObj) {
                configObj.position = `${px} ${py} ${pz}`;
                configObj.rotation = `${rx} ${ry} ${rz}`;
                configObj.scale = `${sx} ${sy} ${sz}`;

                if (configObj.panel) {
                    // @ts-ignore
                    const pax = document.getElementById('dev-panel-x').value;
                    // @ts-ignore
                    const pay = document.getElementById('dev-panel-y').value;
                    // @ts-ignore
                    const paz = document.getElementById('dev-panel-z').value;
                    // @ts-ignore
                    const ps_scale = document.getElementById('dev-panel-s').value;
                    
                    configObj.panel.anchor_offset = `${pax} ${pay} ${paz}`;
                    configObj.panel.start_scale = parseFloat(ps_scale);
                    
                    if (this.anchorHelperEl) {
                        this.anchorHelperEl.setAttribute('position', `${pax} ${pay} ${paz}`);
                        const planeChild = this.anchorHelperEl.querySelector('a-plane');
                        if (planeChild) {
                            planeChild.setAttribute('scale', `${ps_scale} ${ps_scale} ${ps_scale}`);
                        }
                    }
                }
                
                // Salva a alteração no LocalStorage e marca como mais recente para o Sync Engine perceber!
                const cfg = appState.getConfig();
                if (cfg) {
                    stampConfig(cfg);
                    localStorage.setItem('gabinete_kiosk_config', JSON.stringify(cfg));
                }
            }
        };

        const inputs = document.querySelectorAll('#dev-controls > .dev-group input');
        inputs.forEach(inp => {
            inp.addEventListener('input', updateTransform);
            inp.addEventListener('change', updateTransform); // para setas do input type number
        });
    }

    renderMeshesList(objId, mesh) {
        const configObj = appState.findObject(objId);
        if (!configObj) return;

        const container = document.getElementById('dev-children-container');
        const list = document.getElementById('dev-meshes-list');
        if (!container || !list) return;

        container.style.display = 'block';
        list.innerHTML = '';

        const nodes = [];
        mesh.traverse((node) => {
            // Ignora cenas globais ou nós sem nome claro
            if (node.name && node.name !== 'Scene' && !node.name.startsWith('node_') && !node.name.startsWith('mesh_')) {
                nodes.push(node.name);
            }
        });

        const uniqueNodes = [...new Set(nodes)];

        if (uniqueNodes.length === 0) {
            list.innerHTML = '<i style="color:#888;">Nenhuma malha nomeada (Filho) encontrada no GLB.</i>';
            return;
        }

        uniqueNodes.forEach(nodeName => {
            const childConfig = (configObj.children || []).find(c => c.part_name === nodeName) || { role: 'static' };
            const isCol = childConfig.role === 'collider';
            const isAnim = childConfig.role === 'animation';

            const item = document.createElement('div');
            item.className = 'dev-mesh-item';
            item.setAttribute('data-mesh-name', nodeName);
            item.style.cssText = 'border: 1px solid #0a0; padding: 6px; margin-bottom: 6px; background: #111; border-radius: 4px;';

            item.innerHTML = `
                <div style="color: #fff; font-weight: bold; margin-bottom: 5px;">📦 ${nodeName}</div>
                <label style="margin-right: 10px; cursor:pointer;"><input type="checkbox" class="chk-col" ${isCol ? 'checked' : ''}> Física (Azul)</label>
                <label style="cursor:pointer;"><input type="checkbox" class="chk-anim" ${isAnim ? 'checked' : ''}> Gatilho de Animação</label>
                
                <div class="col-panel" style="display: ${isCol ? 'block' : 'none'}; margin-top: 5px; border-top: 1px dashed #0a0; padding-top: 5px;">
                    Scale XYZ:<br>
                    <input type="number" step="0.1" class="col-sx" value="${childConfig.scale ? childConfig.scale.split(' ')[0] : '1'}" style="width: 40px;">
                    <input type="number" step="0.1" class="col-sy" value="${childConfig.scale ? childConfig.scale.split(' ')[1] : '1'}" style="width: 40px;">
                    <input type="number" step="0.1" class="col-sz" value="${childConfig.scale ? childConfig.scale.split(' ')[2] : '1'}" style="width: 40px;">
                    <br>Offset XYZ:<br>
                    <input type="number" step="0.1" class="col-px" value="${childConfig.position ? childConfig.position.split(' ')[0] : '0'}" style="width: 40px;">
                    <input type="number" step="0.1" class="col-py" value="${childConfig.position ? childConfig.position.split(' ')[1] : '0'}" style="width: 40px;">
                    <input type="number" step="0.1" class="col-pz" value="${childConfig.position ? childConfig.position.split(' ')[2] : '0'}" style="width: 40px;">
                </div>

                <div class="anim-panel" style="display: ${isAnim ? 'block' : 'none'}; margin-top: 5px; border-top: 1px dashed #0a0; padding-top: 5px;">
                    Eixo: <select class="anim-axis" style="background:#000; color:#0f0; border:1px solid #0f0;">
                        <option value="x" ${childConfig.anim_axis === 'x' ? 'selected' : ''}>X</option>
                        <option value="y" ${childConfig.anim_axis === 'y' ? 'selected' : ''}>Y</option>
                        <option value="z" ${childConfig.anim_axis === 'z' ? 'selected' : ''}>Z</option>
                    </select><br>
                    Start Angle: <input type="number" class="anim-start" value="${childConfig.anim_start || 0}" style="width: 50px;">º<br>
                    End Angle: <input type="number" class="anim-end" value="${childConfig.anim_end || 0}" style="width: 50px;">º<br>
                    <button class="btn-test-anim" style="margin-top: 5px; background: #0a0; color: #000; border: none; cursor: pointer; padding: 4px 8px; font-weight:bold;">Testar Animação ▶</button>
                </div>
            `;

            const chkCol = item.querySelector('.chk-col');
            const chkAnim = item.querySelector('.chk-anim');
            const colPanel = item.querySelector('.col-panel');
            const animPanel = item.querySelector('.anim-panel');

            const saveChild = () => {
                if (!configObj.children) configObj.children = [];
                let c = configObj.children.find(ch => ch.part_name === nodeName);
                if (!c) {
                    c = { part_name: nodeName, role: 'static' };
                    configObj.children.push(c);
                }

                if (chkCol.checked) c.role = 'collider';
                else if (chkAnim.checked) c.role = 'animation';
                else c.role = 'static';

                if (chkCol.checked) {
                    c.scale = `${item.querySelector('.col-sx').value} ${item.querySelector('.col-sy').value} ${item.querySelector('.col-sz').value}`;
                    c.position = `${item.querySelector('.col-px').value} ${item.querySelector('.col-py').value} ${item.querySelector('.col-pz').value}`;
                }
                
                if (chkAnim.checked) {
                    c.anim_axis = item.querySelector('.anim-axis').value;
                    c.anim_start = parseFloat(item.querySelector('.anim-start').value || 0);
                    c.anim_end = parseFloat(item.querySelector('.anim-end').value || 0);
                }

                if (c.role === 'static') {
                    configObj.children = configObj.children.filter(ch => ch.part_name !== nodeName);
                }
                
                // Salva a alteração no LocalStorage e marca como mais recente para o Sync Engine perceber!
                const cfg = appState.getConfig();
                if (cfg) {
                    stampConfig(cfg);
                    localStorage.setItem('gabinete_kiosk_config', JSON.stringify(cfg));
                }
                
                // Rerenderiza os blocos azuis em tempo real!
                this.addHighlight(objId);
            };

            chkCol.addEventListener('change', (e) => {
                if (e.target.checked) chkAnim.checked = false;
                colPanel.style.display = e.target.checked ? 'block' : 'none';
                animPanel.style.display = 'none';
                saveChild();
            });

            chkAnim.addEventListener('change', (e) => {
                if (e.target.checked) chkCol.checked = false;
                animPanel.style.display = e.target.checked ? 'block' : 'none';
                colPanel.style.display = 'none';
                saveChild();
            });

            item.querySelectorAll('input, select').forEach(inp => inp.addEventListener('change', saveChild));

            const btnTest = item.querySelector('.btn-test-anim');
            btnTest.addEventListener('click', () => {
                const node3d = mesh.getObjectByName(nodeName);
                if (!node3d) return;
                const axis = item.querySelector('.anim-axis').value;
                const start = parseFloat(item.querySelector('.anim-start').value || 0);
                const end = parseFloat(item.querySelector('.anim-end').value || 0);

                // Snapshot da rotação original na primeira vez que clicar
                if (!node3d.userData.baseRotation) {
                    node3d.userData.baseRotation = {
                        x: node3d.rotation.x,
                        y: node3d.rotation.y,
                        z: node3d.rotation.z
                    };
                }
                
                // Sempre reseta para a base primeiro, para evitar "acúmulo" de eixos caso o dev mude o dropdown
                node3d.rotation.x = node3d.userData.baseRotation.x;
                node3d.rotation.y = node3d.userData.baseRotation.y;
                node3d.rotation.z = node3d.userData.baseRotation.z;
                
                if (!node3d.userData.isTestingOpened) {
                    node3d.rotation[axis] = THREE.MathUtils.degToRad(end);
                    node3d.userData.isTestingOpened = true;
                } else {
                    node3d.rotation[axis] = THREE.MathUtils.degToRad(start);
                    node3d.userData.isTestingOpened = false;
                }
            });

            list.appendChild(item);
        });
    }

    /** @param {string} id */
    addHighlight(id) {
        this.removeHighlight();
        const el = document.getElementById(id);
        if (!el) return;

        this.highlightEl = document.createElement('a-entity');
        const mainBox = document.createElement('a-box');
        mainBox.setAttribute('material', 'wireframe: true; color: #0f0; opacity: 0.8');
        
        // Tenta pegar o tamanho atual via bbox do Objeto Pai
        // @ts-ignore
        const mesh = el.getObject3D('mesh');
        if (mesh) {
            // Salva as transformações atuais
            const oldRot = el.object3D.rotation.clone();
            const oldScale = el.object3D.scale.clone();
            
            // Reseta temporariamente para (0,0,0) e (1,1,1) para pegar o tamanho LOCAL (AABB desrotacionado)
            el.object3D.rotation.set(0, 0, 0);
            el.object3D.scale.set(1, 1, 1);
            el.object3D.updateMatrixWorld(true);

            // @ts-ignore
            const box = new THREE.Box3().setFromObject(mesh);
            const size = box.getSize(new THREE.Vector3());

            // Restaura as transformações
            el.object3D.rotation.copy(oldRot);
            el.object3D.scale.copy(oldScale);
            el.object3D.updateMatrixWorld(true);

            mainBox.setAttribute('width', Math.max(size.x, 0.5) * 1.01);
            mainBox.setAttribute('height', Math.max(size.y, 0.5) * 1.01);
            mainBox.setAttribute('depth', Math.max(size.z, 0.5) * 1.01);
        } else {
            mainBox.setAttribute('scale', '1.1 1.1 1.1');
        }

        this.highlightEl.appendChild(mainBox);
        el.appendChild(this.highlightEl);

        // Renderiza os Colisores (Azul) criados nos Filhos GLB
        const configObj = appState.findObject(id);
        if (configObj && configObj.children && mesh) {
            configObj.children.forEach(c => {
                if (c.role === 'collider') {
                    const colBox = document.createElement('a-box');
                    // Usa depthTest: false para garantir que a linha azul passe por cima da malha (raio-x)
                    colBox.setAttribute('material', 'wireframe: true; color: #0088ff; opacity: 1; depthTest: false');
                    colBox.setAttribute('scale', c.scale || '1 1 1');
                    
                    // Devemos usar estritamente o Offset declarado (c.position), igual o main.js faz, 
                    // ignorando o node3d.position para não gerar falsos-positivos na produção
                    colBox.setAttribute('position', c.position || '0 0 0');
                    
                    this.highlightEl.appendChild(colBox);
                }
            });
        }
        if (configObj && configObj.panel) {
            this.anchorHelperEl = document.createElement('a-entity');
            
            // Ponto central (A-Sphere)
            const sphere = document.createElement('a-sphere');
            sphere.setAttribute('radius', '0.05');
            sphere.setAttribute('material', 'wireframe: true; color: #ff00ff');
            this.anchorHelperEl.appendChild(sphere);

            // Plano 16:9 para referência de proporção e escala
            const plane = document.createElement('a-plane');
            plane.setAttribute('width', '1.6'); // Ratio 16:9
            plane.setAttribute('height', '0.9');
            plane.setAttribute('material', 'wireframe: true; color: #ff00ff; opacity: 0.3; transparent: true; side: double');
            
            let pScale = configObj.panel.start_scale !== undefined ? configObj.panel.start_scale : 1.0;
            plane.setAttribute('scale', `${pScale} ${pScale} ${pScale}`);
            this.anchorHelperEl.appendChild(plane);
            
            // Posicionamento base
            let px=0, py=configObj.panel.anchor_y_offset || 1.2, pz=0;
            if (configObj.panel.anchor_offset) {
                const parts = configObj.panel.anchor_offset.split(' ').map(Number);
                px = parts[0]; py = parts[1]; pz = parts[2];
            }
            this.anchorHelperEl.setAttribute('position', `${px} ${py} ${pz}`);
            el.appendChild(this.anchorHelperEl);
        }
    }

    removeHighlight() {
        if (this.highlightEl && this.highlightEl.parentNode) {
            this.highlightEl.parentNode.removeChild(this.highlightEl);
        }
        this.highlightEl = null;

        if (this.anchorHelperEl && this.anchorHelperEl.parentNode) {
            this.anchorHelperEl.parentNode.removeChild(this.anchorHelperEl);
        }
        this.anchorHelperEl = null;
    }

    exportConfig() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState.getConfig(), null, 4));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", "config_atualizado.json");
        dlAnchorElem.click();
        dlAnchorElem.remove();
        console.log("✅ Arquivo JSON Exportado!");
    }
}

export const devEditor = new DevEditor();
