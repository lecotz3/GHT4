export const TAREFAS = Object.freeze([
  { id: 'conversar', titulo: 'Conversar com o agente', descricao: 'Peça uma análise ou próximo passo com os dados deste trabalho.' },
  { id: 'pesquisar_web', titulo: 'Pesquisar fontes públicas', descricao: 'Investigue uma empresa, notícia ou mercado na internet, com referências.' },
  { id: 'buscar_empresas', titulo: 'Encontrar empresas', descricao: 'Consulte a base química por nome, cidade e estado.' },
  { id: 'preparar_reuniao', titulo: 'Preparar reunião', descricao: 'Reúna os dados da empresa e um roteiro para a conversa.' },
  { id: 'registrar_passo', titulo: 'Registrar próximo passo', descricao: 'Guarde uma ação para continuar depois.' },
  { id: 'ver_pendencias', titulo: 'Rever pendências', descricao: 'Veja o que falta fazer neste trabalho.' },
]);

export async function executarTarefa({ tarefa, texto, contexto, catalogo, acoes }) {
  const resposta = { modo: 'assistido', titulo: '', resumo: '', blocos: [], empresas: [], fontes: [], proximas: [] };
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
    const texto = typeof complemento === 'string' ? complemento : complemento?.texto;
    if (typeof texto !== 'string' || !texto.trim() || texto.length > 24000) throw new Error('Resposta inválida');
    return { ...resultado, complementoIA: texto, modo: 'assistido_com_ia',
      citacoesIA: complemento.citacoes ?? [], usoIA: complemento.uso ?? null, modeloIA: complemento.modelo ?? null,
      fontes: [...resultado.fontes, ...(complemento.fontes ?? [])] };
  } catch (erro) {
    if (erro.codigo === 'ia_em_andamento') throw erro;
    return { ...resultado, avisoIA: 'A IA não retornou uma resposta utilizável. Pode haver indisponibilidade, limite diário ou ausência de fontes. Os dados e o pedido foram preservados; isso não indica ausência de fatos sobre a empresa.' };
  }
}
