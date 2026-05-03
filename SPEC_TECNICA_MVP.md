# Especificação Técnica: MVP Gabinete Virtual A-Frame

Este documento define os requisitos técnicos detalhados para a construção do Mínimo Produto Viável (MVP).

## 💎 1. Regras Pétreas de Desenvolvimento (Inquestionáveis)

Para garantir a evolução técnica e a manutenibilidade do projeto, todo o código deve seguir estes princípios sem exceção:

1.  **Zero Magic Numbers:** NENHUM número ou string de configuração deve estar solto no meio da lógica. Todas as constantes devem ser declaradas em `assets/config.json` ou variáveis de configuração centralizadas em `js/config.js`.
2.  **Modularidade Total:** Cada elemento do cenário ou da interface deve ser uma Função ou Classe isolada. O sistema deve operar via **Injeção de Dependência** e **Eventos**, nunca via manipulação direta de variáveis globais de outros módulos.
3.  **Encapsulamento A-Frame:** A lógica de negócio deve ser encapsulada em *Custom Components* ou *Systems* do A-Frame, evitando scripts "soltos" no HTML.
4.  **Hardware-First:** O código deve sempre consultar o `hardware-profiler` antes de instanciar recursos pesados.
5.  **Adaptive Quality:** O sistema deve reduzir dinamicamente o `devicePixelRatio` se o FPS cair abaixo de 30 para manter a fluidez.
6.  **Fail-Safe Assets:** Todo carregamento de textura ou modelo GLB deve possuir um "Material de Fallback" para evitar cenas vazias em caso de erro.
7.  **Data-Driven Scene:** A cena inicial e os objetos são carregados dinamicamente a partir de um JSON. O HTML serve apenas como container estrutural.
8.  **Ugly First (UI):** O processo de construção deve garantir o *layout* operando as regras lógicas e empilhamentos do DOM antes que estilos sofisticados ou transparentes sejam adicionados (Desacoplamento Visual-ECA).
9.  **Deep WebGL Disposal:** Ao descartar elementos HTML do A-Frame, force a limpeza interna das texturas, geometrias e malhas de material atreladas para afastar ocorrência de *out-of-memory* do Chrome.
10. **Raycast on Demand:** Exclua verificação em loop. O objeto raycaster existirá, mas cálculos se farão só nos momentos precisos da intenção do toque do dedo ou mouse.
11. **Validação JSDoc Estrita do Data-Driven:** A cena não "suporá" nada sobre o `config.json`. Contratos imperativos visuais de JSDoc (`// @ts-check`) garantirão validação da leitura limpa antes da injeção.
12. **Sistema Imutável de Eventos:** Emissão ou observação de mensagens pelo WebGL ou UI se valerão estritamente de Dicionários Globais Congelados (ex: `EVENTS.KIOSK_RESET`) centralizados, liquidando "strings mágicas" eventuais errôneas.

---

## 🎯 2. Escopo do MVP (Refinado)

O foco do MVP é a estabilidade do Modo Quiosque e a validação da interface irregular com placeholders técnicos.

### Funcionalidades Inclusas:
1.  **Cena Base:** Ambiente 3D otimizado (Offline-First).
2.  **Objetos Interativos (2 Unidades):** Implementados como classes modulares prontas para clonagem/Data-Driven.
3.  **Modo Quiosque (Prioridade):** Sistema de auto-reset por inatividade e gesto de segurança funcional.
4.  **Placeholders Técnicos:** Uso de formas geométricas customizadas em vez de modelos finais.
5.  **Interface de Painel Fixo (Data-Driven):** UI 3D com design assimétrico/irregular, mantendo o padrão de "Imagem + Texto" alimentado pelo `config.json`.
6.  **Navegação Híbrida:** Sistema de câmera adaptável para Touch (Look-at) e Desktop (WASD).
7.  **Pilha de Navegação (Stack Manager):** Botão "Voltar" desacoplado com suporte a histórico multinível.
8.  **Editor On-Device (DevTools):** Ajuste espacial da UI 3D direto no dispositivo (via URL `?dev=true` ou `?admin=true` pelo painel administrativo), persistindo `localStorage` para atualizações dinâmicas no museu.


---

## 🛠️ 2. Especificação de Componentes (A-Frame)

Registraremos os seguintes componentes customizados em `js/components.js`:

### `interactive-object`
- **Descrição:** Anexa comportamentos de interação a uma entidade de forma robusta, escutando `click`, `mousedown` e `touchstart` com lógica de debounce (500ms) para evitar disparos múltiplos ou fantasmas. Ao interagir, emite o evento `OBJ_CLICKED` e insere o objeto na pilha de navegação (`nav.push`), abrindo a interface multimídia e disparando as rotinas de tracking.
- **Relação com Raycaster:** Trabalha em conjunto com o `raycaster="objects: [interactive-object], .clickable; interval: 100"` da cena base para garantir o reconhecimento de malhas dinâmicas carregadas assincronamente (ex: GLTF Models).

### `gltf-part-animation`
- **Descrição:** Anima partes internas de um modelo GLTF (ex: portas, gavetas) de forma independente.
- **Propriedades:** 
  - `partName` (Nome da malha dentro do GLTF).
  - `property` (Propriedade animada, ex: `rotation`).
  - `to` (Vetor alvo, ex: `0 -45 0`).
  - `dur` (Duração em ms).

### `ui-stack-manager` (StackManager)
- **Pseudo-código (Lógica de Pilha):**
  ```javascript
  class StackManager {
    push(viewId, metadata) {
      this.history.push({viewId, meta: metadata});
      this.transitionTo(viewId);
      this.emit('ui-push', {viewId, metadata});
    }
    pop() {
      if (this.history.length > 1) {
        this.history.pop();
        const prev = this.history[this.history.length-1];
        this.transitionTo(prev.viewId);
        this.emit('ui-pop', {viewId: prev.viewId});
      }
    }
  }
  ```

### `kiosk-mode` (Segurança e Reset)
- **Pseudo-código (Gesto & PIN):**
  ```javascript
  // Layer DOM transparente (0,0) dim: 15vw x 15vh
  let taps = 0, lastTap = 0;
  domOverlay.on('pointerdown', (e) => {
    let now = Date.now();
    if (now - lastTap < 500) taps++; else taps = 1;
    lastTap = now;
    if (taps >= 3) showPinModal(); // Modal de PIN de 6 dígitos
  });

  // PIN de 6 dígitos com lockout de 30s após 3 tentativas
  function showPinModal() {
    // Renderiza modal inline com teclado numérico
    // Valida contra GABINETE_CONFIG.KIOSK.ADMIN_PIN
    // Sucesso: window.location.href = 'adm.html'
    // Falha (3x): lockout 30s com contador visual
  }

  // Timeout por inatividade
  window.onInteraction = () => {
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      emit(EVENTS.KIOSK_RESET);
      location.reload();
    }, GABINETE_CONFIG.KIOSK.TIMEOUT_MS);
  };
  ```

### `hardware-profiler`
- **Ação:** Se detectado Renderer Software (sem GPU), ativa flag `renderer="precision: lowp; antialias: false; foveationLevel: 3"`.

---

## 📊 3. Estrutura de Log de Interações (Zero-Admin)

Os logs são salvos no `LocalStorage` sob a chave `gabinete_interacoes_v1` como um **array flat** de entradas individuais:

```json
[
  {
    "timestamp": "2026-03-29T20:30:00.000Z",
    "sessionID": "a1b2c3d4",
    "action": "object_click",
    "data": { "objectId": "test_cabinet_v5" }
  },
  {
    "timestamp": "2026-03-29T20:31:12.000Z",
    "sessionID": "a1b2c3d4",
    "action": "panel_close",
    "data": {}
  }
]
```
*O sistema grava cada evento individualmente. O `KIOSK_RESET` por inatividade encerra a sessão e executa `location.reload()`.*

**Lógica de Purge (Manutenção):**
- **Trigger:** Ao salvar logs, se a ocupação do LocalStorage ultrapassar 4MB (limite seguro de 5MB).
- **Ação:** Remove registros mais antigos um a um até que a ocupação caia para < 50%.
- **Alerta:** Emite `EVENTS.STORAGE_WARNING` quando a ocupação ultrapassa 80%.

---

## 📦 4. Requisitos de Ativos (Assets)

Para que o MVP funcione com performance no Android, os ativos fornecidos futuramente devem seguir:

> [!TIP]
> **Asset Pipeline Automático**: A conversão das imagens grandes de Photoshop/Figma para `.webp`, incluindo as variantes otimizadas de resolução dupla documentadas na tabela, **não deverá** ser feita manualmente. Operaremos um script local `scripts/optimize-assets.js` (uso via `sharp`) para converter os insumos da pasta `/raw` diretamente pro formato exigido abaixo num simples run do terminal (`npm run optimize-assets`).

| Ativo | Formato Recomendado | Resolução (Geral) | Resolução (No GPU) |
| :--- | :--- | :--- | :--- |
| **Imagem Painel** | Otimizado via Script para `.webp` | 1024x1024px | 512x512px |
| **Ícones / Botões** | `.png` (Alpha) ou WebP T. | 256x256px | 256x256px |
| **Modelos 3D** | `.glb` | ~5MB | Simplificado (Low-poly) |
| **Fontes (SDF)** | `.json` + `.png` | **Inter** (Textos) | **Outfit** (Títulos) |

---

## 🏛️ 6. Estrutura Data-Driven (`assets/config.json`)

```json
{
  "version": "1.0.0",
  "settings": {
    "kioskTimeoutMs": 300000,
    "env": {
      "sky": "assets/images/env_bg.png",
      "exposure": 1
    }
  },
  "objects": [
    {
      "id": "gabinete_01",
      "name_key": "Gabinete Histórico",
      "type": "gltf-model",
      "model": "assets/models/gabinete_low.glb",
      "timing": {
        "doorDur": 1250,
        "fadeDur": 1000,
        "waitOpen": 0,
        "waitClose": 0
      },
      "panel": {
        "title_key": "Gabinete Premium",
        "description_key": "Texto descritivo do gabinete.",
        "start_scale": 0.2,
        "anchor_y_offset": 1.2,
        "blend_y_ratio": 0.5,
        "easing_open": "cubic-bezier(0.85, 0, 1, 1)",
        "easing_close": "cubic-bezier(0.1, 1, 0.2, 1)",
        "video": { "src": "assets/videos/demo.mp4" },
        "galleries": [
          {
            "id": "gal_a",
            "images": ["assets/images/foto1.webp"]
          }
        ]
      },
      "children": [
        {
          "id": "porta_esquerda",
          "type": "entity",
          "action": "gltf-part",
          "part_name": "portaE",
          "anim_target": "rotation",
          "anim_to": "0 0 -45"
        }
      ]
    }
  ]
}
```

---

## 🚀 7. Roadmap de Implementação (Status)
1. **Fase 0 (Concluída):** Setup PWA + Config JSON Parser funcional.
2. **Fase 1 (Concluída):** Cena Base e Câmera Híbrida operacionais. Hardware Profiling v1.
3. **Fase 2 (Concluída):** Componente `interactive-object` integrado ao `config.json`.
4. **Fase 3 (Concluída):** Sistema de Pilha de UI (`NavigationManager`) com funcionalidade de Retrocesso.
5. **Fase 4 (Concluída):** Lógica de Logs e Timeout (Modo Quiosque) integrada ao LocalStorage.
6. **Fase 5 (Concluída):** Motor AR Spatial Tracking 60fps (Projeção Matemática 3D->2D 100% parametrizada via JSON).
7. **Fase 6 (Concluída):** Estabilização Enterprise (FSM para bloqueio de inputs, Pre-loading de Mídia e SW PWA com Cache-First Dinâmico Runtime).
8. **Fase 7 (Concluída):** UI/UX Responsiva Multitela (Adaptação da UI Multimídia para telas estreitas como Celulares e Totens Verticais, aplicando layout Flexbox de quebra de linha).
9. **Fase 8 (Concluída):** Engine de Física Kiosk-Level (Gravidade, Pulo, Agachamento e Colisões Cilíndricas) e Animação de sub-partes GLTF (Abertura de portas).
10. **Fase 9 (Concluída):** Estabilização de Interação Dinâmica e HMR. Refatoração do `interactive-object` (debounce multi-eventos), otimização da frequência do A-Frame `raycaster` para detecção de malhas injetadas em Runtime, e atualização do Service Worker (`sw.js`) para ignorar requisições em `localhost` durante o desenvolvimento e auto-atualizar clientes (`skipWaiting`/`clients.claim()`), garantindo hot-reload (HMR) contínuo.
11. **Fase 10 (Concluída):** DevTools On-Device e Escalabilidade PWA. Ferramenta de edição via URL `?dev=true` operando em Runtime no dispositivo, persistindo configurações 3D (Translação XYZ e Escala de UI) atráves de Cache LocalStorage (`gabinete_kiosk_config`). Sistema blindado contra Memory Leaks via Component Disposal automático e suporte nativo à taxonomia isolada em diretórios por obra (`assets/01_obra/`, `assets/02_obra/`).

---

## 📝 8. Observações para Fases Futuras (Pós-MVP)

Durante a análise contínua da especificação, os seguintes pontos foram endereçados ou mapeados para o futuro:

1.  **Arquitetura Data-Driven (Endereçado):** Todo o painel UI e rastreamento AR agora são configuráveis no `config.json`.
2.  **State Machine & Memory (Endereçado):** FSM rigorosa implementada no `main.js` para ignorar cliques duplos. Mídia removida e gerida inteligentemente via DOM Injection/Destruction.
3.  **Resiliência Offline (Endereçado):** Service Worker (PWA) dinâmico implementado. Todo asset chamado via rede é interceptado e gravado no Cache Storage para suporte a ambientes desconectados. Conta com bypass automático de cache para acessos via `localhost` ou `127.0.0.1`, evitando sequestros de HMR durante a programação de novas funcionalidades. Instalação agressiva via `skipWaiting` implementada para deploys silenciosos sem travamento do cliente.
4.  **Física e Animações de Malha (Endereçado):** Motor customizado ES Module (`physics.js`) para gravidade e colisões cilíndricas. Componente customizado `gltf-part-animation` resolveu animações de portas desacopladas.
5.  **Robustez de Logs (Parcial):** Evento `EVENTS.STORAGE_WARNING` definido no dicionário e lógica de purge por bytes implementada em `kiosk-mode.js`. Falta implementar o alerta visual/DOM quando o LocalStorage atingir 80%.
6.  **Áudio e Feedback Sensorial (Futuro):** Adicionar sound design ao rastreamento espacial da câmera e micro-interações dos botões HTML.
7.  **Gerenciamento LOD/Culling (Futuro):** Implementar Lazy Loading e Low-Poly impostors caso o número de GLBs no `config.json` exceda a VRAM do dispositivo.
8.  **UI/UX Responsiva Multitela (Endereçado):** Design System da interface multimídia refatorado. Utiliza Media Queries exclusivas para o modo portrait (Mobile/Totens), assumindo 100% da viewport (100vw/100vh) e implementando Wrap flexível (`flex-wrap: wrap; flex: 1 1 calc(50% - 10px)`) para organizar botões e menus de navegação em múltiplas colunas sem scroll ou cortes.
9.  **Escalabilidade Produtiva (Endereçado):** Padrão estrito de nomeação e isolamento por diretório validado e Editor On-Device permitindo atualizações de parâmetros espaciais (`anchor_offset`) sem requerer rebuild ou manipulação física de arquivos no servidor do museu.

