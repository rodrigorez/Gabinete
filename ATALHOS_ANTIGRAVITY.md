# ⚡ Guia Rápido de Atalhos do Antigravity

Este documento lista os fluxos de trabalho principais (`workflows`) construídos via comandos no chat (Slash Commands) para orquestrar rapidamente o desenvolvimento deste projeto. 

Ao invés de prompts complexos, digite os comandos abaixo no chat para ativar fluxos padronizados.

## Comandos Principais (Desenvolvimento)

- **`/brainstorm`** - Use para debater opções de estrutura (Ex: "Como modelar a luz ideal para o painel em baixo FPS?"). Inicia um processo Socrático de perguntas para projetar uma nova funcionalidade antes de sair escrevendo código.
- **`/plan`** - Aciona o `project-planner` para montar um plano de execução passo-a-passo (sempre faz isso antes de refatorações massivas ou novas telas).
- **`/ui-ux-pro-max`** - Foca 100% na estética e design visual. Aplique isso quando formos estilizar os painéis ou implementar ajustes avançados que envolvam o Design System M3.
- **`/enhance`** - O comando focado em implementar e melhorar. Ideal para pedir que eu assuma o código existente e adicione um novo bloco funcional (ex: "Adicione o Timer do Kiosk Mode").
- **`/debug`** - Modo focado na investigação sistemática. Trava o modo de geração de código aleatório e força a descoberta da causa raiz primeiro (ex: "As texturas do Android não estão carregando, `/debug`").
- **`/test`** - Exige que o agente (eu) valide as regras, rode checagens ou crie procedimentos de teste em cima do que acabou de ser feito.

## Atalhos Específicos do Gabinete Virtual (Novos)
Para evitar perda de contexto ou bagunça arquitetural, criamos comandos especializados para atualizar nichos específicos deste projeto:

- **`/update-3d`** - Chame isso quando o assunto for apenas o ambiente WebGL, importar modelos `.glb`, aplicar texturas ou gerenciar lógica espacial (Câmera, Luzes, A-Frame).
- **`/update-layout`** - Chame isso para modificar o CSS e os elementos do DOM HTML fora do A-Frame (Os menus, as Modais Híbridas, Splash Screen).
- **`/update-audio`** - Direcionado apenas para a inserção de efeitos sonoros espaciais ou *feedback sonoro* em interações de clique interativo.

## Comandos Operacionais (Controle Local)
- **`/preview`** - Inicia ou verifica a saúde do servidor local (Dev Server) e diz em qual porta (geralmente `:3000`) o modelo 3D está rodando no seu navegador.
- **`/status`** - Avalia e imprime o atual `task.md`, os agentes ativos e as próximas prioridades para você não perder o fio da meada.
- **`/deploy`** - Executará checagens profundas de segurança local antes de autorizar subirmos o código de produção em um host otimizado.

---
> 💡 **Dica Extra:** Se precisar forçar uma especialidade da IA sem ativar um workflow grande, você pode marcar um de nós com `@`. Por exemplo:
> *"@[frontend-specialist] valide as margens desse painel de informação"* ou *"@[debugger] por favor encontre o problema de vazamento de textura."*
