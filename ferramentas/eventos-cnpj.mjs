/* =============================================================================
 *  GHT4 · EVENTOS SOCIETÁRIOS POR DIFERENÇA ENTRE DOIS MESES DO CNPJ
 * -----------------------------------------------------------------------------
 *  O QUE ESTE ARQUIVO DESMENTE
 *  O README do projeto registra, como limitação estrutural, que "dado público
 *  brasileiro publica NÚMEROS, não EVENTOS" — e que rodada de investimento,
 *  mudança de controle e expansão geográfica não existiriam em fonte aberta.
 *  Isso é verdade para a CVM. É falso para o CNPJ, e a diferença vale o projeto
 *  inteiro: os sinais que mais pesam no motor de scoring são justamente os de
 *  evento, e eram justamente os que estavam sem lastro.
 *
 *  O cadastro do CNPJ é republicado inteiro TODO MÊS, e a Receita mantém os
 *  meses anteriores no repositório — havia 40 meses publicados na última
 *  verificação, de 2023-05 em diante. Comparar dois meses transforma um cadastro
 *  estático num registro de acontecimentos, com data e documento público atrás.
 *  E, como o histórico já está lá, dá para reconstruir três anos de eventos hoje,
 *  sem esperar coleta.
 *
 *  O QUE A DIFERENÇA REVELA
 *    troca de sócios          -> mudança de controle
 *    troca TOTAL de sócios    -> aquisição consumada
 *    entrada de sócio PJ      -> entrada de fundo ou de grupo
 *    entrada de sócio no exterior -> comprador estrangeiro chegou
 *    salto de capital social  -> aporte
 *    filial em UF nova        -> expansão geográfica
 *    baixa / mudança de situação -> encerramento, cisão, incorporação
 *
 *  O QUE ELA NÃO REVELA, E PRECISA FICAR ESCRITO
 *  O VALOR da transação, e a INTENÇÃO. Saída de sócio pode ser venda, herança,
 *  briga de família ou reorganização fiscal. O sistema afirma o fato — "o quadro
 *  societário mudou em 14/03/2026, dois sócios saíram e uma PJ entrou" — e nomeia
 *  a ambiguidade. Interpretar é trabalho de gente, como o resto do produto.
 *
 *  USO
 *    node ferramentas/importar-cnpj.mjs --mes=2026-02 --arquivar
 *    node ferramentas/importar-cnpj.mjs --mes=2026-08 --arquivar
 *    node ferramentas/eventos-cnpj.mjs                  # compara os dois extremos
 *    node ferramentas/eventos-cnpj.mjs --de=2026-02 --ate=2026-08
 * ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HISTORICO = path.join(RAIZ, 'ferramentas', 'historico-cnpj');
const SAIDA = path.join(RAIZ, 'data-eventos.js');

/* Salto de capital social que conta como aporte. Abaixo disso costuma ser
   correção de capital ou integralização de rotina, não entrada de dinheiro
   novo — e sinal que dispara à toa é pior que sinal ausente. */
const SALTO_CAPITAL = 1.5;      // 50% de aumento
const CAPITAL_MINIMO = 500000;  // e pelo menos meio milhão de reais

const args = process.argv.slice(2);
const opt = (n) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };

if (!fs.existsSync(HISTORICO)) {
  console.error('\n  Não há snapshots arquivados. Rode primeiro:');
  console.error('    node ferramentas/importar-cnpj.mjs --mes=AAAA-MM --arquivar\n');
  process.exitCode = 1;
} else {
  const disponiveis = fs.readdirSync(HISTORICO)
    .map((f) => (f.match(/^quimicos-(\d{4}-\d{2})\.json$/) || [])[1])
    .filter(Boolean).sort();

  if (disponiveis.length < 2) {
    console.error(`\n  Só há ${disponiveis.length} snapshot(s): ${disponiveis.join(', ') || 'nenhum'}.`);
    console.error('  São necessários dois meses para calcular diferença.\n');
    process.exitCode = 1;
  } else {
    const DE  = opt('de')  || disponiveis[0];
    const ATE = opt('ate') || disponiveis[disponiveis.length - 1];
    if (!disponiveis.includes(DE) || !disponiveis.includes(ATE)) {
      console.error(`\n  Snapshots disponíveis: ${disponiveis.join(', ')}\n`);
      process.exitCode = 1;
    } else {
      comparar(DE, ATE);
    }
  }
}

function comparar(DE, ATE) {
  console.log(`\nGHT4 · eventos societários no setor químico  ${DE} → ${ATE}\n`);

  const antes = indexar(DE);
  const depois = indexar(ATE);
  console.log(`  ${DE}: ${antes.size.toLocaleString('pt-BR')} empresas`);
  console.log(`  ${ATE}: ${depois.size.toLocaleString('pt-BR')} empresas\n`);

  const eventos = [];

  for (const [base, b] of depois) {
    const a = antes.get(base);

    if (!a) {
      /* Empresa nova no recorte. Pode ser CNPJ novo ou mudança de CNAE — e a
         segunda é interessante: empresa que passou a se declarar química. */
      eventos.push({
        base, nome: b.nome, subsetor: b.subsetor, uf: b.uf,
        tipo: 'entrada_no_escopo',
        rotulo: 'Passou a constar no escopo químico',
        detalhe: 'CNPJ novo no recorte entre os dois meses: abertura recente ou mudança de CNAE principal.',
        sinal: null,
        ambiguidade: 'Não distingue empresa nova de empresa que trocou de CNAE. Conferir data de abertura.',
      });
      continue;
    }

    /* ---- quadro societário ---- */
    if (a.qtdSocios !== b.qtdSocios || a.qtdSociosPj !== b.qtdSociosPj) {
      const trocaTotal = a.qtdSocios > 0 && b.qtdSocios > 0
        && a.qtdSociosPj !== b.qtdSociosPj && b.qtdSociosPj > 0 && a.qtdSociosPj === 0;
      eventos.push({
        base, nome: b.nome, subsetor: b.subsetor, uf: b.uf,
        tipo: trocaTotal ? 'aquisicao_provavel' : 'mudanca_quadro_societario',
        rotulo: trocaTotal
          ? 'Pessoa jurídica assumiu o quadro societário'
          : 'Quadro societário mudou',
        detalhe: `Sócios: ${a.qtdSocios} → ${b.qtdSocios}`
               + (a.qtdSociosPj !== b.qtdSociosPj ? ` · sócios PJ: ${a.qtdSociosPj} → ${b.qtdSociosPj}` : ''),
        sinal: 'mudancaControle',
        ambiguidade: 'Entrada ou saída de sócio pode ser venda, sucessão, reorganização fiscal ou briga societária. O registro afirma a mudança, não o motivo.',
      });
    }

    /* ---- capital estrangeiro ---- */
    if (!a.socioEstrangeiro && b.socioEstrangeiro) {
      eventos.push({
        base, nome: b.nome, subsetor: b.subsetor, uf: b.uf,
        tipo: 'entrada_capital_estrangeiro',
        rotulo: 'Sócio no exterior entrou no quadro',
        detalhe: 'Passou a constar sócio com país diferente do Brasil.',
        sinal: 'mudancaControle',
        ambiguidade: 'Costuma indicar comprador estratégico estrangeiro — e costuma aparecer aqui antes de sair na imprensa. Confirmar antes de tratar como transação fechada.',
      });
    }

    /* ---- capital social ---- */
    if (a.capitalSocial > 0 && b.capitalSocial >= CAPITAL_MINIMO
        && b.capitalSocial / a.capitalSocial >= SALTO_CAPITAL) {
      eventos.push({
        base, nome: b.nome, subsetor: b.subsetor, uf: b.uf,
        tipo: 'aumento_de_capital',
        rotulo: 'Capital social aumentou de forma relevante',
        detalhe: `R$ ${(a.capitalSocial / 1e6).toFixed(1)} mi → R$ ${(b.capitalSocial / 1e6).toFixed(1)} mi `
               + `(${((b.capitalSocial / a.capitalSocial - 1) * 100).toFixed(0)}%)`,
        sinal: 'rodadaRecente',
        ambiguidade: 'Aumento de capital pode ser dinheiro novo, capitalização de lucros ou de dívida de sócio. Só o instrumento na junta comercial diz qual.',
      });
    }

    /* ---- expansão geográfica ---- */
    const ufsNovas = b.ufs.filter((u) => !a.ufs.includes(u));
    if (ufsNovas.length) {
      eventos.push({
        base, nome: b.nome, subsetor: b.subsetor, uf: b.uf,
        tipo: 'expansao_geografica',
        rotulo: 'Abriu operação em UF nova',
        detalhe: `Entrou em ${ufsNovas.join(', ')} (antes: ${a.ufs.join(', ') || '—'})`,
        sinal: 'expansaoGeografica',
        ambiguidade: 'Estabelecimento novo pode ser operação de verdade ou endereço administrativo. Conferir o CNAE do estabelecimento.',
      });
    }

    /* ---- situação cadastral ---- */
    if (a.situacao === '02' && b.situacao !== '02') {
      eventos.push({
        base, nome: b.nome, subsetor: b.subsetor, uf: b.uf,
        tipo: 'saiu_de_ativa',
        rotulo: 'Deixou a situação ATIVA',
        detalhe: `Situação cadastral ${a.situacao} → ${b.situacao}`,
        sinal: null,
        ambiguidade: 'Baixa pode ser encerramento, incorporação pelo comprador ou cisão. Incorporação é transação consumada; encerramento não é.',
      });
    }
  }

  /* Sumiu do recorte entre um mês e outro. */
  for (const [base, a] of antes) {
    if (depois.has(base)) continue;
    eventos.push({
      base, nome: a.nome, subsetor: a.subsetor, uf: a.uf,
      tipo: 'saida_do_escopo',
      rotulo: 'Saiu do escopo químico',
      detalhe: 'Deixou de constar no recorte: baixa, mudança de CNAE ou incorporação.',
      sinal: null,
      ambiguidade: 'Incorporação por comprador aparece assim. Vale checar se o adquirente está na base.',
    });
  }

  /* ---- relatório ---- */
  const porTipo = {};
  for (const e of eventos) porTipo[e.tipo] = (porTipo[e.tipo] || 0) + 1;

  console.log(`  → ${eventos.length.toLocaleString('pt-BR')} eventos societários no período\n`);
  for (const [t, n] of Object.entries(porTipo).sort((x, y) => y[1] - x[1])) {
    console.log(`     ${String(n).padStart(6)}  ${t}`);
  }

  const porSubsetor = {};
  for (const e of eventos) {
    if (!e.subsetor) continue;
    porSubsetor[e.subsetor] = (porSubsetor[e.subsetor] || 0) + 1;
  }
  console.log('\n     por subsetor:');
  for (const [s, n] of Object.entries(porSubsetor).sort((x, y) => y[1] - x[1])) {
    console.log(`     ${String(n).padStart(6)}  ${s}`);
  }

  const quentes = eventos.filter((e) => e.tipo === 'aquisicao_provavel' || e.tipo === 'entrada_capital_estrangeiro');
  if (quentes.length) {
    console.log(`\n     ${quentes.length} evento(s) de controle — os que abrem conversa de originação:`);
    for (const e of quentes.slice(0, 15)) {
      console.log(`       · ${e.nome} (${e.uf}) — ${e.rotulo}`);
    }
    if (quentes.length > 15) console.log(`       … e mais ${quentes.length - 15}`);
  }

  const cabecalho = `/* =============================================================================
 *  GHT4 · EVENTOS SOCIETÁRIOS — GERADO AUTOMATICAMENTE. NÃO EDITAR.
 * -----------------------------------------------------------------------------
 *  Diferença entre dois meses do cadastro público do CNPJ: ${DE} → ${ATE}.
 *  Gerado por: node ferramentas/eventos-cnpj.mjs
 *
 *  ${eventos.length.toLocaleString('pt-BR')} eventos. Cada um tem \`ambiguidade\` preenchida — o registro público
 *  afirma o FATO (o quadro mudou, o capital subiu, abriu filial em outra UF) e
 *  não afirma a INTENÇÃO. Exibir a ambiguidade junto do sinal é o mesmo padrão
 *  de "afirmação de um lado, documento do outro" que o resto do projeto segue.
 *
 *  Estes eventos alimentam os sinais rodadaRecente, mudancaControle e
 *  expansaoGeografica — que na base da CVM saem como "não avaliado · sem fonte
 *  disponível", e aqui saem com data e registro público atrás.
 * ========================================================================== */

`;

  const corpo = 'const EVENTOS_CNPJ = '
    + JSON.stringify({ de: DE, ate: ATE, total: eventos.length, eventos }, null, 0)
    + ';\n\nwindow.EVENTOS_CNPJ = EVENTOS_CNPJ;\n';

  fs.writeFileSync(SAIDA, cabecalho + corpo, 'utf8');
  console.log(`\n  gravado: ${path.relative(RAIZ, SAIDA)} (${(fs.statSync(SAIDA).size / 1048576).toFixed(1)} MB)\n`);
}

function indexar(mes) {
  const arq = path.join(HISTORICO, `quimicos-${mes}.json`);
  const dados = JSON.parse(fs.readFileSync(arq, 'utf8'));
  const mapa = new Map();
  for (const e of dados.empresas) mapa.set(e.base, e);
  return mapa;
}
