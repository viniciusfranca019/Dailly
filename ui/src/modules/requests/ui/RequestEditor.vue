<script setup lang="ts">
import type { Folder } from '@dailly/requests-core'
import { ref } from 'vue'
import { rowId, type Draft } from './draft.js'

/**
 * Os campos de uma request HTTP, no arranjo que a categoria inteira usa.
 *
 * Método, URL e Enviar numa linha; o resto em abas. Não é imitação: empilhado,
 * um curl do DevTools com dez headers empurra o corpo para fora da tela, e a
 * coisa que mais se olha — a URL — fica no meio de um rolamento. Uma coisa por
 * vez é o que faz caber.
 *
 * Editáveis e não só leitura porque "recria a request lá" quer dizer que os
 * campos estão lá: um cliente de API onde não dá para trocar `localhost:3000`
 * por `staging` obriga a colar o curl de novo a cada tentativa.
 *
 * O rascunho é um `defineModel` e os campos mexem nele direto. O componente
 * não guarda cópia: uma cópia significaria decidir quando sincronizar, e a
 * resposta errada aí é o clássico "editei e o que salvou foi o valor antigo".
 */
const draft = defineModel<Draft>({ required: true })

defineProps<{
  folders: readonly Folder[]
  /** `null` enquanto a request ainda não foi salva — não há o que apagar. */
  savedId: string | null
  saving: boolean
  deleting: boolean
  running: boolean
}>()

const emit = defineEmits<{ save: []; execute: []; remove: []; pasteCurl: [raw: string] }>()

/**
 * A barra de URL também é por onde um curl entra — como no Postman.
 *
 * O gatilho é o **valor**, não o evento de colar: `ClipboardEvent` com dados
 * não existe no jsdom (nem `DataTransfer`), então um `@paste` seria a única
 * coisa deste arquivo impossível de testar. E olhar o valor cobre de graça
 * colar com o botão do meio e arrastar texto para dentro do campo.
 *
 * São **duas** condições, e a segunda foi comprada caro. `curl` seguido de
 * espaço protege quem digita uma URL; não protege quem digita um curl, e
 * `curl h` já é um import válido: no sexto caractere o campo colapsava para
 * `h` e todo o resto — `-H` incluído — virava URL comum, sem erro e sem aviso.
 *
 * A segunda condição é o **salto**: colar insere muitos caracteres de uma vez,
 * digitar insere um. É o que separa os dois gestos sem precisar do evento de
 * colar, que o jsdom não sabe construir com dados.
 */
const CURL = /^\s*curl\s/

let previous = ''

function onUrl(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  const pasted = value.length - previous.length > 1
  previous = value
  if (pasted && CURL.test(value)) emit('pasteCurl', value)
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

type Tab = 'params' | 'headers' | 'body' | 'auth'

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'params', label: 'Params' },
  { id: 'headers', label: 'Headers' },
  { id: 'body', label: 'Body' },
  { id: 'auth', label: 'Auth' },
]

/**
 * Abre em Headers, e não em Params como o Postman.
 *
 * Params aqui é só-leitura e quase sempre vazia — ela mostra o que o `-G`
 * trouxe. Abrir numa aba vazia na maioria das vezes é gastar o primeiro olhar
 * com nada.
 */
const tab = ref<Tab>('headers')

const addHeader = () => draft.value.headers.push({ id: rowId(), name: '', value: '' })
const removeHeader = (at: number) => draft.value.headers.splice(at, 1)
/** `password: ''` e não `null`: quem acrescenta aqui está separando os dois campos. */
const addAuth = () => (draft.value.auth = { user: '', password: '' })
</script>

<template>
  <section class="flex min-h-0 flex-col gap-3" data-testid="editor">
    <div class="flex flex-wrap items-center gap-2">
      <input
        v-model="draft.name"
        data-testid="name"
        aria-label="Nome da request"
        placeholder="sem nome"
        class="min-w-40 flex-1 rounded border border-transparent bg-transparent px-1 py-1 text-sm font-medium text-gray-100 hover:border-[#1e2638] focus:border-[#1e2638]"
      />
      <select
        v-model="draft.folderId"
        data-testid="request-folder"
        aria-label="Pasta"
        class="rounded border border-[#1e2638] bg-[#0a0d16] px-2 py-1 text-xs text-gray-300"
      >
        <option :value="null">sem pasta</option>
        <option v-for="folder in folders" :key="folder.id" :value="folder.id">
          {{ folder.name }}
        </option>
      </select>
    </div>

    <!-- A linha que dispara. Tudo o que não é ela mora atrás de uma aba. -->
    <div class="flex items-stretch overflow-hidden rounded-md border border-[#1e2638]">
      <input
        v-model="draft.method"
        data-testid="method"
        aria-label="Método"
        list="requests-methods"
        class="w-24 border-r border-[#1e2638] bg-[#0a0d16] px-2 py-2 text-sm font-semibold uppercase text-blue-300"
      />
      <!--
        Uma lista sugerida e não um `<select>`: há APIs com verbos fora dos
        sete, e um menu fechado tornaria impossível colar um curl que usa um
        deles — recusando na tela o que o curl original mandava.
      -->
      <datalist id="requests-methods">
        <option v-for="method in METHODS" :key="method" :value="method" />
      </datalist>
      <input
        v-model="draft.url"
        data-testid="url"
        @input="onUrl"
        aria-label="URL"
        placeholder="https://… ou cole um curl aqui"
        class="min-w-0 flex-1 bg-[#0a0d16] px-3 py-2 font-mono text-sm text-gray-200"
      />
      <button
        type="button"
        data-testid="execute"
        :disabled="running"
        class="bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        @click="emit('execute')"
      >
        Enviar
      </button>
    </div>

    <!--
      Botões com `aria-selected`, e não o padrão WAI-ARIA completo de abas.
      O padrão completo pede tabindex móvel e navegação por setas; meio caminho
      é pior que nenhum, porque anuncia um contrato de teclado que não cumpre.
    -->
    <div class="flex gap-1 border-b border-[#1e2638]" aria-label="Partes da request">
      <button
        v-for="item in TABS"
        :key="item.id"
        type="button"
        :data-testid="`tab-${item.id}`"
        :aria-selected="tab === item.id"
        :aria-controls="`requests-panel-${item.id}`"
        class="-mb-px border-b-2 px-3 py-1.5 text-xs font-medium transition-colors"
        :class="
          tab === item.id
            ? 'border-blue-500 text-gray-100'
            : 'border-transparent text-[#747e8f] hover:text-gray-300'
        "
        @click="tab = item.id"
      >
        {{ item.label }}
      </button>
    </div>

    <div id="requests-panel-params" v-if="tab === 'params'" class="text-xs text-[#747e8f]">
      <!--
        Só-leitura neste corte. Estes pares vieram do `-G` e ficam **fora** da
        URL até o `toWire` (B1): colá-los aqui exigiria escolher entre `?` e `&`
        olhando um texto que pode ser `{{ '{{baseUrl}}' }}`. Torná-los editáveis
        pede o caminho de volta no `savedOf`, que é mais que arranjo de tela.
      -->
      <p v-if="draft.query.length === 0">
        Nada aqui. Esta aba mostra os pares que um <code>curl -G</code> mandou para a
        query — eles só se juntam à URL na hora de sair.
      </p>
      <p v-else data-testid="query">
        query do <code>-G</code>: {{ draft.query.join(' & ') }}
      </p>
    </div>

    <div id="requests-panel-headers" v-else-if="tab === 'headers'" class="flex flex-col gap-1.5">
      <!--
        A chave é a identidade da **linha**, não o índice e não o par: dois `-H`
        iguais são legítimos, e com o índice remover a primeira de duas destrói
        o nó da segunda — que é justamente onde o cursor está.
      -->
      <div v-for="(header, at) in draft.headers" :key="header.id" class="flex items-center gap-2">
        <input
          v-model="header.name"
          data-testid="header-name"
          aria-label="Nome do header"
          class="w-56 rounded border border-[#1e2638] bg-[#0a0d16] px-2 py-1 font-mono text-xs text-gray-300"
        />
        <input
          v-model="header.value"
          data-testid="header-value"
          aria-label="Valor do header"
          class="min-w-0 flex-1 rounded border border-[#1e2638] bg-[#0a0d16] px-2 py-1 font-mono text-xs text-gray-300"
        />
        <button
          type="button"
          data-testid="remove-header"
          :aria-label="`Remover header ${header.name}`"
          class="rounded border border-[#1e2638] px-2 py-1 text-xs text-[#747e8f] hover:bg-white/5"
          @click="removeHeader(at)"
        >
          ×
        </button>
      </div>
      <button
        type="button"
        data-testid="add-header"
        class="self-start rounded border border-[#1e2638] px-2 py-1 text-xs text-gray-300 hover:bg-white/5"
        @click="addHeader"
      >
        + header
      </button>
    </div>

    <label id="requests-panel-body" v-else-if="tab === 'body'" class="flex flex-col gap-1">
      <span class="sr-only">Corpo</span>
      <textarea
        v-model="draft.body"
        data-testid="body"
        rows="10"
        class="rounded border border-[#1e2638] bg-[#0a0d16] px-2 py-1.5 font-mono text-xs text-gray-200"
      ></textarea>
    </label>

    <div id="requests-panel-auth" v-else class="flex flex-wrap items-center gap-2">
      <template v-if="draft.auth">
        <input
          v-model="draft.auth.user"
          data-testid="auth-user"
          :aria-label="draft.auth.password === null ? 'Credencial' : 'Usuário'"
          class="w-56 rounded border border-[#1e2638] bg-[#0a0d16] px-2 py-1 font-mono text-xs text-gray-300"
        />
        <!--
          Sem senha separada não há campo de senha — e isso é a correção, não a
          economia de um input.

          `password === null` quer dizer "o curl não trouxe dois-pontos", e é o
          que faz `-u '{{ '{{credencial}}' }}'` atravessar a interpolação inteiro. Com um
          campo ligado por `@input`, digitar uma letra e apagá-la trocava `null`
          por `''` para sempre, sem intenção de ninguém — e a diferença é
          observável na fita, porque os dois produzem `Authorization` diferentes.
        -->
        <template v-if="draft.auth.password === null">
          <button
            type="button"
            data-testid="split-credential"
            class="rounded border border-[#1e2638] px-2 py-1 text-xs text-gray-300 hover:bg-white/5"
            @click="draft.auth.password = ''"
          >
            separar usuário e senha
          </button>
          <p class="w-full text-xs text-[#747e8f]">
            credencial única — o <code>:</code> é fechado na hora de sair.
          </p>
        </template>
        <template v-else>
          <input
            v-model="draft.auth.password"
            data-testid="auth-password"
            aria-label="Senha"
            type="password"
            class="w-56 rounded border border-[#1e2638] bg-[#0a0d16] px-2 py-1 font-mono text-xs text-gray-300"
          />
          <button
            type="button"
            data-testid="join-credential"
            class="rounded border border-[#1e2638] px-2 py-1 text-xs text-gray-300 hover:bg-white/5"
            @click="draft.auth.password = null"
          >
            voltar a credencial única
          </button>
        </template>
      </template>

      <template v-else>
        <p class="text-xs text-[#747e8f]">Sem autenticação.</p>
        <button
          type="button"
          data-testid="add-auth"
          class="rounded border border-[#1e2638] px-2 py-1 text-xs text-gray-300 hover:bg-white/5"
          @click="addAuth"
        >
          usar Basic
        </button>
      </template>
    </div>

    <div class="flex items-center gap-2 border-t border-[#1e2638] pt-3">
      <button
        type="button"
        data-testid="save"
        :disabled="saving || deleting"
        class="rounded border border-[#1e2638] px-3 py-1.5 text-sm text-gray-200 hover:bg-white/5 disabled:opacity-50"
        @click="emit('save')"
      >
        Salvar
      </button>
      <p class="flex-1 text-xs text-[#747e8f]">
        Enviar grava o que está na tela antes de rodar — o servidor executa o que está
        guardado.
      </p>
      <button
        v-if="savedId"
        type="button"
        data-testid="delete"
        :disabled="saving || deleting"
        class="rounded border border-red-500/30 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-50"
        @click="emit('remove')"
      >
        Apagar
      </button>
    </div>
  </section>
</template>
