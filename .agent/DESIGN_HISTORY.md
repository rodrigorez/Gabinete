# 📜 Histórico de Alterações: Sistema de Design

Toda alteração estratégica de design (Cores, Grids, UX) será registrada aqui como fonte auditável para o projeto.

---

## [31 de Março de 2026] - Inicialização do Sistema
- **Alteração:** Definição da base do Design System.
- **Antes:** N/A (Greenfield).
- **Depois:** Ciano (#00D1FF), Laranja (#FF6B00), Glassmorphism, Outfit/Inter Typography.
- **Motivo:** Criação da estética premium para o MVP do Gabinete Virtual.

## [31 de Março de 2026] - Conclusão da Fase 1 (Cores)
- **Alteração:** Definição final de paleta de cores, fallback de GPU e seção de Cores Institucionais.
- **Antes:** Cores Ciano/Laranja simples. Sem regras de fallback. Sem seção institucional.
- **Depois:** Inclusão de Fallback (V2: Fundo Sólido #1E1E1E) e Seção Imutável de Cores Institucionais.
- **Motivo:** Garantir consistência visual mesmo se o projeto mudar de tema e assegurar performance em hardware legado (Regra de Kiosk).

## [31 de Março de 2026] - Conclusão da Fase 2 (Tipografia e Espaçamento)
- **Alteração:** Padronização do sistema de grade de 8 pontos e obrigatoriedade de Fontes SDF.
- **Antes:** Tipografia definida mas sem regras de escala ou espaçamento de grid.
- **Depois:** Implementação do **8-Point Grid System** e regra de fontes SDF para 3D.
- **Motivo:** Escalar a interface para tablets sem quebras de layout e manter nitidez textual absoluta no ambiente A-Frame.

## [31 de Março de 2026] - Conclusão da Fase 3 (Layout e Topologia)
- **Alteração:** Definição de **Apple-Style Floating Cards (24px)** e **Lateral Drawer** com margem de segurança de **48px**.
- **Antes:** Layout de grid simples e z-index rudimentar. Sem definição de topologia de cards.
- **Depois:** Estrutura robusta de camadas, gaveta lateral à direita e proteção contra molduras físicas.
- **Motivo:** Otimização para tablets em móveis físicos (Museu) e liberação da visão central do objeto 3D.

## [31 de Março de 2026] - Conclusão da Fase 4 (UX e Heurísticas)
- **Alteração:** Definição de micro-interações de som, fechamento por "Click Outside" e substituição de erros técnicos por mensagens amigáveis ("Estamos polindo as peças do museu").
- **Antes:** UX rudimentar e mensagens técnica (404/Erro). Sem fechamento fora do modal.
- **Depois:** Experiência de museu imersiva e resiliente. Gestão de inatividade e feedback sonoro premium.
- **Motivo:** Melhorar a experiência do usuário leigo no museu e garantir a "volta ao estado inicial" automática do quiosque.

## [31 de Março de 2026] - Implementação do Gestor de Projeto Organizado
- **Alteração:** Criação das rotinas `/update-layout`, `/update-3d` e `/update-audio`. Reestruturação da pasta `assets/` em subdiretórios técnicos.
- **Antes:** Rotinas manuais e assets em uma única pasta.
- **Depois:** Fluxos automatizados via workflows e script de sincronização (`project_sync.py`). Assets organizados por tipo (audio, models, images).
- **Motivo:** Formalizar a "Sessão de Revisão" solicitada pelo usuário e garantir escalabilidade e manutenção profissional (PT-BR comments).
