/**
 * The error class ADR 0007 warned about when it put HTTP in the middle:
 *
 *   "O que era chamada de função vira HTTP. A latência em localhost é
 *    irrelevante; a classe de erro não é, e a UI precisa tratá-la."
 *
 * Named here so a screen can tell "the server said no" from "the server is not
 * there", which are different things to show a person.
 */

/** The server answered, and the answer was a refusal. */
export class ApiError extends Error {
  override readonly name = 'ApiError'
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
  }
}

/** Nobody answered. In this app that usually means the local API is not up yet. */
export class ApiUnreachableError extends Error {
  override readonly name = 'ApiUnreachableError'
  constructor(override readonly cause: unknown) {
    super('não consegui falar com a API local')
  }
}
