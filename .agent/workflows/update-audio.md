---
description: Assistente interativo de Áudio e Feedback Sonoro.
---

# 🎵 Workflow: /update-audio

Este fluxo gerencia a camada sonora do projeto, garantindo imersão e feedback.

## 🚀 Passos do Workflow

1. **Varredura de Audio**: O Agente lista os arquivos em `assets/audio/`.
2. **Ciclo Socrático**: O Agente pergunta sobre:
   - **Sons de Interação**: Click, Hover e Sucesso (nomes técnicos em inglês).
   - **Ambiente**: Loop de trilha sonora ou ruído de ambiente de museu.
   - **Volume e Fallbacks**: Regras para silenciamento se necessário.
3. **Escrita de Config**:
   - Atualiza `assets/config.json` com os novos endpoints de áudio.
   - Documenta em `GABINETE_DESIGN_SYSTEM.md`.
4. **Log**: Registra no `DESIGN_HISTORY.md`.

// turbo
5. **Execução de Script**: Rodar `python .agent/scripts/project_sync.py --area audio` para checar existência física dos arquivos.
