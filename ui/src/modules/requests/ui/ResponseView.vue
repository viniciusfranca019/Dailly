<script setup lang="ts">
import type { ExecutedResponse } from '@shared'
import { computed } from 'vue'
import type { DecodedBody } from './decode.js'

/**
 * A resposta, embaixo do editor.
 *
 * Embaixo e não ao lado porque é onde a categoria inteira a põe, e porque o
 * corpo é o que mais cresce: uma linha longa de JSON cabe numa faixa larga e
 * não numa coluna estreita.
 */
const props = defineProps<{ response: ExecutedResponse; decoded: DecodedBody }>()

const tone = computed(() => {
  if (props.response.status >= 500) return 'text-red-300'
  if (props.response.status >= 400) return 'text-amber-300'
  return 'text-emerald-300'
})

/** Degraus até MB: 5 MB saindo como `5120.0 KB` é número que ninguém lê. */
const size = computed(() => {
  const bytes = props.response.bytes
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
})
</script>

<template>
  <!--
    `aria-live` porque a resposta chega sozinha, depois de um clique que já
    aconteceu: sem isto quem usa leitor de tela não fica sabendo que chegou.
  -->
  <section
    class="flex min-h-0 flex-col gap-2 border-t border-[#1e2638] pt-3"
    data-testid="response"
    aria-label="Resposta"
    aria-live="polite"
  >
    <div class="flex flex-wrap items-center gap-4 text-xs text-[#747e8f]">
      <span :class="tone" class="font-semibold" data-testid="response-status">
        {{ response.status }}
      </span>
      <span data-testid="response-time">{{ response.durationMs }} ms</span>
      <span data-testid="response-size">{{ size }}</span>
      <!--
        A marca só aparece quando é verdade, e cada uma diz uma coisa
        diferente: `truncated` é o teto, `timedOut` é o prazo estourado **no
        meio do corpo** — o que veio antes está aqui, e o resto não existe.
      -->
      <span v-if="response.truncated" data-testid="response-truncated" class="text-amber-300">
        cortado no teto — o alvo declarou
        {{ response.contentLength ?? 'um tamanho que não disse' }}
      </span>
      <span v-if="response.timedOut" data-testid="response-timed-out" class="text-amber-300">
        o prazo estourou no meio do corpo
      </span>
      <!--
        A marca **desta tela**, que é diferente da do servidor logo acima.

        O servidor corta o que chega pela rede; esta tela corta o que a
        expansão produz, e um corpo pode passar inteiro por lá e estourar aqui.
        Sem esta linha o `truncated` do decodificador existia no dado e não na
        tela: a pessoa lia um JSON que termina no meio, com 200 do lado, e nada
        dizendo por quê.

        A condição é `decoded.ceiling` e não `truncated && !response.truncated`:
        um gzip cortado pelo **prazo** também chega truncado sem a marca do
        servidor, e a versão anterior anunciava o teto de 16 MB sobre um corpo
        de 100 bytes. A causa é do decodificador dizer, não da view deduzir.
      -->
      <span
        v-if="decoded.kind === 'text' && decoded.ceiling"
        data-testid="body-truncated"
        class="text-amber-300"
      >
        cortado ao descomprimir — passou do teto desta tela
      </span>
    </div>

    <details class="text-xs">
      <summary class="cursor-pointer text-[#747e8f]">headers</summary>
      <dl class="mt-1 grid grid-cols-[auto_1fr] gap-x-3 font-mono" data-testid="response-headers">
        <!-- Lista só de leitura, nunca reordenada: o índice compõe a chave. -->
        <template v-for="(header, at) in response.headers" :key="`${header.name}:${at}`">
          <dt class="text-[#747e8f]">{{ header.name }}</dt>
          <dd class="min-w-0 break-all text-gray-300">{{ header.value }}</dd>
        </template>
      </dl>
    </details>

    <pre
      v-if="decoded.kind === 'text'"
      data-testid="response-body"
      class="min-h-0 flex-1 overflow-auto rounded bg-[#0a0d16] p-3 font-mono text-xs leading-relaxed text-gray-200"
      >{{ decoded.text }}</pre
    >

    <p
      v-else
      data-testid="response-opaque"
      class="rounded border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-200"
    >
      {{ decoded.reason }} — {{ decoded.bytes }} bytes recebidos.
    </p>
  </section>
</template>
