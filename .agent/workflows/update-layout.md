---
description: Assistente interativo de Layout e UI.
---

# 🎨 Workflow: /update-layout

Este fluxo guia o Antigravity na revisão e atualização dos tokens de design visual e interface.

## 🚀 Passos do Workflow

1. **Leitura Preditiva**: O Agente lê o `GABINETE_DESIGN_SYSTEM.md` atual.
2. **Ciclo Socrático**: O Agente pergunta sobre:
   - **Cores**: Primária, Destaque, Fundo e Cores Institucionais.
   - **Espaçamento**: Ajustes na Grade de 8 pontos.
   - **Geometria**: Arredondamento (Apple Style vs Técnico).
   - **Tipografia**: Outfit vs Inter e escalas.
3. **Validação Técnica**: O Agente checa acessibilidade (contraste WCAG).
4. **Sincronização**:
   - Atualiza `GABINETE_DESIGN_SYSTEM.md`.
   - Atualiza `styles.css` (variáveis `:root`).
   - Registra no `DESIGN_HISTORY.md`.

// turbo
5. **Execução de Script**: Rodar `python .agent/scripts/project_sync.py --area layout` para garantir paridade.
