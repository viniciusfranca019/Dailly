---
type: Convention
title: Arquitetura
description: A forma do dailly hoje (processos, projetos, módulos), o desenho de como as peças se ligam, e o porquê de cada decisão, com o que foi descartado; absorve as ADRs 0001 a 0013.
tags: [arquitetura, decisoes, adr]
status: stable
generated: { by: regulus/claude-opus-5-5, at: 2026-11-02T20:20:00-03:00 }
---

# Regra

O dailly é um diário pessoal com um cliente de API ao lado, **local-first, só
web, só nesta máquina**. Um processo Node (Fastify + SQLite) guarda os dados; o
navegador roda o renderer Vue, servido pelo Vite, que fala com a API só por HTTP.
Tudo é TypeScript, num pnpm workspace com três projetos: `packages/` (o modelo
que os dois lados compartilham), `server/` e `ui/`.

Cada decisão abaixo diz o que vale, por quê, e o que perdeu. Elas eram as ADRs
0001 a 0013; o número antigo está no título de cada uma, porque o código cita
as ADRs pelo número (`grep "ADR 0012"` acha a decisão aqui). Como adicionar um
módulo novo está em [Módulos](/conventions/modules.md); o que cada feature faz,
em [Features](/features/index.md). O detalhe de cada projeto mora ao lado do
código: `packages/docs/architecture.md`, `server/src/docs/architecture.md`,
`ui/src/docs/architecture.md`.

# O desenho de hoje

## Os processos

```
navegador ── http://localhost:4173 (make start) · :5173 (make dev)
   │
   └─ vite ── serve ui/dist (ou o dev server) e faz proxy de /api, com o Host intacto
                 │
                 ▼
           Fastify 127.0.0.1:4318 (start) · :4317 (dev)
             onRequest: Host e Origin só desta máquina
                 │
                 ├──► SQLite   ~/.config/dailly/dailly.sqlite (start)
                 │             server/dailly.dev.sqlite (dev)
                 └──► rede     só o executor do Requests, para a URL que a pessoa mandou
```

`make dev` e `make start` sobem dois processos cada, em portas diferentes, para
o diário de verdade e o de desenvolvimento rodarem juntos sem um abrir o banco
do outro.

## Os projetos e a direção da seta

```
             ┌──────────────── packages/ ────────────────┐
             │ domain   periods   whiteboard-core   requests-core │
             └────────▲─────────────────────────▲─────────┘
                      │ importa                 │ importa
                      │                         │
     ui/ (Vue, navegador) ─── HTTP /api ───► server/ (Fastify + SQLite)
        shell → manifest → modules/             shell → manifest → modules/
        shared/ · adapters/ · capabilities/      adapters/ · shell/vault
```

- `packages/` não importa `ui/` nem `server/`; `ui/` e `server/` importam
  `packages/` e **nunca um ao outro**. O `architecture.test.ts` da raiz prende
  essas setas.
- Cada lado tem um **shell** que só conhece o **manifest**, e o manifest é o
  único lugar que nomeia os módulos.

| Projeto | O que tem |
|---------|-----------|
| `packages/domain` | `Entry`, a port `EntryRepository` com a suíte de contrato, `Clock`, ids e os use-cases do Daily Log (`createEntry`, `queryEntries`) |
| `packages/periods` | instante + fuso → dia, semana, mês, quadrimestre, e de volta; o único ponto de conversão de fuso |
| `packages/whiteboard-core` | o modelo do editor de blocos: blocos, parser e serializer de markdown, edições estruturais; sem DOM |
| `packages/requests-core` | o modelo do Requests: `RequestSpec`, `ProtocolRegistry`, import de curl, `resolve(spec, env)`, a port `RequestStore`; sem rede |
| `server/src` | `shell/` (config, banco, migrations, cofre, guarda de Host e Origin, `/health`), `modules/` (`entries`, `requests`, `vault`), `adapters/` (`SqliteEntryRepository`) |
| `ui/src` | `shell/` (composition root, manifest com flags, rotas), `shared/` (contratos e ports), `adapters/` (HTTP), `capabilities/whiteboard` (o adapter DOM), `modules/` (`daily-log`, `requests`, `analyse`), `playground/` |

## Os módulos

| Módulo | Na `ui/` | No `server/` | Modelo | Estado |
|--------|----------|--------------|--------|--------|
| Daily Log | `modules/daily-log` (sempre ligado) | `modules/entries` | `domain`, `periods`, `whiteboard-core` | Fase 1 entregue |
| Requests | `modules/requests` (`VITE_REQUESTS`) | `modules/requests`, `modules/vault` | `requests-core` | entregue |
| Analyse | `modules/analyse` (`VITE_ANALYSE`) | — | — | só a tela-esqueleto |

## Regras que atravessam tudo

- **O whiteboard é o corpo da `Entry`, não a `Entry`.** `Entry.body` é o
  markdown que o editor devolve (`toMarkdown()`), e labels e propriedades ficam
  ao lado dele, nunca como sintaxe de bloco. O corpo é **normalizado uma vez, na
  criação** (`parse` + `serialize`: listas, numeração, tabs e linhas em branco
  na forma canônica), para que abrir e salvar sem editar seja no-op e não mexa
  no `updatedAt`. Comparar markdown normalizado a cada gravação foi descartado:
  pagaria o custo toda vez, para sempre.
- **Os use-cases rodam no renderer.** O servidor guarda uma `Entry` pronta:
  valida, mas não recarimba, não renormaliza e não gera id.
- **Ports nascem no lado de quem as consome e vêm com a suíte de contrato.** A
  implementação em memória e a SQLite rodam contra a mesma suíte.
- **Um fuso, uma conversão.** Tudo é guardado em UTC; o fuso (`DAILLY_TZ`, padrão
  UTC) é do processo da API, a tela o lê de `/health` e o mostra sempre, e todo
  "que dia é este instante" passa por `@dailly/periods`.
- **A fronteira é testada, não combinada.** Os `architecture.test.ts` varrem o
  source e falham nomeando o arquivo culpado; o `e2e/entries-round-trip.test.ts`
  põe as duas metades da port de entries uma contra a outra, porque um campo
  renomeado deixaria as duas suítes verdes e o app quebrado.
- **Um banco por instalação, schema por `PRAGMA user_version`** numa sequência
  global: cada módulo declara sua fatia, o shell junta e recusa colisão, e um
  banco mais novo que o schema conhecido é recusado. Backup é copiar o arquivo.

# As decisões

## Local-first, ports e adapters (era a ADR 0001)

**Vale:** os dados moram num arquivo SQLite nesta máquina, sem backend remoto e
sem uso remoto dos dados; o único remoto previsto é o backup do arquivo, pós-MVP.
A UI e os use-cases dependem só de ports, com uma implementação de produção e
uma em memória para testes. `Entry.id` é UUID mesmo sem sync. O Analyse será um
**Processor**: recebe entradas filtradas e produz uma `Materialization`; o padrão
"um módulo consome o material de outro" deve se repetir.

**Por quê:** o dono é dono dos próprios dados. A port de repositório existe por
testabilidade e limpeza de camadas, não para trocar por banco remoto. O UUID é um
id estável barato que não colide se o arquivo for restaurado ou mesclado à mão.

**Descartado:** Django e qualquer servidor multiusuário (o oposto de local-first);
adapter de dados remoto com sync (o único remoto desejado é o backup); SQLite em
WASM num PWA. Partes desta decisão caíram depois: a proibição de API HTTP local
(revertida na ADR 0007), o shell Tauri (ADR 0008, e o desktop inteiro na ADR
0012), o React (ADR 0010).

## Dados: o contrato antes do schema (era a ADR 0002)

**Vale:** a fonte da verdade é a interface do repositório, não a tabela.
`EntryRepository.create(entry)` recebe a `Entry` pronta, e o use-case
`createEntry` cunha id, timestamps e corpo normalizado. Tempos são `ISODateTime`
em UTC. Migrations rodam no boot, idempotentes, controladas por `user_version`,
e uma migration entregue nunca muda. O servidor ainda valida (corpo vazio,
timestamp malformado, id que não é UUID → 400), porque guardar a loja não é
refazer o domínio.

**Planejado para a Fase 2:** labels numa tabela com N:N, e propriedades livres
numa coluna JSON `props` mais uma tabela leve `property_defs` (só tipo e
autocomplete), filtradas por `json_extract`.

**Por quê:** JSON mantém a entrada coesa, e a lentidão do `json_extract` não
aparece no volume de um diário pessoal. `create(entry)` em vez de
`create(newEntry)` porque, com a fronteira HTTP, todo adapter teria de cunhar id
e timestamps, duplicando a lógica.

**Descartado:** EAV (`entry_property_values`), rígido e cheio de joins para
remontar uma entrada; sync bidirecional (backup é "o último upload vence").

## A tela depende de use-cases (era a ADR 0003)

**Vale:** a UI recebe use-cases e ports pela raiz e não sabe de onde vêm os
dados. Toda leitura tem os mesmos estados de carregando, erro e vazio. Markdown é
o formato do corpo e das materializações. Sem SSR. A navegação prevista é Daily
Log, Analyse e Settings.

**Por quê:** uma tela que não conhece a persistência é simples de testar com um
fake.

**Descartado:** a pilha original (React, React Router, shadcn/ui, TanStack Query)
caiu na ADR 0010; o editor "textarea + render" caiu para o whiteboard.

## IA com a chave do usuário (era a ADR 0004)

**Vale, ainda não construído:** o Analyse resume com o provider e o modelo que a
pessoa escolher, com chave própria (BYOK), atrás de uma port `Summarizer` única
para todo Processor, com um registry de providers. A chave nunca fica em texto
puro: vai para o [cofre](/features/cofre-de-segredos.md). Ela é validada ao
salvar, e uma falha em uso vira erro de domínio, sem materialização parcial.

**Por quê:** sem backend próprio não há onde guardar uma chave compartilhada, e
trocar de provider deve ser configuração, não recompilação.

**Descartado:** chave embutida ou gateway próprio (backend, custo, segredo); um
provider fixo; modelo local no MVP (pesa em hardware).

## Backup é copiar o arquivo (era a ADR 0005)

**Vale, ainda não construído:** backup e restore do SQLite inteiro num provider
de nuvem escolhido pela pessoa, atrás de uma port `StorageProvider`. O restore
valida o arquivo (`PRAGMA integrity_check`), faz um backup local do estado atual,
substitui e roda as migrations que faltam. Hoje, o backup é copiar o `.sqlite`.

**Por quê:** durabilidade sem abrir mão do local-first, num uso de um aparelho
só. O `user_version` dentro do arquivo é o que deixa um backup antigo subir
sozinho.

**Descartado:** sync bidirecional com conflitos (ordens de grandeza mais
complexo, e ninguém pediu); só export manual; storage próprio.

## Módulos e capacidades (era a ADR 0006)

**Vale:** duas camadas. `modules/` guarda produto (daily-log, requests,
analyse); `capabilities/` guarda o que é autocontido e não conhece o produto (o
whiteboard). O critério: se não dá para descrever sem dizer `Entry`, é módulo.
Uma capacidade só importa `shared/`; um módulo alcança outro só pelo `index.ts`;
ninguém importa o shell. Os testes moram no módulo. Um módulo inacabado entra por
flag de build, uma comparação estática que o Vite dobra. No servidor (a Emenda 2)
vale a mesma forma: shell, manifest, `modules/<id>/`, sem flag, migrations numa
sequência global com colisão recusada no boot, e regra de import em lista branca.
A dependência própria de um módulo chega pelo `provide`. O passo a passo está em
[Módulos](/conventions/modules.md).

**Por quê:** sem fronteira declarada, "um módulo consome outro" vira import de
interno no primeiro atalho. O whiteboard como módulo passaria a conhecer `Entry`
e dissolveria a costura `body = toMarkdown()`. A flag existe para não entregar um
módulo pela metade, e só a comparação estática some do bundle. Lista branca no
servidor porque a lista de proibidos foi furada duas vezes.

**Descartado:** um `domain/` global (vira um monólito com pastas); flag de
runtime (carrega todo módulo em todo bundle); `components/` e `lib/` como camada
(sem critério de entrada); no servidor, uma tabela de versão por módulo (largaria
o `user_version`). Um pnpm workspace por módulo foi recusado aqui e adotado depois,
na ADR 0007, por outro motivo.

## API local, fuso e o contrato do tempo (era a ADR 0007)

**Vale:** o SQLite é acessado por uma API Fastify em `127.0.0.1`, e a UI fala
com ela só por HTTP. Tudo é guardado em UTC; o fuso é de apresentação e recorte,
vem do processo da API (`DAILLY_TZ`, padrão UTC) e aparece sempre na tela. A
semana começa na segunda (ISO-8601), o quadrimestre é fixo (jan–abr, mai–ago,
set–dez), e um período é recortado por `occurredAt`, não por `createdAt`. O
`Clock` não conhece fuso. O domínio é compartilhado: o repo virou pnpm workspace
com `packages/domain` e `packages/periods`, e na Emenda 1 o core do whiteboard
virou `packages/whiteboard-core`, porque normalizar na criação pôs `parse` e
`serialize` dentro do use-case.

**Por quê:** a fronteira HTTP é escolha do dono, e deixa o servidor subir sozinho
num teste. Quadrimestre fixo porque um móvel deixa as análises incomparáveis, e
comparar é a razão do Analyse. `occurredAt` porque o Analyse resume fatos, não
digitação. Um `Clock` com fuso espalharia o bug de fuso por todo chamador.

**Descartado:** API remota auto-hospedada (mata o local-first e exige auth);
domínio só na API, com o front gerado de OpenAPI (com TypeScript nos dois lados,
gerar o que se compartilha é trabalho sem ganho); `Clock` devolvendo `Date`
(mutável) ou conhecendo a zona.

## Electron como shell (era a ADR 0008) — superada

**Superada inteira pela ADR 0012:** o desktop saiu. Ela trocou o Tauri pelo
Electron (um motor só, porque o editor tem contornos escritos contra o Chromium)
e rodava a API dentro do processo main. Dela sobrevive um argumento: **HTTP em vez
de IPC**, porque a fronteira se testa com `curl`, se isola num teste de integração
e deixa a API rodar separada, que é o que a ADR 0012 acabou fazendo.

## Os nomes do workspace (era a ADR 0009)

**Vale:** `server/`, não `api/`, porque guarda repositório, migrations e
composition root, não só a superfície; `ui/`, não `app/`, porque domínio e
persistência saíram dela e sobrou o renderer. Na `ui/`, o composition root é
`src/shell/`, sem alias: ninguém fora dele o importa. `periods` é pacote separado
de `domain` porque não conhece `Entry`. A separação é um teste:
`server/src/boots-without-electron.test.ts` sobe o Fastify sozinho e bate num
endpoint. Se ele um dia não puder mais ser escrito, o HTTP deixou de pagar o
custo e o colapso para IPC passa a ser a conclusão.

**Por quê:** o nome descreve o conteúdo, não o shell da semana, e a separação é
verificada pelo teste, não pela prosa.

**Descartado:** `api/` (nomeia a superfície); `renderer/` e `main/` (amarram ao
Electron); o alias `@app` (convidava o import que a regra proíbe).

## Vue no renderer, o whiteboard como ilha (era a ADR 0010)

**Vale:** o renderer é Vue 3 em SFC, com Tailwind 4. O whiteboard **não é
reescrito**: é um adapter DOM vanilla montado como ilha. O componente
(`Composer.vue`) dá um elemento por `ref`, monta o editor no `onMounted`, e o Vue
nunca renderiza dentro dele. O tema do editor é dele (`var(--wb-*)`), não de
utilitário. Na Emenda 2, o módulo virou um **componente** numa única aplicação
Vue, com `ShellOptions.configure(app)` como ponto de instalação de plugins. Na
Emenda 3, o teste de arquitetura passou a ler os `.vue`.

**Por quê:** o editor depende de `contenteditable`, e um vdom reconciliando nós em
edição briga com o caret. Vue foi escolha do dono: nenhuma restrição conhecida
separava Vue de Svelte, e investigar custaria mais que a diferença. Um
`createApp` por módulo impediria que um plugin (Pinia, uma lib de componentes)
alcançasse os módulos.

**Descartado:** manter React com shadcn/ui; Svelte (tão defensável quanto);
reescrever o whiteboard em Vue. **Gatilho anotado:** reabrir a ilha quando o
adapter precisar de estado que só o framework tem; a saída, então, é Vue *dentro*
da ilha (renderers por bloco), não o contrário. **Limite conhecido:** o
`vue-tsc` não roda com o TypeScript 7 nativo, então nenhum `.vue` passa pelo
typecheck.

## Requests: módulo de produto, executado no servidor (era a ADR 0011)

**Vale:** o Requests é módulo, não capacidade: tem ports e persiste. O modelo
mora em `packages/requests-core`, TypeScript puro sem rede. Um protocolo tem duas
metades: o **driver** puro (parse, serialize, validate), no pacote, e o
**executor**, no servidor. Os dois ficam num `Protocol` só
(`server/src/modules/requests/protocols.ts`), escolhido pela chave `protocol`, de
modo que gRPC ou AMQP entram como mais um item da lista. Isso é uma Strategy por
chave. A execução é `POST /requests/:id/execute`, e **executar grava antes de
rodar**: a rota executa o que está guardado. A persistência é um envelope
genérico (`requests` com `spec` em JSON, mais `request_folders`). Na Emenda 1, a
tela abre `gzip` e `deflate` e diz quando veio `br`, sem decodificar lixo.

**Por quê:** o navegador não consegue mandar `Host`, `Origin` ou `Cookie`, o CORS
devolve resposta opaca, e gRPC não existe num navegador. Driver e executor juntos
porque, em dois registros, poderia existir um protocolo que o servidor monta e
não sabe executar. JSON no `spec` porque colunas de HTTP pediriam uma migration
por protocolo. Gravar antes de rodar porque, sem isso, a tela mostraria um host e
a rede receberia outro.

**Descartado:** executar no navegador; o híbrido "o servidor monta, a UI executa"
(herda os limites e soma um salto); tudo dentro de `ui/src/modules/requests` (morre
no dia do gRPC); colunas próprias de HTTP; dois registros separados; uma Factory
(montar a lista não envolve escolha nenhuma).

## Só web, só nesta máquina (era a ADR 0012)

**Vale:** o dailly é uma aplicação web local, e o `desktop/` saiu inteiro. `make
start` abre o diário onde o Electron o guardava (`~/.config/dailly/dailly.sqlite`)
na porta 4318; `make dev` usa a 4317 com o banco de desenvolvimento. A API se
guarda sozinha num hook `onRequest`, em toda rota, `/health` incluída: o **Host**
tem de ser `localhost`, `127.0.0.1` ou `[::1]`, o que fecha o DNS rebinding, e um
**Origin**, quando vem, também tem de ser desta máquina, o que fecha o CSRF de
outro site. O proxy do Vite repassa o Host (`changeOrigin: false`), e o
`ui/src/proxy.test.ts` prende isso.

**Por quê:** o uso real já era o navegador, e o AppImage estava parado. Manter
dois runtimes custava em tudo que atravessava o shell. Sem o Electron, a ameaça
passou a ser outros sites abertos no mesmo navegador, não um processo local, que
de todo modo leria o SQLite direto.

**Descartado:** manter desktop e web; servir a UI pelo próprio Fastify (uma
dependência nova; volta se o `make start` incomodar); token por cookie da página
(um processo local pegaria o cookie). **Limites:** outra aplicação web em
`localhost` passa pela regra de Origin, porque as portas não foram fixadas (o Vite
cai para a 5174). Hospedar é outra decisão (auth de pessoa, outro banco, TLS). O
token que a API ainda aceita ficou sem quem o gere (`TODO.md`).

## Cofre de segredos (era a ADR 0013)

**Vale:** segredos ficam cifrados **no próprio SQLite**, atrás da port
`SecretStore` (`server/src/shell/vault.ts`, um por processo), e a request guarda
só `{{nome}}`. O cofre abre só com **a senha da sessão e o `DAILLY_SECRET_KEY` do
`.env` juntos**. Uma DEK aleatória cifra cada valor em AES-256-GCM, com nonce por
gravação e o par (ambiente, nome) no AAD. A KEK
(`HKDF-SHA256(scrypt(senha), salt = DAILLY_SECRET_KEY)`) cifra a DEK, e uma
**chave de recuperação**, mostrada uma vez, cifra uma segunda cópia. Só
`node:crypto`, sem dependência nova. A API sobe trancada; a DEK vive só em
memória. Na execução, o `env` da tela vale primeiro e o cofre preenche o resto; um
nome que só o cofre tem, com o cofre trancado, dá **423** com os nomes, e nunca
sai um `{{nome}}` literal para a rede. A tela mostra o valor mascarado e revela só
num clique. `PRAGMA secure_delete = ON`.

**Por quê:** o Requests gravava `Authorization`, `-u usuario:senha` e chaves de
API em texto puro, e um backup em nuvem levaria tudo junto. Duas peças porque o
`.env` protege o backup do SQLite e a senha protege o disco local: nem o `.sqlite`
com o `.env`, nem o `.sqlite` com a senha abrem o cofre, e o `.env` como *pepper*
impede testar senhas offline a partir de um backup. A senha vem pela tela, não
pelo terminal, porque o `make start` roda API e UI em paralelo e um prompt se
perderia.

**Descartado:** SQLCipher no banco inteiro (troca o driver nativo e não resolve
onde a chave mora); keychain do sistema (no WSL depende de D-Bus nem sempre
presente); só `.env` (o disco aberto abre tudo); só senha (um backup vazado
permite ataque offline); `.env` **ou** senha (tão forte quanto a peça mais fraca);
a tela nunca ver o valor (conferir a chave colada é parte do uso). **Limite:** as
entradas do diário continuam em texto puro; cifrar o banco é outra decisão.

# O que está decidido e ainda não existe

| O quê | Decidido em | Gatilho |
|-------|-------------|---------|
| Labels, propriedades, edição, exclusão e filtros do Daily Log | dados (era a ADR 0002) | Fase 2; as rotas que dependem deles respondem 501 |
| `Processor`, `Materialization`, `Summarizer` e Settings com BYOK | local-first (era a ADR 0001), IA (era a ADR 0004) | Fases 3 a 5 |
| Backup em nuvem (`StorageProvider`) | backup (era a ADR 0005) | pós-MVP |
| gRPC e AMQP, streaming, cancelamento e histórico de execução no Requests | Requests (era a ADR 0011) | quando um uso pedir |

O que já foi decidido em detalhe e espera um gatilho está no `TODO.md` da raiz,
com o gatilho de cada item.
