# packages

Os modelos que o renderer (`ui/`) e a API (`server/`) usam ao mesmo tempo.
TypeScript puro: nenhum pacote conhece DOM, framework, banco ou rede, e nenhum
tem passo de build — quem consome importa o `src/` direto.

## Briefing

| Pacote | Domínio | Superfície |
|---|---|---|
| `@dailly/whiteboard-core` | o editor: markdown → árvore de blocos → markdown | `parse` · `serialize` · `WhiteboardDocument` · `BlockRegistry` |
| `@dailly/domain` | o Daily Log: `Entry`, a port `EntryRepository`, os use-cases | `createEntry` · `queryEntries` · `Clock` · `IdGenerator` · `/testing` |
| `@dailly/periods` | o tempo: instante + fuso → dia do calendário, e volta | `dayOf` · `timeOf` · `dayBounds` · `rangeBounds` · `atNoon` |
| `@dailly/requests-core` | o Requests: curl → `ProtocolSpec` → requisição literal | `ProtocolRegistry` · `resolve` · `RequestStore` · `/http` · `/testing` |

O único acoplamento entre eles: `@dailly/domain` depende de
`@dailly/whiteboard-core`, porque `createEntry` normaliza o corpo com o parser
do editor.

## Comandos

Da raiz do repositório:

```bash
pnpm --filter "./packages/*" test        # as suítes dos quatro
pnpm --filter @dailly/periods test       # de um só
pnpm --filter "./packages/*" typecheck
```

Cada pacote tem os mesmos dois scripts, `test` (vitest) e `typecheck` (tsc).

## Mais

- [`docs/architecture.md`](docs/architecture.md) — a estrutura de cada pacote,
  quem usa o quê, a sintaxe do whiteboard e como acrescentar um bloco ou um
  protocolo.
- [`../docs/architecture.md`](../docs/architecture.md) — como os pacotes entram
  no comportamento de cada módulo.
