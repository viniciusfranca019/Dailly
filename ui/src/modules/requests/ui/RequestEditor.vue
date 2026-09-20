<script setup lang="ts">
import type { Folder } from '@dailly/requests-core'
import { rowId, type Draft } from './draft.js'

/**
 * Os campos de uma request HTTP, editáveis.
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
  /** `null` enquanto a request ainda não foi salva — não há o que executar. */
  savedId: string | null
  saving: boolean
  running: boolean
}>()

const emit = defineEmits<{ save: []; execute: []; remove: [] }>()

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

const addHeader = () => draft.value.headers.push({ id: rowId(), name: '', value: '' })
const removeHeader = (at: number) => draft.value.headers.splice(at, 1)
</script>

<template>
  <section class="flex flex-col gap-3" data-testid="editor">
    <div class="flex flex-wrap items-center gap-2">
      <input
        v-model="draft.name"
        data-testid="name"
        aria-label="Nome da request"
        placeholder="sem nome"
        class="min-w-40 flex-1 rounded border border-[#1e2638] bg-[#0a0d16] px-2 py-1.5 text-sm font-medium text-gray-100"
      />
      <select
        v-model="draft.folderId"
        data-testid="request-folder"
        aria-label="Pasta"
        class="rounded border border-[#1e2638] bg-[#0a0d16] px-2 py-1.5 text-sm text-gray-300"
      >
        <option :value="null">sem pasta</option>
        <option v-for="folder in folders" :key="folder.id" :value="folder.id">
          {{ folder.name }}
        </option>
      </select>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <input
        v-model="draft.method"
        data-testid="method"
        aria-label="Método"
        list="requests-methods"
        class="w-28 rounded border border-[#1e2638] bg-[#0a0d16] px-2 py-1.5 text-sm font-semibold uppercase text-blue-300"
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
        aria-label="URL"
        placeholder="https://…"
        class="min-w-60 flex-1 rounded border border-[#1e2638] bg-[#0a0d16] px-2 py-1.5 font-mono text-sm text-gray-200"
      />
      <button
        type="button"
        data-testid="save"
        :disabled="saving"
        class="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        @click="emit('save')"
      >
        Salvar
      </button>
      <button
        v-if="savedId"
        type="button"
        data-testid="execute"
        :disabled="running"
        class="rounded border border-blue-500/40 px-3 py-1.5 text-sm font-medium text-blue-200 hover:bg-blue-500/10 disabled:opacity-50"
        @click="emit('execute')"
      >
        Executar
      </button>
      <button
        v-if="savedId"
        type="button"
        data-testid="delete"
        class="rounded border border-red-500/30 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/10"
        @click="emit('remove')"
      >
        Apagar
      </button>
    </div>

    <div v-if="draft.query.length > 0" class="text-xs text-[#747e8f]" data-testid="query">
      query do <code>-G</code>: {{ draft.query.join(' & ') }} — colada na URL só na hora de sair.
    </div>

    <fieldset class="flex flex-col gap-1.5">
      <legend class="mb-1 text-xs font-semibold uppercase tracking-wide text-[#747e8f]">
        Headers
      </legend>
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
    </fieldset>

    <fieldset v-if="draft.auth" class="flex flex-wrap items-center gap-2">
      <legend class="mb-1 text-xs font-semibold uppercase tracking-wide text-[#747e8f]">
        Basic
      </legend>
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
        que faz `-u '{{credencial}}'` atravessar a interpolação inteiro. Com um
        campo ligado por `@input`, digitar uma letra e apagá-la trocava `null`
        por `''` para sempre, sem intenção de ninguém — e a diferença é
        observável na fita, porque os dois produzem `Authorization` diferentes.
        Agora sair do estado é um clique que diz o que faz.
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
        <!-- `v-model` direto: dentro deste ramo a senha é `string`, então o
             `:value` + `@input` com cast só existia para contornar o `null`
             que este ramo já excluiu. -->
        <input
          v-model="draft.auth.password"
          data-testid="auth-password"
          aria-label="Senha"
          type="password"
          class="w-56 rounded border border-[#1e2638] bg-[#0a0d16] px-2 py-1 font-mono text-xs text-gray-300"
        />
        <!-- A volta. Entrar no estado separado era um clique que dizia o que
             fazia e sair dele não existia: um clique errado mudava a semântica
             do `Authorization` para sempre, e a única saída era recolar o
             curl. -->
        <button
          type="button"
          data-testid="join-credential"
          class="rounded border border-[#1e2638] px-2 py-1 text-xs text-gray-300 hover:bg-white/5"
          @click="draft.auth.password = null"
        >
          voltar a credencial única
        </button>
      </template>
    </fieldset>

    <label class="flex flex-col gap-1">
      <span class="text-xs font-semibold uppercase tracking-wide text-[#747e8f]">Corpo</span>
      <textarea
        v-model="draft.body"
        data-testid="body"
        rows="6"
        class="rounded border border-[#1e2638] bg-[#0a0d16] px-2 py-1.5 font-mono text-xs text-gray-200"
      ></textarea>
    </label>
  </section>
</template>
