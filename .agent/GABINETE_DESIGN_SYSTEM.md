# 🎨 Sistema de Design: Gabinete Virtual

> **MANDATÓRIO:** Este documento deve ser lido antes de qualquer alteração na interface (HTML/CSS) ou no cenário 3D. 
> Baseado em: **Material Design 3** + **A-Frame Performance Best Practices**.

---

## 💎 1. Design Tokens (Estética Premium)

### Cores (Cyan/Orange Mix)
- **Principal:** `#00D1FF` (Cyan) - Para botões, ícones interativos e realces.
- **Destaque:** `#FF6B00` (Orange) - Para estados de alerta, hotspots secundários ou calibração.
- **Fundo:** `#000000` (Preto) ou `#121212` (Cinza muito escuro).
- **UI Base (Padrão):** Fundo sólido/translúcido `rgba(30, 30, 30, 0.9)` sem `backdrop-filter` para garantir legibilidade e máxima performance constante independente do processador.
- **Vidro (Progressive Enhancement):** O *Glassmorphism* (`rgba(255, 255, 255, 0.1)` e `backdrop-filter`) deve ser tratado como aprimoramento. Injetar via classe `.hw-high-tier` *apenas* se suportado.

### Cores Institucionais (Imutáveis)
> Estas cores devem ser respeitadas independentemente da paleta visual do projeto.
- **Marca Principal:** (A definir pelo usuário) - Usada em Logos e Splash Screen.
- **Status (Sucesso):** `#4CAF50`.
- **Status (Erro):** `#F44336`.
- **Aplicação:** Logomarca no Splash Screen e ícones de conformidade técnica.

### Tipografia
- **Títulos:** Font `Outfit`, Sans-serif. Bold/Semi-bold.
- **Corpo:** Font `Inter`, Sans-serif.
- **A-Frame:** Usar fontes SDF (JSON + PNG) obrigatoriamente para garantir nitidez.
- **Escala:** Proporção harmônica baseada em *Major Second* para interfaces técnicas e *Golden Ratio* (1.618) para títulos hero.

---

## 📐 2. Layout e Grid (8-Point Grid System)

### Sistema de Espaçamento
- **Base:** Todo espaçamento (padding, margin, gap) e dimensionamento deve ser múltiplo de **8px**.
  - **Tight:** 4px (meio-passo para micro-ajustes).
  - **Small:** 8px.
  - **Medium:** 16px.
  - **Large:** 24px, 32px.
  - **XL:** 48px, 64px, 80px.

### Sistema Adaptativo
- **Mobile/Tablet Vertical:** 4 Colunas. Side margins 24px.
- **Desktop/Tablet Horizontal (12.9"):** 12 Colunas. Side margins 40px.
- **Margem de Segurança (Kiosk Frame):** 48px de padding obrigatório em todas as extremidades para evitar cortes por molduras físicas.

### Topologia de Interface (Apple Style)
- **Cards:** Uso de "Floating Cards" com `border-radius: 24px` e sombras suaves (`0 8px 32px rgba(0,0,0,0.3)`).
- **Glassmorphism:** Aplicado apenas nos cards, mantendo o fundo da cena limpo.
- **Painel de Info:** Implementado como **Lateral Drawer** (Gaveta Lateral) que desliza da direita para a esquerda, ocupando 30-40% da largura, liberando o centro para visualização do objeto 3D.

---

## 🔘 3. Interatividade e UX

### Feedback (Princípio de Resposta)
- **3D Hover:** Aumentar escala para `1.1` e ativar `self-illumination` no objeto por 200ms.
- **Micro-interações (Som):** Uso de sons sutis de "clique" ou "vidro" para ações bem-sucedidas (opcional via config).
- **Exit Paths:** 
  - Botão "Voltar" (`push/pop`) sempre visível em pilhas > 1.
  - **Click Outside:** Permitir fechar o Lateral Drawer clicando em qualquer área vazia da cena 3D.

### Resiliência e Estados de Erro
- **Mensagem Amigável:** Em caso de falha técnica, evitar códigos de erro crus. Usar linguagem de museu: *"Estamos polindo as peças do museu, tente novamente em instantes."*
- **Visibilidade:** Loader (Splash Screen) visível até que `A-Frame` e `Assets` estejam 100% prontos.
- **Prevenção de Erros:** Bloquear zoom do navegador e gestos de sistema via meta-tags.

---

## ⚡ 4. Padrões de Código (Performance)

### A-Frame HTML
- **Asset Hub:** Sempre usar `<a-assets>` com IDs claros.
- **Renderização:** Preferir `renderer="precision: lowp"` para hardware Android sem GPU.
- **Mixins:** Usar mixins para evitar repetição de atributos em entidades dinâmicas.

### CSS
- **GPU-Only:** Animar apenas `transform` e `opacity`.
- **Blur Enhancement:** O CSS padrão não utilizará `backdrop-filter`. Apenas adicione este efeito se o gerenciador de estado aplicar a classe `.hw-high-tier` baseado em telemetria positiva (FPS alto).

---

> [!CAUTION]
> **NÃO** utilize templates genéricos da web. O design deve ser original, minimalista e focado na imersão 3D.
