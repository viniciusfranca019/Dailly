# ADR 0004 — AI Providers (BYOK)

- **Status:** Aceito
- **Data:** 2026-07-24
- **Decisores:** Vinicius
- **Relaciona:** [ADR 0001 — Arquitetura Geral](0001-arquitetura-geral.md)

## Contexto

Os Processors (a começar pelo **Analyse**) precisam de IA para transformar o
material do Daily Log em materializações. O app é local-first e não tem backend
próprio (ADR 0001), então **não há um servidor onde guardar uma chave de IA
compartilhada** — e nem se deseja arcar com esse custo/segredo.

Decisão do produto: **BYOK (Bring Your Own Key)**. O usuário escolhe o provider e
o modelo usados pelos Processors e se autentica com a própria chave. Haverá um
módulo de configuração/login desses provedores; cada provider tem seu método de
auth.

## Decisão

### Port `Summarizer` como contrato único dos Processors

Os Processors dependem apenas da interface; qual provider está por trás é
detalhe de adapter.

```ts
// domain/ports/summarizer.ts
export interface SummarizeInput {
  instruction: string;          // o que o Processor quer (ex.: "resuma a semana")
  entries: Entry[];             // material já filtrado pelo Processor
  // demais parâmetros do Processor (formato de saída, idioma, etc.)
}

export interface Summarizer {
  summarize(input: SummarizeInput): Promise<string>; // markdown
}
```

Adapters por provider implementam a mesma interface:
`AnthropicSummarizer`, `OpenAiSummarizer`, … (extensível).

### Registro de providers e seleção

- Um **registry** de providers suportados descreve, para cada um: nome, método de
  auth, lista de modelos e como validar a chave.
- O usuário, em Settings, **escolhe o provider e o modelo ativos** e informa a
  chave. Essa seleção define qual `Summarizer` o composition root injeta nos
  Processors.
- Um único provider/modelo ativo por vez no MVP (troca a qualquer momento).

```ts
interface AiProviderConfig {
  provider: string;   // ex.: "anthropic"
  model: string;      // ex.: "claude-opus-4-8"
  // a chave NÃO fica aqui — vive no keychain (ver abaixo)
}
```

### Armazenamento seguro da chave

- A **chave de API vive no keychain do SO** (via plugin do Tauri, ex.:
  keyring/stronghold), **nunca** em texto plano no SQLite nem em arquivo de
  config.
- O SQLite/config guarda apenas metadados não sensíveis (`provider`, `model`, e
  uma referência à entrada do keychain).

### Validação e erros

- Ao salvar, o app **valida a chave** com uma chamada leve ao provider; chave
  inválida não é persistida como ativa.
- Falhas em tempo de uso (rate limit, rede, chave revogada) são propagadas como
  erro de domínio, e o Processor **não** persiste materialização parcial
  (consistente com o MVP, ver mvp.md → Analyse → falhas).

### Auth por provider

- A maioria dos providers de LLM usa **API key** — o caso simples e o único
  necessário no MVP.
- A abstração de auth por provider fica no adapter, então provedores com fluxos
  diferentes (ex.: OAuth) podem ser adicionados depois sem mudar a port.

## Consequências

**Positivas**

- Sem custo nem segredo de IA embutidos no app; liberdade de provider ao usuário.
- Coerente com local-first: nada obriga um backend.
- Trocar de provider/modelo é configuração, não recompilação.
- Processors testáveis com um `Summarizer` fake.

**Negativas / trade-offs**

- Onboarding tem um passo a mais (obter e colar a chave) antes de o Analyse
  funcionar; a UI precisa guiar isso (ADR 0003).
- Cada provider novo é um adapter a manter e testar.
- Qualidade/limite da análise passam a depender do provider/modelo escolhido pelo
  usuário — variabilidade fora do nosso controle.

## Alternativas consideradas

- **Chave de IA embutida no app / gateway próprio** — exigiria backend e assumir
  custo e gestão de segredo; contra o local-first. Rejeitado.
- **Somente um provider fixo (Anthropic)** — mais simples, mas remove a liberdade
  de escolha desejada pelo produto. Rejeitado; começamos com adapters plugáveis.
- **Modelo local (llama.cpp/ollama) no MVP** — evitaria BYOK, mas pesa no
  empacotamento e no hardware do usuário. Adiado (sidecar futuro, ADR 0001).
