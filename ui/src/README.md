# ui

O renderer do dailly (`@dailly/ui`): uma aplicação Vue 3 que monta os módulos
de produto, roda os use-cases do Daily Log e fala com a API local por HTTP. O
whiteboard é um adapter vanilla montado como ilha dentro do Vue.

## Briefing

| Parte | O que é |
|---|---|
| `shell/` | composition root, manifest de módulos por flag, roteamento e a moldura |
| `shared/` | os contratos que todo mundo importa: descritor de módulo, `ModuleDeps`, `RequestsPort` |
| `adapters/` | o outro lado das ports, sobre HTTP: entries e requests |
| `capabilities/whiteboard` | o adapter DOM do `@dailly/whiteboard-core` — sem produto, sem `Entry` |
| `modules/daily-log` | a timeline e o composer |
| `modules/requests` | o cliente de API (`VITE_REQUESTS=true`) |
| `modules/analyse` | placeholder da Fase 4/5 (`VITE_ANALYSE=true`) |
| `playground/` | o whiteboard sozinho, para conferir comportamento real de browser |

## Setup e comandos

Da raiz do repositório:

```bash
make dev                                  # API + app em http://localhost:5173 · playground em /playground/
make dev-ui                               # só o renderer (sem a API, a timeline não carrega)
make build                                # ui/dist, só os módulos prontos
make build-all                            # com todos os módulos ligados
pnpm --filter @dailly/ui test
pnpm --filter @dailly/ui typecheck
```

As flags `VITE_REQUESTS` e `VITE_ANALYSE` valem para `dev`, `build` e `test`:
com elas desligadas, o módulo nem entra no bundle.

## Mais

- [`docs/architecture.md`](docs/architecture.md) — as camadas e a direção da
  seta, a composição, cada módulo por dentro e o whiteboard (atalhos, como a
  edição funciona, limitações).
- [`../../docs/architecture.md`](../../docs/architecture.md) — o comportamento
  de cada módulo, de ponta a ponta.
