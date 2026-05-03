---
description: Assistente interativo de Cena 3D e Modelos.
---

# 📦 Workflow: /update-3d

Este fluxo guia a configuração do ambiente 3D, iluminação e modelos externos (GLB).

## 🚀 Passos do Workflow

1. **Mapeamento de Assets**: O Agente lista os arquivos em `assets/models/`.
2. **Ciclo Socrático**: O Agente pergunta sobre:
   - **Ambiente**: Skybox, Exposição e Cor ambiente.
   - **Objetos**: Adicionar novas primitivas ou modelos externos (.glb).
   - **Iluminação**: Intensidade e sombras.
3. **Escrita de Config**:
   - Atualiza `assets/config.json`.
   - Documenta em `GABINETE_DESIGN_SYSTEM.md` na seção A-Frame.
4. **Log**: Registra no `DESIGN_HISTORY.md`.

// turbo
5. **Execução de Script**: Rodar `python .agent/scripts/project_sync.py --area 3d` para validar os caminhos.
