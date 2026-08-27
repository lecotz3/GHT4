/* =============================================================================
 *  GHT4 · porta de persistência local
 * -----------------------------------------------------------------------------
 *  As camadas de configuração e de rede guardam estado — templates de scoring,
 *  membros da rede — e até aqui iam direto em `window.localStorage`, dentro de
 *  um try/catch que caía para memória quando o navegador bloqueava.
 *
 *  Isso tinha dois problemas. Fora do navegador (Node, testes, o backend que a
 *  Fase 2 traz) `window` nem existe, e o try/catch passava a servir de fluxo de
 *  controle para um ReferenceError — funciona, mas esconde a intenção. E não
 *  havia um lugar só para trocar quando a persistência saísse do navegador.
 *
 *  Este módulo é esse lugar. Devolve algo com a forma de `localStorage`: o de
 *  verdade quando há um, memória quando não há. Quem chama não muda.
 *
 *  A FASE 2 TROCA AQUI
 *  Quando templates, rede e CRM virarem API, é a implementação de `local()` que
 *  muda — e o dado deixa de morrer no navegador de uma pessoa, que é o que
 *  hoje impede o time de compartilhar régua de triagem.
 *
 *  O QUE ESTE MÓDULO NÃO RESOLVE
 *  Memória é por processo, não por usuário. Ele não é multiusuário e não
 *  pretende ser — é um seam, não uma solução de persistência.
 * ========================================================================== */

const memoria = new Map();

/** Mesma superfície de localStorage, guardando em memória. */
const emMemoria = {
  getItem: (chave) => (memoria.has(chave) ? memoria.get(chave) : null),
  setItem: (chave, valor) => void memoria.set(chave, String(valor)),
  removeItem: (chave) => void memoria.delete(chave),
  clear: () => void memoria.clear(),
  key: (i) => [...memoria.keys()][i] ?? null,
  get length() { return memoria.size; },
};

/**
 * O depósito disponível agora.
 *
 * Devolve o `localStorage` do navegador quando existe e responde; memória em
 * qualquer outro caso — Node, sessão em file:// com armazenamento bloqueado,
 * janela anônima com cota zero.
 *
 * A sondagem é feita a cada chamada de propósito: o navegador pode revogar o
 * acesso no meio da sessão, e guardar a referência esconderia isso.
 */
function local() {
  try {
    const deposito = globalThis.localStorage;
    if (deposito && typeof deposito.getItem === 'function') return deposito;
  } catch {
    /* Alguns navegadores lançam só de tocar na propriedade quando o usuário
       bloqueia dados do site. Cair para memória é a resposta certa. */
  }
  return emMemoria;
}

/** Há persistência de verdade, ou o que for gravado morre com o processo? */
function ehPersistente() {
  return local() !== emMemoria;
}

/** Zera o depósito em memória. Serve aos testes, para não vazarem estado. */
function limparMemoria() {
  memoria.clear();
}

export {
  local, ehPersistente, limparMemoria,
};
