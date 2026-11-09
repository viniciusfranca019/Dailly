---
type: Feature
title: Tasks, criar rápido com C
description: C, fora de um campo de texto e em qualquer tela, abre um formulário flutuante com título, status e prioridade no último board usado; confirmar cria a tarefa no topo do status.
tags: [tasks, criar, atalho, shell]
status: stable
since: 0.1.22
generated: { by: regulus/claude-opus-5-5, at: 2026-11-09T13:30:00-03:00 }
---

# O que faz

- **C** (ou Shift+C), com o foco fora de um campo de texto, abre sobre qualquer tela um
  formulário com o título vazio e focado, o status no primeiro "a fazer" do board e a
  prioridade "sem". O board é o último usado no Tasks; sem ele, ou com um que não existe
  mais, é o primeiro ("Tasks").
- Dentro de um campo (o composer do Daily Log, um select, um bloco editável) o C é texto,
  e com a busca ou o próprio formulário abertos também.
- Enter no título ou "Criar tarefa" cria a tarefa no topo do status escolhido, com a
  prioridade escolhida, e fecha o formulário. Com o Tasks na tela, no mesmo board, o
  board relê e a tarefa aparece; em qualquer outro lugar, a tela mostra por alguns
  segundos "CASA-2 criada".
- Título vazio mostra "o título é obrigatório" no formulário, que continua aberto. Se a
  API não responde, o erro aparece ali e o título continua no campo.
- Esc fecha sem criar e devolve o foco a quem o tinha.

# Regras

- **RN15**: o C não tem Ctrl, ⌘ nem Alt, porque Ctrl+C é copiar; por isso só vale fora
  de um campo.
- **RN8**: a tarefa nasce "sem" quando ninguém escolhe. `POST /tasks` aceita `priority`
  opcional, de 0 a 4, numa gravação só; fora disso é 400 nomeando `priority`, como o
  `PATCH`. Criar e depois mudar a prioridade foi descartado: são duas gravações, e a
  segunda pode falhar deixando a tarefa pela metade.
- O formulário usa a costura de comandos da F9 ([Módulos](/conventions/modules.md)): o
  comando `create`, de atalho `c`, no manifesto do Tasks, e o componente
  `QuickCreate.vue`. O aviso "criada" é o `notify` do shell, que vive depois de a camada
  fechar.
- O Tasks na tela fica sabendo da tarefa por `model/created.ts`, um estado do próprio
  módulo, como o pedido de abertura da busca; o shell não carrega o aviso. O board que é
  o da tarefa a toma e relê, e aí não há o aviso curto.

# Onde mora

- `ui/src/modules/tasks/ui/create/QuickCreate.vue`, `model/created.ts`, o `Tasks.vue`
  que relê
- `ui/src/shared/command.ts` (Shift na letra solta, `notify`), `ui/src/shell/mount.ts`
  (o aviso, e a letra solta como texto com um comando aberto), `ui/src/shell/modules.ts`
- `packages/tasks-core` (`NewTask.priority`), `server/src/modules/tasks/` (`POST /tasks`)

# Entregue

No card #48 (F10 do [PRD do Tasks](/prd/tasks.md)), em 2026-11-09.

# Limites

- Não tem vencimento, corpo nem labels, e não escolhe o board: trocar de board é a troca
  do Tasks (F4), e o resto se edita no painel. Não abre o painel da tarefa criada. Com o
  Tasks desligado pela flag, o C não faz nada.
