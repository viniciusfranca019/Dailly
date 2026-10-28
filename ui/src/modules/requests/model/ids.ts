/**
 * O identificador de uma pasta ou request nova.
 *
 * Mora aqui e não vem pelas `deps` porque o contrato que as carrega está
 * prestes a ser partido — acrescentar um campo nele agora seria engordar
 * justamente o que a próxima feature vai dividir. Quando `ModuleDeps` virar
 * "o que é de todo módulo" mais "o que é deste", este arquivo some e o id
 * chega pela raiz de composição, como o `uuidIds` das entries já chega.
 */
export const newId = (): string => globalThis.crypto.randomUUID()
