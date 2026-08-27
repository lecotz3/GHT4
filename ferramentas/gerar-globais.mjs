/* =============================================================================
 *  GHT4 · gera os scripts globais da raiz a partir de packages/domain
 * -----------------------------------------------------------------------------
 *  O problema que este script resolve, em uma frase: as regras precisam ser
 *  módulos ES de verdade (para o Node, os testes e o futuro backend importarem)
 *  E precisam continuar rodando por <script> em file:// (para o duplo-clique no
 *  index.html funcionar numa sala de reunião sem rede).
 *
 *  A saída é COMMITADA, como data-real.js e data-quimicos.js já são. Quem só
 *  quer ver a demonstração não roda nada.
 *
 *  A TRANSFORMAÇÃO
 *  Um módulo de domínio importa os irmãos assim:
 *
 *      import * as TAXONOMIA from './taxonomia.mjs';
 *
 *  e o gerado troca isso pelo global correspondente, resolvido na carga:
 *
 *      const TAXONOMIA = window.SETORES;
 *
 *  Por isso a ordem dos <script> no index.html importa, e por isso o manifesto
 *  abaixo é também a declaração dessa ordem.
 *
 *  O QUE NÃO É SUPORTADO, de propósito
 *  Import nomeado (`import { x } from`) e import default. Só namespace. Um
 *  namespace vira uma atribuição e pronto; import nomeado exigiria destructuring
 *  que quebraria em ciclo — e há um ciclo real entre scoring e configuração.
 *
 *  USO
 *    node ferramentas/gerar-globais.mjs             grava os globais
 *    node ferramentas/gerar-globais.mjs --conferir  só confere se estão em dia
 * ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFERIR = process.argv.includes('--conferir');

/* ---- manifesto ------------------------------------------------------------
 * `fonte` é o módulo de domínio; `destino` é o script global commitado na raiz;
 * `global` é o nome publicado em window. A ordem é a ordem de carga: um módulo
 * só pode depender de quem vem antes dele nesta lista.
 * -------------------------------------------------------------------------- */
export const MODULOS = [
  { fonte: 'packages/domain/taxonomia.mjs', destino: 'setores.js', global: 'SETORES' },
  { fonte: 'packages/domain/armazenamento.mjs', destino: 'armazenamento.js', global: 'ARMAZENAMENTO' },
  { fonte: 'packages/domain/evidencias.mjs', destino: 'evidencias.js', global: 'EVIDENCIA' },
  { fonte: 'packages/domain/conexoes.mjs', destino: 'conexoes.js', global: 'CONEXOES' },
  { fonte: 'packages/domain/scoring.mjs', destino: 'scoring.js', global: 'MOTOR' },
  { fonte: 'packages/domain/configuracao.mjs', destino: 'configuracao.js', global: 'CONFIGURACAO' },
  { fonte: 'packages/domain/mercado.mjs', destino: 'mercado.js', global: 'MERCADO' },
  { fonte: 'packages/domain/matchmaking.mjs', destino: 'matchmaking.js', global: 'MATCHMAKING' },
];

/** Módulo de domínio → nome do global, para reescrever os imports. */
const GLOBAL_POR_MODULO = new Map(
  MODULOS.map((m) => [path.basename(m.fonte), m.global]),
);

/**
 * Nomes publicados pelo módulo, já na forma que o objeto global usa.
 *
 * Um export pode renomear — `LIMITACOES_REDE as LIMITACOES` — e o objeto global
 * escreve isso ao contrário: `LIMITACOES: LIMITACOES_REDE`. A tradução mora
 * aqui para o resto do gerador não precisar saber disso.
 */
function nomesExportados(fonte, arquivo) {
  const bloco = fonte.match(/\nexport \{([\s\S]*?)\n\};/);
  if (!bloco) throw new Error(`${arquivo} não termina com um bloco \`export { ... };\``);
  return bloco[1]
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n) => {
      const renomeia = n.match(/^(\w+) as (\w+)$/);
      return renomeia ? `${renomeia[2]}: ${renomeia[1]}` : n;
    });
}

/** Troca `import * as X from './y.mjs'` por `const X = window.GLOBAL;` */
function reescreverImports(corpo, arquivo) {
  const naoSuportado = corpo.match(/^import\s+(?!\* as )[^\n]*$/m);
  if (naoSuportado) {
    throw new Error(
      `${arquivo}: só import de namespace é suportado no gerado.\n  achei: ${naoSuportado[0].trim()}`,
    );
  }

  return corpo.replace(
    /^import \* as (\w+) from '\.\/([\w.-]+)';$/gm,
    (linha, alias, modulo) => {
      const nomeGlobal = GLOBAL_POR_MODULO.get(modulo);
      if (!nomeGlobal) {
        throw new Error(`${arquivo}: importa ${modulo}, que não está no manifesto de gerar-globais.mjs`);
      }
      /* Ligação TARDIA, não `const X = window.Y`.
         O global pode ser publicado por um <script> posterior a este — é o caso
         do ciclo entre scoring e configuração, e o da v1, que carrega
         configuracao.js depois de scoring.js. Capturar na carga congelaria
         `undefined` e faria o recurso sumir em silêncio.
         Ler `window` na hora do acesso reproduz, no mundo dos scripts, o binding
         vivo que o ESM dá de graça. */
      return [
        `const ${alias} = /* ${modulo} */ new Proxy({}, {`,
        `  get: (_alvo, prop) => (window.${nomeGlobal} ? window.${nomeGlobal}[prop] : undefined),`,
        `  has: (_alvo, prop) => Boolean(window.${nomeGlobal}) && prop in window.${nomeGlobal},`,
        `});`,
      ].join('\n');
    },
  );
}

function gerar({ fonte: caminhoFonte, destino, global: nomeGlobal }) {
  const fonte = fs.readFileSync(path.join(RAIZ, caminhoFonte), 'utf8').replace(/\r\n/g, '\n');
  const nomes = nomesExportados(fonte, caminhoFonte);

  let corpo = fonte.replace(/\nexport \{[\s\S]*?\n\};\s*$/, '').replace(/\s+$/, '');
  corpo = reescreverImports(corpo, caminhoFonte);

  const cabecalho = [
    '/* =============================================================================',
    ` *  GHT4 · ARQUIVO GERADO. NÃO EDITAR.`,
    ' * -----------------------------------------------------------------------------',
    ` *  Fonte: ${caminhoFonte}`,
    ' *  Gerado por: node ferramentas/gerar-globais.mjs',
    ' *',
    ' *  Editar aqui é trabalho perdido: a próxima geração sobrescreve. Mexa na',
    ' *  fonte e rode o gerador. A CI confere que os dois estão em dia',
    ' *  (`node ferramentas/gerar-globais.mjs --conferir`).',
    ' *',
    ' *  Este arquivo existe para o index.html poder carregá-lo por <script> em',
    ' *  file://, onde módulo ES não funciona. O comentário original da fonte segue',
    ' *  abaixo, íntegro.',
    ' * ========================================================================== */',
    '',
  ].join('\n');

  /* Quebra a cada 4 nomes para o rodapé sair estável byte a byte. */
  const linhas = [];
  for (let i = 0; i < nomes.length; i += 4) {
    linhas.push('  ' + nomes.slice(i, i + 4).join(', ') + ',');
  }

  /* IIFE, e não código solto no escopo global.
     Os .js da raiz compartilham um escopo só: dois `const` de mesmo nome em
     arquivos diferentes derrubam a página inteira com SyntaxError, e já
     aconteceu neste projeto com LIMITACOES. Os módulos portados agravariam isso,
     porque vários declaram o mesmo alias de dependência (CONFIG aparece em
     scoring e em matchmaking).
     Fechar cada gerado numa função elimina a classe inteira do problema: só o
     `window.NOME` do rodapé atravessa. O 'use strict' iguala o comportamento ao
     do módulo ESM de origem, que já roda em modo estrito. */
  const abre = ['(function () {', "'use strict';", ''].join('\n');
  const fecha = [
    '',
    `window.${nomeGlobal} = {`,
    ...linhas,
    '};',
    '})();',
    '',
  ].join('\n');

  return cabecalho + abre + corpo + '\n' + fecha;
}

let divergiu = 0;

for (const modulo of MODULOS) {
  const gerado = gerar(modulo);
  const alvo = path.join(RAIZ, modulo.destino);

  if (CONFERIR) {
    const atual = fs.existsSync(alvo) ? fs.readFileSync(alvo, 'utf8').replace(/\r\n/g, '\n') : null;
    if (atual === gerado) {
      console.log(`  ✓ ${modulo.destino} está em dia com ${modulo.fonte}`);
    } else {
      console.error(`  ✗ ${modulo.destino} divergiu de ${modulo.fonte}`);
      divergiu++;
    }
    continue;
  }

  fs.writeFileSync(alvo, gerado, 'utf8');
  console.log(`  ✓ ${modulo.destino} gerado de ${modulo.fonte} (${gerado.split('\n').length} linhas)`);
}

if (CONFERIR && divergiu) {
  console.error(`\n  ${divergiu} arquivo(s) fora de dia. Rode: node ferramentas/gerar-globais.mjs\n`);
  process.exitCode = 1;
}
