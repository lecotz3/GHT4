import { interpretarLocal } from './interpretacao.mjs';
import { CAMINHOS_EXIBIDOS } from '../rede/contratos.mjs';
export const TAREFAS = Object.freeze([
  { id: 'interpretar_busca', titulo: 'Preparar filtros pelo pedido', descricao: 'Descreva a busca e confira os critérios antes de aplicá-los.' },
  { id: 'conversar', titulo: 'Conversar com o agente', descricao: 'Peça uma análise ou próximo passo com os dados deste trabalho.' },
  { id: 'pesquisar_web', titulo: 'Pesquisar fontes públicas', descricao: 'Investigue uma empresa, notícia ou mercado na internet, com referências.' },
  { id: 'buscar_empresas', titulo: 'Encontrar empresas', descricao: 'Consulte a base química por nome, cidade e estado.' },
  { id: 'preparar_reuniao', titulo: 'Preparar reunião', descricao: 'Reúna os dados da empresa e um roteiro para a conversa.' },
  { id: 'mapear_acesso', titulo: 'Abrir caminho até a liderança', descricao: 'Veja quem da GHT4 alcança o CEO, o CFO ou o conselho desta empresa, e com que assunto.' },
  { id: 'registrar_passo', titulo: 'Registrar próximo passo', descricao: 'Guarde uma ação para continuar depois.' },
  { id: 'ver_pendencias', titulo: 'Rever pendências', descricao: 'Veja o que falta fazer neste trabalho.' },
]);

export async function executarTarefa({ tarefa, texto, contexto, catalogo, acoes, rede = null }) {
  const resposta = { modo: 'assistido', titulo: '', resumo: '', blocos: [], empresas: [], fontes: [], proximas: [] };
  if(tarefa==='interpretar_busca')return {...resposta,titulo:'Prévia dos critérios de pesquisa',resumo:'Confira os critérios e as pendências. Nenhum filtro foi alterado e nenhuma busca foi executada.',propostaBusca:interpretarLocal(texto,contexto)};
  const fonte = (referencia) => ({ titulo: 'Receita Federal — cadastro CNPJ', referencia,
    descricao: 'Snapshot local. O cadastro não informa faturamento, intenção de venda ou interesse em contratar assessoria.' });

  if (['conversar', 'pesquisar_web'].includes(tarefa)) {
    const empresa = tarefa === 'conversar' && contexto.empresaId ? await catalogo.obter(contexto.empresaId) : null;
    return { ...resposta, titulo: tarefa === 'pesquisar_web' ? 'Pesquisa de fontes públicas' : 'Análise do trabalho',
      resumo: 'A análise depende do provedor configurado. O resultado deve ser revisado antes de orientar uma decisão comercial.',
      empresas: empresa ? [empresa] : [], fontes: empresa ? [fonte(empresa.referencia)] : [], proximas: ['registrar_passo'] };
  }

  if (tarefa === 'buscar_empresas') {
    const r = await catalogo.buscar(contexto);
    return { ...resposta, titulo: 'Empresas para investigar',
      resumo: `${r.total} ${r.total === 1 ? 'empresa corresponde' : 'empresas correspondem'} aos filtros; exibindo ${r.empresas.length} a partir da posição ${(r.offset || 0) + 1}. Ordem por evidência de enquadramento e nome.`,
      empresas: r.empresas, fontes: [fonte(r.referencia)],
      catalogoHash: r.hash,
      paginacao: { total: r.total, offset: r.offset || 0, proximoOffset: r.proximoOffset ?? null }, cobertura: r.cobertura,
      blocos: [{ titulo: 'Antes de priorizar', itens: [
        'Confirme produtos, fornecedores representados e atividade predominante.',
        'Porte financeiro e disposição para uma transação ainda precisam ser apurados.',
        'A lista é um recorte do snapshot disponível e não um censo completo do mercado.',
      ] }], proximas: ['preparar_reuniao', 'registrar_passo'] };
  }
  if (tarefa === 'preparar_reuniao') {
    const empresa = contexto.empresaId ? await catalogo.obter(contexto.empresaId) : null;
    if (!empresa) return { ...resposta, titulo: 'Escolha a empresa da reunião',
      resumo: 'Encontre uma empresa e use “Preparar reunião” no resultado para continuar com os dados corretos.',
      proximas: ['buscar_empresas'] };
    const compra = contexto.frente === 'compra';
    const perguntas = compra ? [
      'Qual lacuna de produto, aplicação, fornecedor ou região a aquisição deve preencher?',
      'Qual a faixa de investimento, origem dos recursos e capacidade de integração?',
      'Quem decide a contratação do assessor e aprova as aquisições?',
    ] : [
      'Quais objetivos os acionistas têm para o negócio e em qual horizonte?',
      'Há interesse em venda, sócio, capital para crescer ou apenas informação?',
      'Quem participa da decisão e quais informações podem ser compartilhadas?',
    ];
    return { ...resposta, titulo: `Preparação de reunião — ${empresa.nome}`,
      resumo: 'Ficha cadastral e roteiro inicial. As perguntas abaixo são sugestões para qualificação, não fatos sobre a empresa.',
      empresas: [empresa], fontes: [fonte(empresa.referencia)],
      blocos: [
        { titulo: 'Objetivo informado por você', itens: [texto || contexto.objetivo || 'Entender objetivos e avaliar se a GHT4 pode ajudar.'] },
        { titulo: compra ? 'Qualificar uma possível busca de aquisições' : 'Entender alternativas dos acionistas', itens: perguntas },
        { titulo: 'Pontos próprios de distribuição química', itens: [
          'Quais aplicações atendem e quais fabricantes representam?',
          'Como funcionam exclusividade, território e concentração de fornecedores?',
          'Há serviços técnicos, laboratório, estoque próprio e necessidade relevante de capital de giro?',
        ] },
        { titulo: 'Encerramento da conversa', itens: ['Registrar necessidade de assessoria, responsável pela decisão e próximo passo com prazo combinado.'] },
      ], proximas: ['registrar_passo', 'buscar_empresas'] };
  }
  if (tarefa === 'mapear_acesso') {
    const empresa = contexto.empresaId ? await catalogo.obter(contexto.empresaId) : null;
    if (!empresa) return { ...resposta, titulo: 'Escolha a empresa antes de mapear o acesso',
      resumo: 'Encontre a empresa e use "Abrir caminho até a liderança" no resultado para continuar com os dados corretos.',
      proximas: ['buscar_empresas'] };
    if (!rede) return { ...resposta, titulo: `Caminho até a liderança — ${empresa.nome}`,
      resumo: 'A rede de relacionamento não está disponível neste servidor. Nada foi consultado.',
      empresas: [empresa], proximas: ['preparar_reuniao'] };

    const r = await rede.caminhos({ empresaId: empresa.id, nomeEmpresa: empresa.nome });
    const fonteRede = { titulo: 'Rede de relacionamento da GHT4',
      referencia: `${r.pessoasConhecidas} pessoas mapeadas nesta empresa · ${r.caminhos.length} caminhos · fontes conectadas: ${r.cobertura.fontesConectadas.join(', ')}`,
      descricao: `Conhecimento da casa, digitado por quem o tem. Nada aqui vem do cadastro público, que não informa dirigentes nem contatos. Sem conexão com: ${r.cobertura.fontesNaoConectadas.join(', ')}.` };

    /* Empresa marcada como não contatar encerra o assunto antes de qualquer
       sugestão. Listar caminhos e só depois avisar seria oferecer a porta e
       contar a regra em letra miúda. */
    if (r.restricao?.ativa) return { ...resposta, titulo: `Não contatar — ${empresa.nome}`,
      resumo: 'Esta empresa está marcada como não contatar neste espaço. Nenhum caminho de acesso é sugerido enquanto a restrição estiver ativa.',
      empresas: [empresa], fontes: [fonteRede, fonte(empresa.referencia)],
      blocos: [{ titulo: 'Restrição registrada', itens: [r.restricao.motivo,
        'Retirar a restrição é decisão de quem pode mover a oportunidade, e fica registrada.'] }],
      caminhos: { ...r, caminhos: [], semCaminho: [] }, proximas: ['ver_pendencias'] };

    const blocos = [];
    const uteis = r.caminhos.filter((c) => c.recomendavel);
    const barrados = r.caminhos.filter((c) => !c.recomendavel);
    const melhor = uteis[0];

    if (melhor) {
      const contato = [melhor.alvo.email, melhor.alvo.telefone, melhor.alvo.linkedin].filter(Boolean);
      const ponte = melhor.intermediario;
      blocos.push({ titulo: `Caminho recomendado — ${melhor.categoriaRotulo}`, itens: [
        `Rota: ${melhor.rota}`,
        `Quem começa: ${melhor.ght4.nome}${melhor.ght4.cargo ? `, ${melhor.ght4.cargo}` : ''}.`,
        ponte ? `Por meio de: ${ponte.nome}${ponte.cargo ? `, ${ponte.cargo}` : ''}${ponte.organizacao ? ` (${ponte.organizacao})` : ''} — não é da GHT4.` : 'Sem intermediário: a ligação é direta.',
        `Para quem: ${melhor.alvo.nome}${melhor.alvo.cargo ? `, ${melhor.alvo.cargo}` : ''} — ${melhor.alvo.senioridadeRotulo}.`,
        `Base da conversa: ${melhor.porque}`,
        melhor.categoriaDescricao,
        melhor.alvo.camposOmitidos?.length
          ? 'Dados de contato existem no cadastro, mas seu acesso não os exibe. Peça a quem tem permissão de ver contatos.'
          : contato.length ? `Contato registrado: ${contato.join(' · ')}` : 'Nenhum dado de contato registrado. Uma apresentação pelo próprio membro dispensa o endereço; não montar e-mail por padrão de domínio.',
      ] });

      /* Um rascunho poupa a parte mais travada do trabalho, que é a primeira
         frase. Vai marcado como rascunho porque quem liga conhece a relação e o
         programa não: sugerir é útil, ditar seria presunçoso. Com intermediário
         são dois textos, e o primeiro pede a apresentação em vez de fingir que
         ela já aconteceu. */
      const primeiroNome = (n) => String(n).split(' ')[0];
      const rascunhos = ponte ? [
        `Para ${ponte.nome}, pedindo a apresentação: "${primeiroNome(ponte.nome)}, tudo bem? Estou acompanhando o setor químico e vi que você tem relação com ${melhor.alvo.nome}${melhor.alvo.cargo ? `, ${melhor.alvo.cargo} da ${empresa.nome}` : ` da ${empresa.nome}`}. Faria sentido você nos apresentar? Entendo perfeitamente se preferir não."`,
        `Depois do aceite, para ${melhor.alvo.nome}: "${primeiroNome(melhor.alvo.nome)}, tudo bem? Aqui é ${melhor.ght4.nome}, da GHT4, apresentado por ${primeiroNome(ponte.nome)}. Queria ouvir sua leitura sobre o momento do setor. Você teria 20 minutos nas próximas semanas?"`,
      ] : [
        `"${primeiroNome(melhor.alvo.nome)}, tudo bem? Aqui é ${melhor.ght4.nome}, da GHT4. ` +
        `${melhor.ligacoes[0].tipo === 'trabalharam_juntos' ? 'Trabalhamos juntos' : 'Nos conhecemos'}` +
        `${melhor.ligacoes[0].periodo ? ` ${melhor.ligacoes[0].periodo}` : ''}. ` +
        `Estou acompanhando o setor e queria ouvir sua leitura sobre ${empresa.nome}. Você teria 20 minutos nas próximas semanas?"`,
      ];
      blocos.push({ titulo: 'Rascunho da abordagem — revise antes de enviar', itens: [
        ...rascunhos,
        'Ajuste o tom à relação real. Não antecipe mandato, cliente, tese ou valores nesta primeira conversa, e não declare interesse de venda sem evidência.',
        'Escrever a mensagem não move a oportunidade para "contatada": registre a etapa só depois do contato feito.',
      ] });

      if (melhor.ressalvas.length) blocos.push({ titulo: 'Antes de usar este caminho', itens: melhor.ressalvas });
    }

    const outros = uteis.slice(1, CAMINHOS_EXIBIDOS);
    if (outros.length) blocos.push({ titulo: `Outros ${outros.length === 1 ? 'caminho' : 'caminhos'}`,
      itens: [...outros.map((c) => `${c.rota} · ${c.categoriaRotulo} · ${c.saltos === 1 ? 'ligação direta' : 'uma ponte no meio'}, vínculo ${c.ligacoes.map((l) => l.forcaRotulo.toLowerCase()).join(' e ')}.`),
        ...(uteis.length > CAMINHOS_EXIBIDOS ? [`Mais ${uteis.length - CAMINHOS_EXIBIDOS} em Rede, fora desta lista de ${CAMINHOS_EXIBIDOS}.`] : [])] });

    if (barrados.length) blocos.push({ titulo: 'Existem, mas não são oferecidos',
      itens: barrados.map((c) => `${c.rota} — ${c.ressalvas[0] ?? c.categoriaDescricao}`) });

    if (r.semCaminho.length) blocos.push({ titulo: 'Mapeados, mas sem ninguém que alcance',
      itens: [...r.semCaminho.map((p) => `${p.nome}${p.cargo ? `, ${p.cargo}` : ''} — ${p.senioridadeRotulo}.`),
        'Perguntar na casa quem conhece estas pessoas costuma render mais que uma abordagem fria.'] });

    if (r.cobertura.situacao === 'nao_mapeada') blocos.push({ titulo: 'A casa ainda não mapeou esta empresa', itens: [
      'Nenhuma pessoa desta empresa está cadastrada na rede. Isso diz o que a casa registrou até agora, não que não haja a quem recorrer.',
      'Cadastre em Rede quem você já conhece lá dentro, e o vínculo de quem da GHT4 alcança essa pessoa.',
    ] });
    else if (r.cobertura.situacao === 'nao_perguntada') blocos.push({ titulo: 'Ninguém da casa foi perguntado ainda', itens: [
      `${r.pessoasConhecidas} ${r.pessoasConhecidas === 1 ? 'pessoa está mapeada' : 'pessoas estão mapeadas'} nesta empresa, e nenhuma delas foi mostrada a alguém da GHT4.`,
      'Rode a passada de reconhecimento em Rede antes de concluir que não há caminho. Ausência de resposta não é resposta.',
    ] });
    else if (!uteis.length) blocos.push({ titulo: 'Perguntado, e sem caminho até aqui', itens: [
      `${r.cobertura.pessoasPerguntadas} de ${r.pessoasConhecidas} pessoas já foram mostradas a alguém da casa, com ${r.cobertura.negativas} "não conheço".`,
      'Aqui a busca por dentro da rede se esgotou. O passo seguinte é procurar uma ponte de fora, não insistir na mesma lista.',
    ] });

    const abertura = r.restricao && !r.restricao.ativa ? 'Restrição de contato já registrada e retirada para este espaço. ' : '';
    const resumo = melhor
      ? `${uteis.length} ${uteis.length === 1 ? 'caminho utilizável' : 'caminhos utilizáveis'}${barrados.length ? ` e ${barrados.length} descartado${barrados.length === 1 ? '' : 's'} por resposta do titular` : ''}. O mais apresentável é ${melhor.categoriaRotulo.toLowerCase()}. ${r.lideresConhecidos} ${r.lideresConhecidos === 1 ? 'pessoa mapeada está' : 'pessoas mapeadas estão'} na alta liderança. Um caminho vale o seu elo menos comprovado; confira as ressalvas antes da ligação.`
      : r.caminhos.length
        ? `Há ${r.caminhos.length} ${r.caminhos.length === 1 ? 'caminho registrado' : 'caminhos registrados'}, nenhum utilizável hoje: o titular respondeu que não quer intermediar ou que a informação está desatualizada.`
        : r.pessoasConhecidas
          ? r.cobertura.situacao === 'nao_perguntada'
            ? `${r.pessoasConhecidas} ${r.pessoasConhecidas === 1 ? 'pessoa mapeada' : 'pessoas mapeadas'} nesta empresa, e nenhuma ainda foi mostrada a alguém da casa. Isto é "não apurado", não "não há caminho".`
            : `${r.cobertura.pessoasPerguntadas} de ${r.pessoasConhecidas} pessoas já foram perguntadas e nenhum vínculo apareceu. A busca por dentro da rede se esgotou para esta empresa.`
          : 'Nenhuma pessoa desta empresa está mapeada na rede da casa. A rede foi consultada e não retornou resultado — o que é diferente de não haver relacionamento.';

    return { ...resposta, titulo: `Caminho até a liderança — ${empresa.nome}`,
      resumo: abertura + resumo,
      empresas: [empresa], fontes: [fonteRede, fonte(empresa.referencia)],
      blocos, caminhos: r, proximas: ['registrar_passo', 'preparar_reuniao'] };
  }

  if (tarefa === 'registrar_passo') {
    return { ...resposta, titulo: 'Próximo passo registrado', resumo: texto,
      blocos: [{ titulo: 'Acompanhamento', itens: ['A ação fica salva neste trabalho. Marque como concluída na lista de pendências.'] }],
      proximas: ['ver_pendencias', 'preparar_reuniao'] };
  }
  const abertas = acoes.filter((a) => !a.concluida);
  return { ...resposta, titulo: 'Pendências deste trabalho',
    resumo: abertas.length ? `${abertas.length} ações aguardam conclusão.` : 'Não há ações pendentes registradas neste trabalho.',
    blocos: abertas.length ? [{ titulo: 'Ações registradas por você', itens: abertas.map((a) => a.descricao) }] : [],
    proximas: ['registrar_passo', 'buscar_empresas'] };
}

/** Ponto de integração do futuro provedor. Nenhum texto ou arquivo é enviado sem configuração. */
export async function complementarComIA(resultado, entrada, redigir) {
  if (!redigir) return ['conversar', 'pesquisar_web'].includes(entrada.tarefa) ? { ...resultado,
    avisoIA: 'O provedor de IA ainda não está configurado neste servidor. Nenhuma pesquisa web foi executada.' } : resultado;
  try {
    const complemento = await redigir({
      tarefa: entrada.tarefa, pedido: entrada.texto, contexto: entrada.contexto,
      evidencias: resultado.empresas, fontes: resultado.fontes,
      execucao: entrada.execucao, historico: entrada.historico, documentos: entrada.documentos,
    });
    if(entrada.tarefa==='interpretar_busca') {
      if(!complemento?.propostaBusca)throw new Error('interpretacao_invalida');
      return {...resultado,modo:'assistido_com_ia',propostaBusca:complemento.propostaBusca,modeloIA:complemento.modelo,usoIA:complemento.uso};
    }
    const texto = typeof complemento === 'string' ? complemento : complemento?.texto;
    if (typeof texto !== 'string' || !texto.trim() || texto.length > 24000) throw new Error('Resposta inválida');
    return { ...resultado, complementoIA: texto, modo: 'assistido_com_ia',
      citacoesIA: complemento.citacoes ?? [], usoIA: complemento.uso ?? null, modeloIA: complemento.modelo ?? null,
      fontes: [...resultado.fontes, ...(complemento.fontes ?? [])] };
  } catch (erro) {
    if (erro.codigo === 'ia_em_andamento') throw erro;
    if(entrada.tarefa==='interpretar_busca')return {...resultado,avisoIA:'A IA não retornou uma interpretação válida. A prévia abaixo usa somente as regras locais; confira as pendências antes de aplicar.'};
    if(erro.message==='contexto_excessivo')return {...resultado,avisoIA:'O conjunto de documentos e histórico ultrapassa o limite de 48 mil caracteres desta análise. Selecione menos documentos ou um arquivo menor e comece um novo trabalho. Nenhum pedido foi enviado ao provedor; o material completo continua na oportunidade.'};
    return { ...resultado, avisoIA: 'A IA não retornou uma resposta utilizável. Pode haver indisponibilidade, limite diário ou ausência de fontes. Os dados e o pedido foram preservados; isso não indica ausência de fatos sobre a empresa.' };
  }
}
