import type { SharedDeps } from '@shared'
import type { DailyLogDeps } from '@modules/daily-log'
import type { RequestsDeps } from '@modules/requests'

/**
 * O mapa id de módulo → o que é só dele, e por que é um tipo e não um schema.
 *
 * Quem monta isto é a raiz de composição, que é TypeScript e passa pelo
 * `tsc --noEmit`. Esquecer um módulo, ou entregar a forma errada, é erro de
 * compilação no `main.ts` — com assinatura conferida, que é o que uma
 * validação em execução (zod) não daria para funções. E é `import type`: some
 * na compilação, então um módulo desligado por flag não volta ao bundle por
 * causa deste arquivo.
 *
 * Módulo sem dependência própria (o Analyse) não entra: recebe só o comum.
 */
export interface OwnDeps {
  readonly 'daily-log': DailyLogDeps
  readonly requests: RequestsDeps
}

/** O que a raiz de composição entrega ao shell: a metade comum e a de cada um. */
export interface ShellDeps {
  readonly shared: SharedDeps
  readonly own: OwnDeps
}

/**
 * As deps de um módulo: o comum mais o seu, e nada do vizinho.
 *
 * Um objeto por id, guardado, para que o prop que o módulo recebe não mude de
 * identidade a cada render do shell.
 */
export const depsFor = (deps: ShellDeps) => {
  const own = deps.own as unknown as Readonly<Record<string, object | undefined>>
  const built = new Map<string, SharedDeps>()
  return (id: string): SharedDeps => {
    let found = built.get(id)
    if (!found) {
      found = { ...deps.shared, ...own[id] }
      built.set(id, found)
    }
    return found
  }
}
