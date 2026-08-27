/* =============================================================================
 *  GHT4 · gera setores.js a partir de packages/domain/taxonomia.mjs
 * -----------------------------------------------------------------------------
 *  A taxonomia precisa existir em dois formatos por um motivo concreto: o
 *  navegador bloqueia módulo ES em file://, e é o duplo-clique no index.html que
 *  faz a demonstração rodar numa sala de reunião sem rede. O importador de CNPJ,
 *  do outro lado, é Node e quer `import` normal.
 *
 *  Antes isso era duas cópias mantidas à mão, com um verificador tentando
 *  impedir que divergissem. Agora há uma fonte só — o módulo — e este script
 *  produz o script global a partir dela. O resultado é COMMITADO, como
 *  data-real.js e data-quimicos.js já são: quem só quer ver a demo não precisa
 *  rodar nada.
 *
 *  USO
 *    node ferramentas/gerar-setores.mjs            grava setores.js
 *    node ferramentas/gerar-setores.mjs --conferir  só confere se está atualizado
 *
 *  O modo --conferir sai com código 1 se o gerado divergir da fonte. É ele que
 *  roda na CI, para ninguém editar setores.js à mão sem perceber.
 * ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FONTE = path.join(RAIZ, 'packages', 'domain', 'taxonomia.mjs');
const DESTINO = path.join(RAIZ, 'setores.js');
const CONFERIR = process.argv.includes('--conferir');

/* A lista de nomes publicados vem do próprio `export` da fonte: se alguém
   exportar algo novo lá, aparece em window.SETORES sem editar este script. */
function nomesExportados(fonte) {
  const bloco = fonte.match(/\nexport \{([\s\S]*?)\n\};/);
  if (!bloco) throw new Error('taxonomia.mjs não termina com um bloco `export { ... };`');
  return bloco[1]
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
}

function gerar() {
  const fonte = fs.readFileSync(FONTE, 'utf8');
  const nomes = nomesExportados(fonte);

  /* Tira o bloco de export: no navegador ele seria erro de sintaxe. */
  const corpo = fonte.replace(/\nexport \{[\s\S]*?\n\};\s*$/, '').replace(/\s+$/, '');

  const cabecalho = [
    '/* =============================================================================',
    ' *  GHT4 · TAXONOMIA DO SETOR FOCO — ARQUIVO GERADO. NÃO EDITAR.',
    ' * -----------------------------------------------------------------------------',
    ' *  Fonte: packages/domain/taxonomia.mjs',
    ' *  Gerado por: node ferramentas/gerar-setores.mjs',
    ' *',
    ' *  Editar aqui é trabalho perdido: a próxima geração sobrescreve. Mexa na',
    ' *  fonte e rode o gerador. A CI confere que os dois estão em dia',
    ' *  (`node ferramentas/gerar-setores.mjs --conferir`).',
    ' *',
    ' *  Este arquivo existe para o index.html poder carregá-lo por <script> em',
    ' *  file://, onde módulo ES não funciona. O comentário original da fonte segue',
    ' *  abaixo, íntegro.',
    ' * ========================================================================== */',
    '',
  ].join('\n');

  /* Indentação de dois espaços e quebra a cada 4 nomes, para o rodapé sair
     estável byte a byte entre gerações. */
  const linhas = [];
  for (let i = 0; i < nomes.length; i += 4) {
    linhas.push('  ' + nomes.slice(i, i + 4).join(', ') + ',');
  }
  const rodape = ['', 'window.SETORES = {', ...linhas, '};', ''].join('\n');

  return cabecalho + corpo + '\n' + rodape;
}

const gerado = gerar();

if (CONFERIR) {
  const atual = fs.existsSync(DESTINO) ? fs.readFileSync(DESTINO, 'utf8') : null;
  if (atual === gerado) {
    console.log('✓ setores.js está em dia com packages/domain/taxonomia.mjs');
    process.exit(0);
  }
  console.error('✗ setores.js divergiu da fonte packages/domain/taxonomia.mjs');
  console.error('  rode: node ferramentas/gerar-setores.mjs');
  process.exit(1);
}

fs.writeFileSync(DESTINO, gerado, 'utf8');
console.log(`✓ setores.js gerado a partir de packages/domain/taxonomia.mjs (${gerado.split('\n').length} linhas)`);
