/**
 * Requests — superfície pública do módulo.
 *
 * O módulo *é* o componente (ADR 0010, Emenda 2). O modelo que ele manipula
 * mora em `@dailly/requests-core` e a execução mora no servidor
 * ([ADR 0011](../../../../docs/adrs/0011-requests-modulo-e-execucao.md)) — o
 * que sobra aqui é a tela, que é exatamente o que deveria sobrar.
 */
export { default as component } from './ui/Requests.vue'
