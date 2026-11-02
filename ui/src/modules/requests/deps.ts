import type { IdGenerator } from '@dailly/domain'
import type { RequestsPort, VaultPort } from '@shared'

/**
 * O que é só do Requests: a port da coleção e o gerador de ids.
 *
 * O id vem da raiz como o das entries vem (`uuidIds` em produção,
 * `sequentialIds` nos testes). Sortear aqui dentro deixava o teste dizer só que
 * a pasta ganhou *algum* id, nunca qual.
 */
export interface RequestsDeps {
  readonly requests: RequestsPort
  readonly ids: IdGenerator
  /** O cofre da ADR 0013: a tela pede a senha e revela sob clique. */
  readonly vault: VaultPort
}
