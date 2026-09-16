# ADR 0008 — Electron como shell, no lugar de Tauri

- **Status:** Aceito
- **Data:** 2026-09-15
- **Decisores:** Vinicius
- **Relaciona:** [ADR 0001](0001-arquitetura-geral.md) (supersede a escolha de
  shell) · [ADR 0007](0007-api-local-e-tempo.md) (fecha a pendência de alvo e
  substitui a seção de empacotamento) · [ADR 0003](0003-ui.md)

## Contexto

A ADR 0001 escolheu Tauri e rejeitou Electron com um número:

> "Binário pequeno (~5–10 MB) contra ~100 MB+ do Electron."

Esse julgamento era honesto **quando não havia processo Node no desenho**. A
ADR 0007 colocou um: a API Fastify local. Com ela, Tauri passa a precisar
empacotar um runtime JS ao lado do binário — e a razão de 10× a 20× que
justificou a rejeição encolhe para algo perto de 1,5× a 2×.

Duas outras coisas pesaram, e a segunda só é visível neste projeto.

## Decisão

**O shell é Electron.** O alvo de distribuição continua AppImage.

### 1. O sidecar deixa de existir

O processo principal do Electron **é** Node. O Fastify roda dentro dele, como
import. Some o binário separado, some empacotar um runtime, some o handshake de
porta entre dois processos e some o processo órfão quando um dos dois morre.

Empacotar um runtime JS como sidecar do Tauri era a peça mais incerta desta
pilha, e tudo abaixo dela assumia que funcionava. Com Electron não há o que
provar.

### 2. O motor de renderização fica fixo — e isso importa aqui

O whiteboard depende de comportamento de `contenteditable`, e o código já sabe
disso. Há um *probe* em runtime:

```ts
/** `plaintext-only` keeps the browser from pasting markup into a block. */
probe.setAttribute('contenteditable', 'plaintext-only')
return probe.contentEditable === 'plaintext-only' ? 'plaintext-only' : 'true'
```

E há, no CSS do adapter, um workaround marcado como *load-bearing*: com
`white-space: normal`, **o Chrome** transforma o espaço final de `# ` num NBSP,
e é esse espaço que arma o atalho de markdown. O `pre-wrap` existe por causa
disso.

Ou seja: a correção do editor depende do motor, e o workaround que existe foi
escrito contra o Chrome — sem nunca ter sido verificado fora do jsdom.

| | Motor que se recebe |
|---|---|
| Tauri | WebKitGTK (Linux) · WebView2 (Windows) · WKWebView (macOS) — **três** |
| Electron | um Chromium, o mesmo em todo lugar, na versão fixada |

Electron fixa o motor exatamente no que o workaround assume. Esse argumento não
aparece em comparação genérica entre os dois; aparece aqui porque o produto é um
editor de blocos, não um CRUD.

### 3. Um toolchain só

Sem Rust, sem cargo, sem segunda linguagem para depurar quando o empacotamento
quebrar. O projeto não tem nada fora do ecossistema JS hoje.

## O que isto muda na ADR 0007

- **A seção de empacotamento morre.** Não há sidecar, não há `bun build`/`pkg`,
  e o AppImage volta a ser um artefato só.
- **A pendência "alvo herdado da ADR 0001" fecha.**
- **O ciclo de vida simplifica**: não existe segundo processo para subir,
  derrubar ou vigiar.

## O que isto não muda

A API Fastify local, o domain compartilhado em `packages/`, o workspace, o fuso,
o `Clock` e a capacidade `periods` seguem exatamente como a ADR 0007 decidiu.

Vale registrar uma escolha que passa a ser escolha: com Electron, HTTP em
localhost deixa de ser necessidade — IPC entre main e renderer existe. Mantemos
HTTP mesmo assim, porque a fronteira explícita é testável com `curl`, isolável
em teste de integração, e deixa aberta a porta de rodar a API separada um dia.

## Consequências

**Positivas**

- O maior risco de empacotamento da pilha desaparece, então a Fase 1 pode ir
  direto ao domínio em vez de começar provando infraestrutura.
- Comportamento de edição idêntico em todo sistema operacional, e reproduzível:
  o motor é uma versão fixada no `package.json`, não o que o SO trouxer.
- `electron-builder` → AppImage é rota trilhada; menos respostas faltando quando
  travar.

**Negativas / trade-offs**

- **Tamanho e RAM.** Electron carrega o próprio Chromium. Continua sendo o
  maior dos dois — só que por um fator muito menor do que a ADR 0001 calculou,
  porque ela calculou sem o Node no desenho. O número real aparece no primeiro
  `electron-builder`, e fica registrado quando aparecer.
- **Checklist de segurança do Electron é obrigatório**, não opcional:
  `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, e nada de
  carregar conteúdo remoto no renderer. Atenuante: o app só carrega conteúdo
  local.
- **A API em `127.0.0.1` é alcançável por qualquer processo local.** Sem
  autenticação, outro programa na mesma máquina lê o diário. Isso já era verdade
  com Tauri e continua sendo; a mitigação é barata e entra na Fase 1: porta
  efêmera escolhida no boot, bind apenas em `127.0.0.1`, e um token gerado por
  execução que o main entrega ao renderer.
- **Segunda reversão da ADR 0001 no mesmo dia.** Vale dizer em voz alta: a
  ADR 0001 agora teve shell e restrição de backend revistos. Ela continua válida
  em local-first, ports & adapters, Processor e monorepo — que é o que nunca
  dependeu do shell.

## Alternativas consideradas

- **Tauri + runtime JS como sidecar** — menor artefato, ao custo da peça mais
  incerta da pilha e de três motores de renderização. Rejeitado: o ganho de
  tamanho encolheu e o custo é justamente onde o projeto é frágil.
- **Voltar à ADR 0001 pura** (Tauri, sem API, `tauri-plugin-sql`) — coerente e
  o menor artefato de todos. Fora de questão: contraria a decisão da ADR 0007,
  que é mais recente e deliberada.
- **Electron sem HTTP, só IPC** — removeria a porta aberta e a serialização.
  Rejeitado por ora: a fronteira HTTP é testável de fora e reversível; IPC não.
- **Medir os dois com um hello-world antes de decidir** — oferecido, e o autor
  optou por decidir sem. O número aparece de graça no primeiro empacotamento.
