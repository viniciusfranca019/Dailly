# ADR 0011 — Requests: módulo de produto, com execução no servidor

- **Status:** Aceito
- **Data:** 2026-09-20
- **Decisores:** Vinicius
- **Relaciona:** [ADR 0001](0001-arquitetura-geral.md) (camadas e Processor) ·
  [ADR 0006, Emenda 2](0006-modularizacao-frontend.md) (módulos no servidor) ·
  [ADR 0007](0007-api-local-e-tempo.md) (o que vive em `packages/`) ·
  [ADR 0008](0008-electron-como-shell.md) (o checklist de segurança do renderer)

## Contexto

O dailly ganha um cliente de API no estilo Apidog/Postman/Insomnia: colar um
`curl` e ele vira requisição editável, requisições organizadas em pastas,
persistidas, **executadas com a resposta visível**.

E um requisito que decide arquitetura mais do que qualquer um dos outros: hoje
só HTTP, mas a estrutura tem que aceitar um cliente **gRPC ou AMQP** amanhã sem
reescrever o núcleo.

## Decisão

### Requests é módulo de produto, não capacidade

O critério de entrada em `capabilities/` ([ADR 0006](0006-modularizacao-frontend.md))
é "sem ports, sem persistência, sem conhecimento do produto". Requests reprova
em dois: tem ports (repositório, driver de protocolo) e persiste. Além disso,
nenhum outro consumidor da `ui/` usa o motor dele — criar uma capacidade seria
abrir a gaveta para um consumidor hipotético.

### O núcleo mora em `packages/requests-core`

Precedente literal do `whiteboard-core` ([ADR 0007, Emenda 1](0007-api-local-e-tempo.md)):
dois runtimes precisam do mesmo modelo, e o `architecture.test.ts` da raiz
proíbe `ui/` e `server/` de se importarem. Logo, o que os dois lados usam só
pode morar em `packages/`.

Lá dentro, TS puro, zero rede: o envelope `RequestSpec`, o `ProtocolRegistry`,
o import de `curl`, a resolução `resolve(spec, env)` e a port do repositório.

### O contrato do driver quebra em duas metades

A fronteira é a linha puro/efeito, e ela não é estética — é o que permite gRPC
amanhã:

- **puro** — `parse` / `serialize` / `validate`, em `packages/requests-core`.
  Mesmo mecanismo do `BlockRegistry`: registrou um protocolo, ele ganha as três
  de graça.
- **efetivo** — `execute(spec) → response`, em `server/src/modules/requests/`.

### A execução acontece no servidor

**Esta é a decisão que o resto depende, e o que a força não é o custo do hop —
é o que o renderer não consegue fazer.**

1. **Headers proibidos.** `Host`, `Origin`, `Cookie`, `Referer`, `User-Agent` e
   `Content-Length` não podem ser definidos por `fetch` no browser. Um cliente
   de API que não manda `Cookie` nem forja `Origin` não testa autenticação — que
   é metade do uso real.
2. **CORS.** A origem do renderer é `file://` em produção. O alvo não responde
   `Access-Control-Allow-Origin` para ela, então a resposta volta opaca: sem
   status, sem headers, sem corpo. A única saída seria `webSecurity: false`, e
   isso rasga o checklist que a [ADR 0008](0008-electron-como-shell.md) chama de
   obrigatório.
3. **O resto do ofício.** Redirect é seguido automaticamente e a cadeia 3xx fica
   invisível; não há TLS self-signed, client cert, proxy, nem timing de
   DNS/connect/TLS.
4. **gRPC e AMQP não existem num renderer.** Não há socket bruto no webview. O
   requisito que motivou a extensibilidade morreria no dia de usá-la.

O `server/` já roda dentro do Electron como import do main process
([ADR 0008](0008-electron-como-shell.md)), então a execução não custa processo
novo, binário novo nem handshake — custa uma rota.

**A rota de execução fica dentro do hook do token, nunca na isenção do
`/health`.** Ela é egresso arbitrário para a internet a partir da máquina do
usuário; é a rota mais sensível da API, não a menos.

### Persistência: envelope genérico no mesmo SQLite

```sql
requests(id, folder_id, name, protocol, spec JSON, position)
folders(id, parent_id, name, position)
```

`protocol` + `spec` como JSON é o que faz gRPC custar barato: colunas
específicas de HTTP significariam uma migration por protocolo novo, e a
validação do JSON é o que o driver puro já sabe fazer.

## Consequências

**Positivas**

- Um cliente de API de verdade: qualquer header, cadeia de redirect visível,
  timing medido em Node (melhor que no renderer, não pior).
- gRPC e AMQP entram como driver, sem tocar no modelo nem na UI.
- O preview "o que exatamente vai ser enviado" é função pura no renderer, com
  zero hops — a única virtude real do híbrido, sem comprar a limitação dele.

**Negativas / trade-offs**

- Resposta em streaming (SSE, chunked) exige resposta em streaming do Fastify de
  volta ao renderer; não é o caminho trivial.
- Cancelar exige um `AbortController` indexado por id de execução, com estado
  vivo no servidor.
- Corpo grande ou binário atravessa um hop extra e precisa de teto explícito.
- O parser de `curl` é um tokenizer de shell de verdade — aspas, `\` quebrando
  linha, `$'...'`, `--data-raw`, `-H` repetido. É a maior superfície de teste do
  pacote, e uma regex ali é dívida garantida.
- Busca por conteúdo de requisição vira scan, porque o `spec` é JSON opaco para
  o SQL. Preço nenhum numa coleção pessoal; a revisitar se virar milhares.

## Alternativas consideradas

- **Executar no renderer com `fetch`/axios** — sem hop, timing onde o usuário
  está, streaming nativo. Rejeitada pelos quatro pontos da seção de decisão:
  headers proibidos, CORS, ausência de controle de redirect/TLS/proxy, e gRPC
  impossível. Precedente externo: o Postman abandonou execução como Chrome app
  exatamente por isso, e o Insomnia executa por `node-libcurl`.
- **Híbrido: o servidor monta o estado, a UI executa** — a proposta original.
  Herda os quatro problemas acima *e* adiciona o hop. A virtude que a motivava
  (ver exatamente o que vai ser enviado) é `resolve(spec, env)`, função pura que
  roda no renderer sem hop nenhum.
- **Requests como capacidade em `ui/src/capabilities/`** — reprova no critério
  da ADR 0006 em dois pontos (ports, persistência) e não tem segundo consumidor.
- **Tudo dentro de `ui/src/modules/requests/`** — mais barato hoje, e morre no
  dia do gRPC, porque a metade efetiva não pode viver num renderer.
- **Colunas específicas de HTTP no schema** — consultável por SQL, e uma
  migration por protocolo novo. Rejeitada pelo requisito de extensibilidade.
- **Desktop como executor (novo IPC no main process)** — o main é Node e
  resolveria os mesmos problemas, mas duplicaria no Electron um caminho que o
  `server/` já oferece, e quebraria a regra da [ADR 0009](0009-topologia-do-workspace.md)
  de que o servidor roda sem Electron. Rejeitada.
