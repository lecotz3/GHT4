/* =============================================================================
 *  GHT4 · quadro societário das empresas do catálogo, em arquivo separado
 * -----------------------------------------------------------------------------
 *  Baixa APENAS os arquivos `Socios*.zip` da Receita e guarda o quadro societário
 *  das empresas que já estão no catálogo. Serve para a casa VER o volume e a cara
 *  do dado antes de decidir se quer nomes de pessoa física no produto.
 *
 *  POR QUE UM ARQUIVO SEPARADO
 *  Reimportar o cadastro inteiro com `INCLUIR_NOME_SOCIOS = true` significaria
 *  baixar ~5 GB e reescrever `data-quimicos.js`, que é o catálogo de produção.
 *  A decisão de LGPD ainda não foi tomada, e uma decisão pendente não deve exigir
 *  que o produto mude primeiro. Aqui os nomes ficam num arquivo próprio, fora do
 *  git, que se apaga com um `rm` quando a resposta for não.
 *
 *  MINIMIZAÇÃO, E NÃO SÓ SEPARAÇÃO
 *  Só descem os `Socios*.zip` (~centenas de MB, contra 3,5 GB de
 *  Estabelecimentos). Só ficam as linhas cuja raiz de CNPJ já está no catálogo.
 *  Só se guardam os quatro campos que o roster usa. A FAIXA ETÁRIA do sócio
 *  existe na fonte e é descartada aqui: o produto se proíbe de inferir sucessão
 *  pela idade dos sócios, e ter o campo à mão só criaria a tentação de segmentar
 *  pessoa por idade.
 *
 *  USO
 *    node ferramentas/dimensionar-quadro-societario.mjs
 *    node ferramentas/dimensionar-quadro-societario.mjs --mes=2026-08 --cache
 *    node ferramentas/dimensionar-quadro-societario.mjs --saida=/outro/caminho.js
 *
 *  Com --cache os .zip ficam em ferramentas/.cache-cnpj (fora do git) e uma
 *  repetição não baixa de novo o que já desceu. Cada parte é tentada até quatro
 *  vezes antes de desistir: queda de rede no meio de 300 MB é ocorrência comum,
 *  não motivo para recomeçar do zero.
 *
 *  Depois, para o ensaio:
 *    node ferramentas/importar-quadro-societario.mjs --arquivo=<saida> --ensaio
 * ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { linhasDoZip, campos, nomeBonito, iso, mesesDisponiveis, encerrar } from './importar-cnpj.mjs';
import { lerFonteCatalogo } from '../server/src/agente/catalogo.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const opt = (nome) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.split('=').slice(1).join('=');

const CATALOGO = opt('catalogo') ?? path.join(RAIZ, 'data-quimicos.js');
const PARTES = Number(opt('partes') ?? 10);
const TENTATIVAS = Number(opt('tentativas') ?? 4);

async function principal() {
  console.log('\nGHT4 · quadro societário das empresas do catálogo\n');

  const { colunas, linhas, referencia } = lerFonteCatalogo(await readFile(CATALOGO, 'utf8'));
  const iNome = colunas.indexOf('nome'), iRazao = colunas.indexOf('razaoSocial'), iRaiz = colunas.indexOf('cnpjRaiz');
  const porRaiz = new Map(linhas.map((l) => [l[iRaiz], { id: `cnpj${l[iRaiz]}`, nome: l[iNome], razaoSocial: l[iRazao] }]));

  const meses = await mesesDisponiveis();
  const MES = opt('mes') || meses.at(-1);
  if (!meses.includes(MES)) throw new Error(`Mês ${MES} não está no repositório da RFB. Disponíveis: ${meses.at(0)} a ${meses.at(-1)}.`);
  const SAIDA = opt('saida') ?? path.join(RAIZ, '.cache', `quadro-societario-${MES}.js`);

  console.log(`  catálogo ....... ${path.relative(RAIZ, CATALOGO)} · referência ${referencia}`);
  console.log(`  empresas ....... ${porRaiz.size.toLocaleString('pt-BR')}`);
  console.log(`  quadro de ...... ${MES} (apenas Socios*.zip)\n`);

  const quadro = new Map();
  let lidas = 0, doCatalogo = 0;

  /* Uma parte de cada vez, e cada parte acumula à parte antes de entrar no
     resultado. Sem isso, uma queda de rede no meio do arquivo deixaria metade
     dos sócios daquela parte já contabilizados, e a repetição os contaria de
     novo — silenciosamente, porque o total só seria conferido no fim. */
  for (let i = 0; i < PARTES; i++) {
    const arquivo = `Socios${i}.zip`;
    for (let tentativa = 1; ; tentativa++) {
      const parcial = new Map();
      let lidasNaParte = 0, doCatalogoNaParte = 0;
      try {
        for await (const l of linhasDoZip(MES, arquivo)) {
          lidasNaParte++;
          const f = campos(l);
          if (!porRaiz.has(f[0])) continue;
          doCatalogoNaParte++;
          const lista = parcial.get(f[0]) ?? [];
          /* Quatro campos, e só. Faixa etária (f[10]) e o CPF mascarado (f[3])
             ficam para trás de propósito: nenhum dos dois serve ao roster. */
          lista.push({
            tipo: f[1] === '1' ? 'juridica' : f[1] === '2' ? 'fisica' : 'estrangeiro',
            nome: nomeBonito(f[2]),
            qualificacao: f[4],
            entrada: iso(f[5]),
          });
          parcial.set(f[0], lista);
        }
      } catch (erro) {
        if (tentativa >= TENTATIVAS) {
          throw new Error(`${arquivo} falhou ${TENTATIVAS} vezes (${erro.message}). `
            + 'Rode de novo com --cache: as partes já baixadas não descem outra vez.');
        }
        const espera = tentativa * 5;
        console.log(`  ! ${arquivo}: ${erro.message} — tentativa ${tentativa + 1} de ${TENTATIVAS} em ${espera}s`);
        await new Promise((r) => setTimeout(r, espera * 1000));
        continue;
      }
      for (const [raiz, socios] of parcial) quadro.set(raiz, [...(quadro.get(raiz) ?? []), ...socios]);
      lidas += lidasNaParte;
      doCatalogo += doCatalogoNaParte;
      break;
    }
  }

  const saidaColunas = ['id', 'cnpjRaiz', 'nome', 'razaoSocial', 'socios'];
  const saidaLinhas = [...quadro.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([raiz, socios]) => {
      const e = porRaiz.get(raiz);
      return [e.id, raiz, e.nome, e.razaoSocial, socios];
    });

  const pf = saidaLinhas.flatMap((l) => l[4]).filter((s) => s.tipo === 'fisica').length;
  console.log('');
  console.log(`  linhas lidas no arquivo de sócios ... ${lidas.toLocaleString('pt-BR')}`);
  console.log(`  do catálogo ........................ ${doCatalogo.toLocaleString('pt-BR')}`);
  console.log(`  empresas com quadro ................ ${saidaLinhas.length.toLocaleString('pt-BR')} de ${porRaiz.size.toLocaleString('pt-BR')}`);
  console.log(`  pessoas físicas no quadro .......... ${pf.toLocaleString('pt-BR')}`);

  const cabecalho = `/* =============================================================================
 *  GHT4 · QUADRO SOCIETÁRIO — GERADO, NÃO VERSIONADO, NÃO EDITAR.
 * -----------------------------------------------------------------------------
 *  Fonte: dados abertos do CNPJ (Socios), Receita Federal — referência ${MES}.
 *  Gerado por: node ferramentas/dimensionar-quadro-societario.mjs
 *
 *  CONTÉM NOME DE PESSOA FÍSICA. Este arquivo existe para dimensionar a decisão
 *  de LGPD descrita em ferramentas/importar-cnpj.mjs, não para ser distribuído.
 *  Fica fora do git por isso. Se a decisão da casa for não, apague-o.
 * ========================================================================== */
`;
  const corpo = `const COLUNAS_QUIMICOS = ${JSON.stringify(saidaColunas)};\n`
    + `const LINHAS_QUIMICOS = [\n${saidaLinhas.map((l) => JSON.stringify(l)).join(',\n')}\n];\n`
    + `const REFERENCIA_QUIMICOS = ${JSON.stringify(MES)};\n`;

  fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
  fs.writeFileSync(SAIDA, cabecalho + corpo, 'utf8');
  console.log(`\n  gravado: ${path.relative(RAIZ, SAIDA)} (${(fs.statSync(SAIDA).size / 1048576).toFixed(1)} MB)`);
  console.log('  fora do git, e apagável com um rm.\n');
  console.log('  para o ensaio:');
  console.log(`    node ferramentas/importar-quadro-societario.mjs --arquivo="${path.relative(RAIZ, SAIDA)}" --ensaio\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await principal();
  } catch (erro) {
    console.error(`\n  ERRO: ${erro.message}\n`);
    process.exitCode = 1;
  } finally {
    await encerrar();
  }
}
