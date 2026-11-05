---
type: Feature
title: Ordem da barra lateral
description: Os módulos da barra lateral na ordem que a pessoa escolher, arrastando ou com Alt+↑ e Alt+↓, lembrada no navegador.
tags: [shell, navegação, barra lateral]
status: stable
since: 0.1.7
generated: { by: regulus/claude-opus-5-5, at: 2026-11-05T19:30:00-03:00 }
---

# O que faz

- Arrastar um módulo da barra lateral e soltar sobre outro põe o arrastado no lugar
  daquele: acima dele quando sobe, abaixo quando desce.
- Com o foco num módulo, Alt+↑ e Alt+↓ o movem uma posição, e o foco continua nele.
  É o caminho sem mouse para a mesma ordem.
- A ordem fica no navegador e volta igual depois de recarregar.
- Clicar continua abrindo o módulo, e o app continua abrindo no Daily Log, qualquer
  que seja a ordem.

# Regras

- **O manifesto diz quais módulos existem; a ordem só diz como aparecem.** A ordem
  salva é uma lista de ids, conferida contra o manifesto a cada abertura: um módulo
  ligado por flag depois do salvamento entra no fim, e um id que não está no manifesto
  é ignorado.
- **Sem storage, vale a ordem do manifesto.** Janela privada, dado do site bloqueado ou
  um valor que não é uma lista de ids: a barra mostra a ordem do manifesto, sem erro, e
  a ordem nova vale até recarregar. A chave é `dailly.nav.order`.
- **Drag-and-drop nativo do HTML5**, como o board do Tasks, sem dependência.

# Onde mora

`ui/src/shell/nav-order.ts` (a ordem, pura), `ui/src/shell/Shell.vue` (o arrastar e o
teclado) e `ui/src/shell/mount.ts` (o estado e o storage). Card #28.
