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
  { fonte: 'packages/domain/mercado.mjs', destino: 'mercado.js', global: 'MERCADO' },
];

/** Módulo de domínio → nome do global, para reescrever os imports. */
const GLOBAL_POR_MODULO = new Map(
  MODULOS.map((m) => [path.basename(m.fonte), m.global]),
);

function nomesExportados(fonte, arquivo) {
  const bloco = fonte.match(/\nexport \{([\s\S]*?)\n\};/);
  if (!bloco) throw new Error(`${arquivo} não termina com um bloco \`export { ... };\``);
  return bloco[1].split(',').map((n) => n.trim()).filter(Boolean);
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
      return `const ${alias} = window.${nomeGlobal};`;
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
  const rodape = ['', `window.${nomeGlobal} = {`, ...linhas, '};', ''].join('\n');

  return cabecalho + corpo + '\n' + rodape;
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
