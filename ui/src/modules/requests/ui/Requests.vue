<script setup lang="ts">
import type { Folder, SavedRequest } from '@dailly/requests-core'
import {
  ExecutionFailedError,
  MissingVariablesError,
  type ExecutedResponse,
  type ModuleDeps,
} from '@shared'
import { computed, onMounted, ref } from 'vue'
import Collections from './Collections.vue'
import RequestEditor from './RequestEditor.vue'
import ResponseView from './ResponseView.vue'
import { decodeBody, type DecodedBody } from './decode.js'
import { draftOf, importCurl, savedOf, type Draft } from './draft.js'
import { parseEnv } from './env.js'
import { newId } from './ids.js'

/**
 * Requests: editar em cima, resposta embaixo, coleção à direita.
 *
 * A tela é a única parte do módulo que guarda estado, e guarda todo ele: as
 * três peças abaixo recebem e emitem. É o mesmo arranjo do Daily Log, e pelo
 * mesmo motivo — estado espalhado por quatro componentes vira quatro versões
 * da mesma verdade.
 *
 * O que ela **não** faz é executar. Isso mora no servidor
 * ([ADR 0011](../../../../../docs/adrs/0011-requests-modulo-e-execucao.md)):
 * um renderer não manda `Host`, `Origin` nem `Cookie`, e gRPC não existe num
 * webview. O que chega de volta é um envelope, e descomprimi-lo é trabalho
 * desta tela — a outra metade daquela decisão.
 */
const props = defineProps<{ deps: ModuleDeps }>()

const folders = ref<readonly Folder[]>([])
const requests = ref<readonly SavedRequest[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
/** O que falhou na última operação — sempre dizendo **de qual** request. */
const error = ref<string | null>(null)
/**
 * O que há para dizer sobre a request que está na tela.
 *
 * Separado do `error` porque eram duas coisas no mesmo lugar: uma recusa
 * atrasada de outra request comia a explicação de por que aquela tela só tem
 * botão de apagar — e o no-op do reclique tornava isso permanente.
 */
const notice = ref<string | null>(null)

const selected = ref<SavedRequest | null>(null)
const draft = ref<Draft | null>(null)
const saving = ref(false)
const deleting = ref(false)
const savingFolder = ref(false)

const pasting = ref(false)
const curl = ref('')
const ignored = ref<readonly string[]>([])
const importError = ref<string | null>(null)

const folderError = ref<string | null>(null)
const folderSaved = ref(0)

/**
 * O env atravessa a troca de request de propósito.
 *
 * Ele é do momento, não da request: a mesma coleção roda contra `staging` e
 * contra produção sem virar duas coleções. Limpar a cada clique obrigaria a
 * redigitar o token a cada request da mesma sessão — dito aqui porque é a
 * única peça de estado que sobrevive à troca, e silêncio pareceria descuido.
 */
const env = ref('')
const running = ref(false)
const response = ref<ExecutedResponse | null>(null)
const decoded = ref<DecodedBody | null>(null)
const executionError = ref<string | null>(null)

const reason = (cause: unknown, fallback: string) =>
  cause instanceof Error ? cause.message : fallback

/**
 * Quem manda é a última leitura **pedida**, não a última que resolve.
 *
 * `load()` é chamado de cinco lugares — montagem, "tentar de novo", salvar,
 * criar pasta, apagar — e sem ordem uma leitura que falha tarde apaga do ecrã
 * uma árvore que já estava certa, deixando um "tentar de novo" sobre dados
 * corretos. Mesma ideia do `navigation` do `mount.ts`, e pela mesma razão.
 */
let reading = 0

async function load(): Promise<void> {
  const ticket = (reading += 1)
  // "Lendo" só quando não há o que mostrar. Marcar toda releitura branqueava a
  // coleção inteira a cada salvar, criar pasta ou apagar — dado bom que já
  // está na tela não devia piscar por causa de um refetch.
  loading.value = folders.value.length === 0 && requests.value.length === 0
  loadError.value = null
  try {
    const [readFolders, readRequests] = await Promise.all([
      props.deps.requests.folders(),
      props.deps.requests.requests(),
    ])
    if (ticket !== reading) return
    folders.value = readFolders
    requests.value = readRequests
  } catch (cause) {
    if (ticket !== reading) return
    loadError.value = reason(cause, 'não consegui ler a coleção')
  } finally {
    if (ticket === reading) loading.value = false
  }
}

/** Trocar de request apaga a resposta: ela era da outra. */
function clearResponse(): void {
  response.value = null
  decoded.value = null
  executionError.value = null
}

/**
 * Qual execução é dona da tela.
 *
 * `clearResponse()` sozinho não bastava: ele limpa o que está na tela e não
 * diz nada à execução **em voo**, que resolve depois e se instala numa tela
 * que já não é dela — a resposta de `r2` aparecendo embaixo do nome de `r1`.
 * E o `running` atravessava a troca junto, deixando o botão da request nova
 * desabilitado pela execução da velha.
 *
 * Chamado por `pick`, `startPaste` e `remove`, e **não** por `save` — decisão,
 * não esquecimento. Salvar não troca de request: a resposta em voo é da mesma
 * `id` e continua sendo sobre ela, então descartá-la jogaria fora um resultado
 * que a pessoa pediu. O que muda é o spec guardado, e isso a resposta já
 * anterior não afirma ser.
 */
let generation = 0

function invalidate(): void {
  generation += 1
  running.value = false
  clearResponse()
}

/**
 * Quem é dono do editor — uma sequência à parte da execução.
 *
 * `save()` e `remove()` também escrevem `selected` e `draft` depois de um
 * `await`, e sem isto faziam o mesmo estrago que a execução fazia: salvar uma
 * request lenta e ir para outra trazia a tela de volta sozinha, e apagar com
 * outra já aberta levava junto o editor dela.
 *
 * Separada de `generation` de propósito. Uma execução termina e a tela segue;
 * o editor muda por outra razão e em outro ritmo, e juntar as duas faria
 * qualquer execução cancelar uma gravação em voo.
 */
let editor = 0

function pick(request: SavedRequest): void {
  /**
   * Clicar em quem já está na tela não é navegar.
   *
   * Sem esta linha o reclique zerava `running` — furando a guarda de clique
   * duplo do `execute`, que existe porque num POST a requisição sairia duas
   * vezes — e ainda jogava fora a edição não salva e a resposta que a pessoa
   * estava lendo. Mesma lição do `requested` no `mount.ts`: a pergunta certa é
   * "é aqui que eu já estou?".
   */
  if (request.id === selected.value?.id) return

  editor += 1
  selected.value = request
  pasting.value = false
  importError.value = null
  ignored.value = []
  invalidate()

  const fields = draftOf(request)
  draft.value = fields
  notice.value =
    fields === null
      ? 'essa request tem um spec que não dá para ler — dá para apagá-la, e é só o que dá.'
      : null
}

function startPaste(): void {
  pasting.value = true
  curl.value = ''
  ignored.value = []
  importError.value = null
  error.value = null
  notice.value = null
  folderError.value = null
  editor += 1
  selected.value = null
  draft.value = null
  invalidate()
}

function doImport(): void {
  const result = importCurl(curl.value)
  if (result.kind === 'rejected') {
    importError.value = result.reason
    draft.value = null
    return
  }

  importError.value = null
  ignored.value = result.ignored
  draft.value = result.draft
  pasting.value = false
}

/**
 * Gravar e apagar mexem na mesma request e não podem correr juntas.
 *
 * Sem isto os dois botões eram clicáveis ao mesmo tempo: o DELETE resolvia, a
 * árvore esvaziava, e o POST atrasado reinseria a linha — o que a pessoa
 * mandou apagar voltava sozinho, sem nada dizendo. Um guarda global é mais
 * conservador do que precisaria (duas requests diferentes poderiam gravar em
 * paralelo), e o preço é um botão desabilitado por alguns milissegundos.
 * Barato perto de duas escritas disputando o mesmo `load()`.
 */
const busy = () => saving.value || deleting.value

async function save(): Promise<void> {
  if (draft.value === null || busy()) return
  const request = savedOf(draft.value, {
    id: selected.value?.id ?? newId(),
    position: selected.value?.position ?? requests.value.length,
  })
  if (request === null) {
    error.value = 'falta método ou URL — sem os dois não há o que salvar nem o que executar.'
    return
  }

  const ticket = editor
  saving.value = true
  error.value = null
  try {
    const stored = await props.deps.requests.saveRequest(request)
    // A gravação segue valendo — ela já está no banco —, mas a tela pode ter
    // virado enquanto ela ia e voltava. Escrever aqui traria de volta a
    // request que a pessoa acabou de deixar.
    if (ticket === editor) {
      selected.value = stored
      /**
       * Só o **nome** vem do que ficou gravado.
       *
       * Salvar sem nome batiza a request com a URL (`savedOf`), e sem isto a
       * árvore mostrava a URL enquanto o campo Nome continuava vazio. Trocar o
       * rascunho inteiro consertava aquilo e estragava dois: apagava o que a
       * pessoa digitou durante a ida e volta, e — porque `draftOf` gera
       * `rowId()` novo — remontava todas as linhas de header, que é o oposto
       * do que o `rowId` existe para garantir.
       */
      if (draft.value !== null) draft.value.name = stored.name
    }
    await load()
  } catch (cause) {
    // Nomeada, e não suprimida. Perder a notícia de que **não gravou** é pior
    // do que mostrá-la depois de a pessoa ter ido para outra request — o que
    // não pode é ela chegar anônima e parecer ser sobre a tela atual.
    error.value = `não consegui salvar «${request.name}»: ${reason(cause, 'a API recusou')}`
  } finally {
    saving.value = false
  }
}

async function createFolder(input: { name: string; parentId: string | null }): Promise<void> {
  // Sem esta guarda, dois cliques criavam duas pastas com `newId()` diferentes
  // — nem o servidor deduplica. E como não há rota de apagar pasta neste
  // corte, a duplicata não teria como sair pela tela.
  if (savingFolder.value) return

  savingFolder.value = true
  folderError.value = null
  try {
    await props.deps.requests.saveFolder({
      id: newId(),
      parentId: input.parentId,
      name: input.name,
      position: folders.value.length,
    })
    // Só depois do sucesso: é este sinal que fecha o formulário e limpa o
    // nome. Limpar no clique apagava o que a pessoa digitou antes de saber se
    // tinha dado certo.
    folderSaved.value += 1
    await load()
  } catch (cause) {
    // A recusa do servidor é a frase que explica o que houve — "não foi
    // possível criar a pasta" faria a pessoa tentar de novo igual. E ela
    // aparece **no formulário**, que é onde a pessoa está olhando.
    folderError.value = reason(cause, 'não consegui criar a pasta')
  } finally {
    savingFolder.value = false
  }
}

async function remove(): Promise<void> {
  const id = selected.value?.id
  if (id === undefined) return

  // Mesma guarda do salvar, pela mesma razão — e mais uma: dois cliques rápidos
  // em Apagar mandavam dois DELETE. O servidor é idempotente hoje, o que faz
  // disto omissão e não defeito visível; a omissão é a mesma.
  if (busy()) return

  const name = selected.value?.name ?? 'esta request'
  const ticket = editor
  deleting.value = true
  error.value = null
  try {
    await props.deps.requests.deleteRequest(id)
    if (ticket === editor) {
      // Não incremento `editor` aqui. A tentação existe — ler uma sequência
      // sem nunca movê-la foi o buraco desta rodada —, mas quem fecha essa
      // porta é a exclusão mútua acima: nenhuma gravação pode estar em voo
      // quando um apagar resolve. Um segundo mecanismo para o mesmo buraco
      // seria código que nenhum teste consegue alcançar, e este diff já tirou
      // um desses.
      selected.value = null
      draft.value = null
      notice.value = null
      invalidate()
    }
    await load()
  } catch (cause) {
    error.value = `não consegui apagar «${name}»: ${reason(cause, 'a API recusou')}`
  } finally {
    deleting.value = false
  }
}

/** As quatro falhas, cada uma dizendo onde procurar. */
function describeFailure(cause: unknown): string {
  if (cause instanceof MissingVariablesError) {
    const missing = cause.missing.join(', ')
    const surviving =
      cause.surviving.length > 0 ? ` As preenchidas: ${cause.surviving.join(', ')}.` : ''
    return `Nada saiu para a rede: falta valor para ${missing}.${surviving}`
  }
  if (cause instanceof ExecutionFailedError) {
    if (cause.kind === 'offline') {
      return `A API local deste app não respondeu, então o alvo nem chegou a ser tentado. (${cause.message})`
    }
    if (cause.kind === 'refused') {
      return `O servidor recusou esta request antes de abrir conexão: ${cause.message}`
    }
    if (cause.kind === 'unreachable') {
      return `O alvo não atendeu: ${cause.message}`
    }
    return `O alvo atendeu mas não terminou no prazo: ${cause.message}`
  }
  return reason(cause, 'não consegui executar')
}

async function execute(): Promise<void> {
  const id = selected.value?.id
  // A guarda é contra o clique duplo: duas execuções em voo mostram a que
  // terminar por último, que não é a última que a pessoa pediu — e num POST a
  // requisição sai duas vezes.
  if (id === undefined || running.value) return

  clearResponse()
  const ticket = (generation += 1)
  running.value = true
  try {
    const result = await props.deps.requests.execute(id, parseEnv(env.value))
    const body = await decodeBody(result)
    // Alguém trocou de request, colou outro curl ou apagou esta enquanto isto
    // estava em voo. Quem está na tela manda.
    if (ticket !== generation) return
    response.value = result
    decoded.value = body
  } catch (cause) {
    if (ticket !== generation) return
    executionError.value = describeFailure(cause)
  } finally {
    if (ticket === generation) running.value = false
  }
}

/**
 * O que a região viva anuncia — e por que ela é fixa.
 *
 * A resposta chega sozinha, depois de um clique que já passou. Pôr `aria-live`
 * na própria seção não resolve: uma região que entra no DOM junto com o
 * conteúdo não é anunciada. Esta fica montada desde o começo e só o texto
 * muda, que é o que um leitor de tela de fato lê.
 */
const announcement = computed(() => {
  if (running.value) return 'executando'
  if (executionError.value !== null) return executionError.value
  if (response.value !== null) {
    return `resposta ${response.value.status} em ${response.value.durationMs} milissegundos`
  }
  return ''
})

onMounted(load)
</script>

<template>
  <div class="flex h-full min-h-0 flex-col" data-testid="requests">
    <p class="sr-only" aria-live="polite" data-testid="announcement">{{ announcement }}</p>
    <nav class="flex items-center gap-2 px-6 py-4 text-sm text-[#747e8f]">
      <span>Requests</span>
      <span class="text-[#1e2638]">/</span>
      <span class="text-gray-300">{{ selected?.name ?? 'nova' }}</span>
    </nav>

    <div class="grid min-h-0 flex-1 grid-cols-1 gap-6 px-6 pb-6 xl:grid-cols-[minmax(0,1fr)_auto]">
      <div class="flex min-h-0 flex-col gap-3 overflow-y-auto">
        <form
          v-if="pasting"
          class="flex flex-col gap-2"
          data-testid="paste"
          @submit.prevent="doImport"
        >
          <label class="flex flex-col gap-2">
            <span class="text-xs font-semibold uppercase tracking-wide text-[#747e8f]">
              Cole o curl
            </span>
            <!-- Dentro da label: sem `for` ela era órfã, e o campo só tinha o
                 nome acessível do `aria-label`, que dizia menos. -->
            <textarea
            v-model="curl"
            data-testid="curl"
            rows="5"
            placeholder="curl 'https://api.exemplo.dev/v1/coisas' -H 'authorization: Bearer {{token}}'"
            class="rounded border border-[#1e2638] bg-[#0a0d16] px-2 py-1.5 font-mono text-xs text-gray-200"
            ></textarea>
          </label>
          <button
            type="submit"
            data-testid="import-curl"
            class="self-start rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
          >
            Importar
          </button>
        </form>

        <p
          v-if="importError"
          role="alert"
          data-testid="import-error"
          class="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {{ importError }}
        </p>

        <!--
          O que o importador deixou de fora fica na tela até a pessoa trocar de
          request. `--compressed` vem em quase todo curl do DevTools e é
          inofensivo; `-k` desliga verificação de certificado e **não** foi
          aplicado — quem colou precisa saber qual dos dois é o caso.
        -->
        <p
          v-if="ignored.length > 0"
          data-testid="ignored"
          class="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200"
        >
          não apliquei: {{ ignored.join(', ') }}
        </p>

        <p
          v-if="notice"
          data-testid="notice"
          class="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-200"
        >
          {{ notice }}
        </p>

        <p
          v-if="error"
          role="alert"
          data-testid="error"
          class="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {{ error }}
        </p>

        <!--
          A request que não dá para ler ainda dá para apagar — e o botão tem
          que existir, senão a tela promete o que não entrega. A cadeia inteira
          (`CorruptSpecError` no servidor, `spec` cru no adapter, `draftOf`
          devolvendo nulo) existe para chegar até aqui.
        -->
        <button
          v-if="selected && !draft"
          type="button"
          data-testid="delete"
          class="self-start rounded border border-red-500/30 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/10"
          @click="remove"
        >
          Apagar esta request
        </button>

        <RequestEditor
          v-if="draft"
          v-model="draft"
          :folders="folders"
          :saved-id="selected?.id ?? null"
          :saving="saving"
          :deleting="deleting"
          :running="running"
          @save="save"
          @execute="execute"
          @remove="remove"
        />

        <label v-if="draft" class="flex flex-col gap-1">
          <span class="text-xs font-semibold uppercase tracking-wide text-[#747e8f]">
            Variáveis — <code>NOME=valor</code>, uma por linha
          </span>
          <textarea
            v-model="env"
            data-testid="env"
            rows="3"
            class="rounded border border-[#1e2638] bg-[#0a0d16] px-2 py-1.5 font-mono text-xs text-gray-200"
          ></textarea>
        </label>

        <p v-if="running" data-testid="running" class="text-sm text-[#747e8f]">executando…</p>

        <p
          v-if="executionError"
          role="alert"
          data-testid="execution-error"
          class="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm leading-relaxed text-red-300"
        >
          {{ executionError }}
        </p>

        <ResponseView v-if="response && decoded" :response="response" :decoded="decoded" />
      </div>

      <Collections
        :folders="folders"
        :requests="requests"
        :loading="loading"
        :error="loadError"
        :selected="selected?.id ?? null"
        :folder-error="folderError"
        :folder-saved="folderSaved"
        :saving-folder="savingFolder"
        @clear-folder-error="folderError = null"
        @pick="pick"
        @retry="load"
        @paste="startPaste"
        @create-folder="createFolder"
      />
    </div>
  </div>
</template>
