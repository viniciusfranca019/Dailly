---
type: Feature
title: Tasks, board e a troca board/lista
description: O board kanban das tarefas, com arrastar entre colunas e dentro delas, o carimbo de conclusão e a troca entre board e lista, lembrada no navegador.
tags: [tasks, board, kanban, lista]
status: stable
since: 0.1.4
generated: { by: regulus/claude-opus-5-5, at: 2026-11-05T15:00:00-03:00 }
---

# O que faz

- Tasks abre no **board**: uma coluna por status, cada card com a chave, o título e a
  prioridade. Os botões "Board" e "Lista" trocam a visualização, e a escolha volta
  depois de recarregar. Na primeira visita, abre o board.
- Arrastar um card e soltar **em cima de outro** põe o arrastado acima dele; soltar na
  área vazia de uma coluna põe no fim dela. Vale entre colunas (muda o status) e dentro
  da mesma (muda a ordem), e persiste.
- Soltar em "Feito" ou "Cancelado" mostra "concluída em <dia>" no card e na linha;
  voltar para um status aberto apaga a marca.
- Se a gravação é recusada, o card fica onde o servidor diz que ele está, e a mensagem
  do erro aparece acima do board.
- Board e lista mostram as mesmas tarefas, na mesma ordem, com a contagem por status.
  Sem nenhuma tarefa, as duas mostram o mesmo convite para criar a primeira.

# Regras

- **RN3 mora no servidor**: entrar numa categoria `completed` ou `canceled` carimba o
  instante com o relógio do servidor, sair apaga. Entre dois status fechados (Feito →
  Cancelado) o primeiro carimbo fica, porque foi ali que a tarefa fechou.
- **RN4**: board e lista leem o mesmo `GET /tasks`; só a forma muda.
- **RN7**: depois de todo movimento, recusado ou não, a tela relê o board.
- A posição de um card solto é calculada no modelo puro (`placeAt`, com o
  `rankBetween` dos vizinhos), e o `PATCH /tasks/:key` leva `statusId` e `rank`. O
  servidor recusa um rank mal formado ou um status que não existe.
- O drag-and-drop é o nativo do HTML5, sem biblioteca.
- A visualização fica no `localStorage` (`dailly.tasks.view`); sem storage, a escolha
  vale até recarregar.

# Onde mora

- `packages/tasks-core/src/move.ts` (`placeAt`, `completionAfterMove`)
- `server/src/modules/tasks/` (`PATCH /tasks/:key`, `move` no store SQLite)
- `ui/src/modules/tasks/ui/board/`, `ui/view.ts`, `model/completion.ts`

# Entregue

No card #21 (F2 do [PRD do Tasks](/prd/tasks.md)), em 2026-11-05. O Tasks passa a
aparecer no `make start`. A [captura e a lista](/features/tasks-capturar-e-listar.md)
são do F1.

# Limites

- Mover arrastando é só com o mouse; pelo teclado, é o campo de status do [painel](/features/tasks-painel.md).
