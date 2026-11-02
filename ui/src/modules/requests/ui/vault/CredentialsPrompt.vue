<script setup lang="ts">
import type { CredentialChoice, FoundCredential } from '@dailly/requests-core/http'
import type { VaultPort, VaultState } from '@shared'
import { computed, onMounted, ref } from 'vue'
import { stashCredentials } from '../../model/credentials.js'

/**
 * O form que um curl com credencial abre antes de entrar no editor (passo 10).
 *
 * Cada credencial ganha um nome; confirmar abre o cofre se precisar, grava os
 * valores lá e devolve os nomes. Quem troca o valor por `{{nome}}` é a tela —
 * aqui o valor só passa, mascarado, a caminho do cofre.
 *
 * Não há "salvar em claro": sem `DAILLY_SECRET_KEY` ou sem cofre, a única saída
 * é cancelar. Gravar a chave no SQLite é o que este form existe para impedir.
 */
const props = defineProps<{ vault: VaultPort; credentials: readonly FoundCredential[] }>()
const emit = defineEmits<{ confirm: [choices: CredentialChoice[]]; cancel: [] }>()

const ENVIRONMENT = 'default'
const MASK = '••••••••'

const state = ref<VaultState | null>(null)
const names = ref(props.credentials.map((credential) => credential.suggested))
const password = ref('')
const recovery = ref('')
const useRecovery = ref(false)
const error = ref<string | null>(null)
const busy = ref(false)

const blocked = computed(() => state.value === 'sem-chave' || state.value === 'so-recuperacao')
const canConfirm = computed(() => state.value === 'aberto' || state.value === 'trancado')

onMounted(async () => {
  try {
    state.value = await props.vault.status()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'não consegui ler o cofre'
  }
})

async function confirm(): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = null
  try {
    if (state.value === 'trancado') {
      if (useRecovery.value) await props.vault.unlockWithRecovery(recovery.value)
      else await props.vault.unlock(password.value)
      password.value = ''
      recovery.value = ''
      state.value = 'aberto'
    }
    const picks = props.credentials.map((credential, index) => ({
      name: (names.value[index] ?? '').trim(),
      value: credential.value,
    }))
    await stashCredentials(props.vault, ENVIRONMENT, picks)
    emit(
      'confirm',
      props.credentials.map((credential, index) => ({ id: credential.id, name: picks[index]!.name })),
    )
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'não consegui gravar no cofre'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form
    data-testid="credentials-prompt"
    aria-labelledby="credentials-title"
    class="flex flex-col gap-3 rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-gray-200"
    @submit.prevent="confirm"
  >
    <h2 id="credentials-title" class="text-sm text-amber-200">
      Este curl traz {{ credentials.length === 1 ? 'uma credencial' : `${credentials.length} credenciais` }}. Elas
      vão para o cofre, e a request fica com <code v-pre>{{nome}}</code>.
    </h2>

    <p v-if="state === null" class="text-[#747e8f]">lendo o cofre…</p>

    <p v-else-if="blocked" class="leading-relaxed text-amber-200">
      Falta a <code>DAILLY_SECRET_KEY</code> no <code>.env</code> do dailly, e sem ela o cofre não grava. Gere com
      <code>openssl rand -base64 32</code>, ponha no <code>.env</code>, reinicie a API e cole o curl de novo.
    </p>

    <p v-else-if="state === 'nao-criado'" class="leading-relaxed text-amber-200">
      O cofre ainda não foi criado. Crie-o no painel Cofre e cole o curl de novo.
    </p>

    <ul v-if="canConfirm" class="flex flex-col gap-1">
      <li
        v-for="(credential, index) in credentials"
        :key="credential.id"
        data-testid="credential"
        class="flex items-center gap-2"
      >
        <span data-testid="credential-label" class="w-40 truncate font-mono text-xs">{{ credential.label }}</span>
        <span data-testid="credential-value" class="w-20 font-mono text-xs text-[#747e8f]">{{ MASK }}</span>
        <input
          v-model="names[index]"
          data-testid="credential-name"
          :aria-label="`Nome no cofre para ${credential.label}`"
          class="flex-1 rounded border border-[#1e2638] bg-black/30 px-2 py-1 font-mono text-xs"
        />
      </li>
    </ul>

    <template v-if="state === 'trancado'">
      <input
        v-if="!useRecovery"
        v-model="password"
        data-testid="credentials-password"
        aria-label="Senha do cofre"
        type="password"
        autocomplete="current-password"
        placeholder="senha do cofre"
        class="rounded border border-[#1e2638] bg-black/30 px-2 py-1.5"
      />
      <input
        v-else
        v-model="recovery"
        data-testid="credentials-recovery"
        aria-label="Chave de recuperação"
        type="password"
        placeholder="chave de recuperação"
        class="rounded border border-[#1e2638] bg-black/30 px-2 py-1.5 font-mono"
      />
      <button
        type="button"
        data-testid="credentials-use-recovery"
        class="self-start text-xs text-[#747e8f] underline"
        @click="useRecovery = !useRecovery"
      >
        {{ useRecovery ? 'usar a senha' : 'usar a chave de recuperação' }}
      </button>
    </template>

    <div class="flex gap-2">
      <button
        v-if="canConfirm"
        type="submit"
        data-testid="credentials-confirm"
        :disabled="busy"
        class="rounded border border-[#1e2638] px-3 py-1.5 text-xs hover:bg-white/5"
        @click.prevent="confirm"
      >
        Guardar no cofre e importar
      </button>
      <button
        type="button"
        data-testid="credentials-cancel"
        class="rounded border border-[#1e2638] px-3 py-1.5 text-xs hover:bg-white/5"
        @click="emit('cancel')"
      >
        Cancelar
      </button>
    </div>

    <p v-if="error" role="alert" data-testid="credentials-error" class="text-red-300">{{ error }}</p>
  </form>
</template>
