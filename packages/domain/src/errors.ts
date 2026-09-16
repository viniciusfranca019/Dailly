/**
 * Domain errors: the refusals the domain itself makes, named so a caller can
 * branch on them without matching on message text.
 */

/** Thrown when a body is empty once normalized. The mvp calls this "corpo obrigatório". */
export class EmptyBodyError extends Error {
  override readonly name = 'EmptyBodyError'
  constructor() {
    super('o corpo da entrada é obrigatório')
  }
}

/**
 * A port method that Phase 1 does not implement yet.
 *
 * Explicit and thrown, rather than a `TODO` comment or a silent no-op: the port
 * is declared whole (ADR 0002), and the parts the roadmap puts in Phase 2 say
 * so out loud the moment anyone calls them.
 */
export class NotImplementedError extends Error {
  override readonly name = 'NotImplementedError'
  constructor(what: string) {
    super(`${what} chega na Fase 2 do roadmap`)
  }
}
