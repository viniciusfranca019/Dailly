<script setup lang="ts">
import { VaultRefusedError, type SecretSummary, type VaultPort, type VaultState } from '@shared'
import { onMounted, ref } from 'vue'

/**
 * O cofre na tela (ADR 0013): criar, destrancar, listar mascarado, revelar sob
 * clique, copiar, gravar e apagar.
 *
 * Um valor só existe aqui enquanto está à mostra. Esconder apaga o texto, e
 * copiar busca o valor, copia e não o deixa na tela — é o servidor que guarda.
 */
const props = defineProps<{ vault: VaultPort }>()

const ENVIRONMENT = 'default'
const MASK = '••••••••'

const state = ref<VaultState | null>(null)
const secrets = ref<readonly SecretSummary[]>([])
const revealed = ref<Readonly<Record<string, string>>>({})
const error = ref<string | null>(null)
const busy = ref(false)

const password = ref('')
const recovery = ref<string | null>(null)
const useRecovery = ref(false)
const recoveryInput = ref('')
const newName = ref('')
const newValue = ref('')

const say = (cause: unknown, fallback: string) => {
  error.value = cause instanceof Error ? cause.message : fallback
}

async function refresh(): Promise<void> {
  state.value = await props.vault.status()
  secrets.value = state.value === 'aberto' || state.value === 'trancado' ? await props.vault.list() : []
}

/** Uma ação do cofre: limpa o erro, roda, relê o estado; uma recusa vira a frase do servidor. */
async function act(work: () => Promise<void>, fallback: string): Promise<boolean> {
  if (busy.value) return false
  busy.value = true
  error.value = null
  try {
    await work()
    await refresh()
    return true
  } catch (cause) {
    say(cause, fallback)
    if (cause instanceof VaultRefusedError && cause.kind === 'locked') await refresh()
    return false
  } finally {
    busy.value = false
  }
}

async function create(): Promise<void> {
  if (password.value.length < 8) {
    error.value = 'a senha precisa ter pelo menos 8 caracteres'
    return
  }
  const typed = password.value
  await act(async () => {
    recovery.value = await props.vault.create(typed)
    password.value = ''
  }, 'não consegui criar o cofre')
}

async function unlock(): Promise<void> {
  const ok = await act(
    () =>
      useRecovery.value
        ? props.vault.unlockWithRecovery(recoveryInput.value)
        : props.vault.unlock(password.value),
    'não consegui abrir o cofre',
  )
  if (ok) {
    password.value = ''
    recoveryInput.value = ''
    emit('unlocked')
  }
}

async function lock(): Promise<void> {
  revealed.value = {}
  await act(() => props.vault.lock(), 'não consegui trancar o cofre')
}

async function toggle(name: string): Promise<void> {
  if (name in revealed.value) {
    const { [name]: _gone, ...rest } = revealed.value
    revealed.value = rest
    return
  }
  await act(async () => {
    revealed.value = { ...revealed.value, [name]: await props.vault.reveal(ENVIRONMENT, name) }
  }, `não consegui revelar «${name}»`)
}

async function copy(name: string): Promise<void> {
  await act(async () => {
    const value = revealed.value[name] ?? (await props.vault.reveal(ENVIRONMENT, name))
    await globalThis.navigator.clipboard.writeText(value)
  }, `não consegui copiar «${name}»`)
}

async function add(): Promise<void> {
  const name = newName.value.trim()
  if (name === '') return
  const value = newValue.value
  const ok = await act(() => props.vault.save(ENVIRONMENT, name, value), `não consegui gravar «${name}»`)
  if (ok) {
    newName.value = ''
    newValue.value = ''
  }
}

async function remove(name: string): Promise<void> {
  const { [name]: _gone, ...rest } = revealed.value
  revealed.value = rest
  await act(() => props.vault.remove(ENVIRONMENT, name), `não consegui apagar «${name}»`)
}

const emit = defineEmits<{ unlocked: [] }>()

onMounted(() => {
  void refresh().catch((cause) => say(cause, 'não consegui ler o cofre'))
})
</script>

<template>
  <section
    data-testid="vault-panel"
    class="flex flex-col gap-3 rounded-md border border-[#1e2638] bg-[#0a0d16] p-3 text-sm text-gray-200"
  >
    <header class="flex items-center justify-between">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-[#747e8f]">Cofre</h2>
      <button
        v-if="state === 'aberto'"
        type="button"
        data-testid="vault-lock"
        class="rounded border border-[#1e2638] px-2 py-1 text-xs hover:bg-white/5"
        @click="lock"
      >
        Trancar
      </button>
    </header>

    <p v-if="state === null" class="text-[#747e8f]">lendo o cofre…</p>

    <p v-else-if="state === 'sem-chave'" data-testid="vault-missing-key" class="leading-relaxed text-amber-200">
      Falta a <code>DAILLY_SECRET_KEY</code> no <code>.env</code> do dailly. Gere com
      <code>openssl rand -base64 32</code>, ponha no <code>.env</code> e reinicie a API. Sem ela, o cofre só
      abre pela chave de recuperação.
    </p>

    <template v-else-if="recovery">
      <div data-testid="vault-recovery" class="flex flex-col gap-2">
        <p class="text-amber-200">
          Esta é a chave de recuperação, e ela não aparece de novo. Guarde no seu gerenciador de senhas: ela abre o
          cofre sem a senha e sem o <code>.env</code>.
        </p>
        <code class="select-all break-all rounded bg-black/40 px-2 py-1.5 font-mono text-xs">{{ recovery }}</code>
      </div>
      <button
        type="button"
        data-testid="vault-recovery-done"
        class="self-start rounded border border-[#1e2638] px-3 py-1.5 text-xs hover:bg-white/5"
        @click="recovery = null"
      >
        Guardei a chave
      </button>
    </template>

    <form v-else-if="state === 'nao-criado'" class="flex flex-col gap-2" @submit.prevent="create">
      <p class="text-[#747e8f]">Crie o cofre com uma senha (8 caracteres ou mais). Ela é pedida a cada sessão.</p>
      <input
        v-model="password"
        data-testid="vault-create-password"
        type="password"
        autocomplete="new-password"
        class="rounded border border-[#1e2638] bg-black/30 px-2 py-1.5"
      />
      <button
        type="submit"
        data-testid="vault-create"
        class="self-start rounded border border-[#1e2638] px-3 py-1.5 text-xs hover:bg-white/5"
        @click.prevent="create"
      >
        Criar cofre
      </button>
    </form>

    <form v-else-if="state === 'trancado'" class="flex flex-col gap-2" @submit.prevent="unlock">
      <input
        v-if="!useRecovery"
        v-model="password"
        data-testid="vault-unlock-password"
        type="password"
        autocomplete="current-password"
        placeholder="senha do cofre"
        class="rounded border border-[#1e2638] bg-black/30 px-2 py-1.5"
      />
      <input
        v-else
        v-model="recoveryInput"
        data-testid="vault-unlock-recovery"
        type="password"
        placeholder="chave de recuperação"
        class="rounded border border-[#1e2638] bg-black/30 px-2 py-1.5 font-mono"
      />
      <div class="flex gap-2">
        <button
          type="submit"
          data-testid="vault-unlock"
          class="rounded border border-[#1e2638] px-3 py-1.5 text-xs hover:bg-white/5"
          @click.prevent="unlock"
        >
          Abrir
        </button>
        <button
          type="button"
          data-testid="vault-use-recovery"
          class="text-xs text-[#747e8f] underline"
          @click="useRecovery = !useRecovery"
        >
          {{ useRecovery ? 'usar a senha' : 'usar a chave de recuperação' }}
        </button>
      </div>
    </form>

    <template v-if="state === 'aberto' && !recovery">
      <ul class="flex flex-col gap-1">
        <li
          v-for="secret in secrets"
          :key="`${secret.environment}/${secret.name}`"
          class="flex items-center gap-2"
          data-testid="secret"
        >
          <span data-testid="secret-name" class="font-mono text-xs">{{ secret.name }}</span>
          <span data-testid="secret-value" class="flex-1 truncate font-mono text-xs text-[#747e8f]">{{
            revealed[secret.name] ?? MASK
          }}</span>
          <button
            type="button"
            data-testid="secret-reveal"
            class="text-xs underline"
            :aria-label="`${secret.name in revealed ? 'Esconder' : 'Revelar'} ${secret.name}`"
            @click="toggle(secret.name)"
          >
            {{ secret.name in revealed ? 'esconder' : 'revelar' }}
          </button>
          <button
            type="button"
            data-testid="secret-copy"
            class="text-xs underline"
            :aria-label="`Copiar ${secret.name}`"
            @click="copy(secret.name)"
          >
            copiar
          </button>
          <button
            type="button"
            data-testid="secret-delete"
            class="text-xs text-red-300 underline"
            :aria-label="`Apagar ${secret.name}`"
            @click="remove(secret.name)"
          >
            apagar
          </button>
        </li>
      </ul>

      <form class="flex gap-2" @submit.prevent="add">
        <input
          v-model="newName"
          data-testid="secret-new-name"
          placeholder="nome (como em {{nome}})"
          class="w-40 rounded border border-[#1e2638] bg-black/30 px-2 py-1 font-mono text-xs"
        />
        <input
          v-model="newValue"
          data-testid="secret-new-value"
          type="password"
          autocomplete="off"
          placeholder="valor"
          class="flex-1 rounded border border-[#1e2638] bg-black/30 px-2 py-1 font-mono text-xs"
        />
        <button
          type="submit"
          data-testid="secret-add"
          class="rounded border border-[#1e2638] px-2 py-1 text-xs hover:bg-white/5"
          @click.prevent="add"
        >
          Gravar
        </button>
      </form>
    </template>

    <p v-if="error" role="alert" data-testid="vault-error" class="text-red-300">{{ error }}</p>
  </section>
</template>
