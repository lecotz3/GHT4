/* =============================================================================
 *  GHT4 · Agente de Prospecção M&A — DADOS DEMONSTRATIVOS · SETOR QUÍMICOS
 * -----------------------------------------------------------------------------
 *  ATENÇÃO: Todas as empresas abaixo são FICTÍCIAS e os números são SIMULADOS.
 *  Os CONTATOS (nome, cargo, e-mail e telefone) também são TOTALMENTE FICTÍCIOS
 *  e não correspondem a nenhuma pessoa real. Nada aqui representa dados reais de
 *  mercado, cadastro, contato ou due diligence. Este arquivo existe apenas para
 *  demonstrar o conceito do agente e deve ser substituído por fontes validadas
 *  após o levantamento de requisitos.
 *
 *  RECORTE — decisão de diretoria
 *  A base foi reconstruída no setor QUÍMICOS e só nele. Saúde, Tecnologia,
 *  Varejo e Energia foram removidos: o agente passa a atacar um objetivo por
 *  vez, e o primeiro é setor e subsetor. Os subsetores usados aqui são os de
 *  `setores.js` — este arquivo não inventa categoria, ele instancia a taxonomia.
 *
 *  A DISTRIBUIÇÃO DE EMPRESAS NÃO É UNIFORME, E ISSO É PROPOSITAL
 *  Oito das 32 estão em Distribuição, que é o subsetor prioritário, e apenas uma
 *  em Resinas. A base de demonstração espelha onde a boutique tem tese — não
 *  finge que todos os elos da cadeia rendem o mesmo número de mandatos.
 *  Petroquímica básica não tem nenhuma empresa aqui, de propósito: `setores.js`
 *  declara o subsetor como sem alvo de boutique, e a base obedece à declaração.
 *
 *  Campos de cada empresa:
 *    oQueFazem         -> explicação mínima da atividade da empresa
 *    cnae              -> subclasse CNAE, resolve o subsetor via setores.js
 *    receita           -> faturamento anual estimado (R$ milhões)
 *    crescimento       -> crescimento de receita (% a.a.)
 *    margemEbitda      -> margem EBITDA (%)
 *    funcionarios      -> nº de colaboradores
 *    perfil            -> perfil societário
 *    contato           -> { nome, cargo, email, telefone } — FICTÍCIO (demo)
 *    mercadoFragmentado-> setor pulverizado, tese de consolidação (buy-and-build)
 *    rodadaRecente     -> captou investimento nos últimos ~18 meses
 *    mudancaControle   -> sinais de mudança de controle / reorganização societária
 *    expansaoGeografica-> movimento recente de expansão geográfica
 *    descricao         -> contexto societário / situação relevante para M&A
 *    origem            -> natureza do dado (Simulado / Estimativa / Hipótese)
 *    dataAtualizacao   -> "data" fictícia de referência do dado
 *    confianca         -> Alta / Média / Baixa / Incompleto
 * ========================================================================== */

const PERFIS = ['Familiar', 'Founder-led', 'Fundo/PE', 'Capital aberto', 'Multinacional'];

const EMPRESAS_DEMO = [
  /* ================= DISTRIBUIÇÃO E TRADING QUÍMICO =================
     Subsetor prioritário. Margem baixa por natureza (é revenda): ler
     "margem comprimida" aqui exige o piso do subsetor, não o do projeto. */
  { id: 'dis01', nome: 'Quimibrás Distribuidora', setor: 'Químicos', subsetor: 'Distribuição e trading químico', cnae: '4684299',
    oQueFazem: 'Distribui solventes, ácidos e insumos de uso geral para indústrias de tinta, adesivo e limpeza. Fraciona e entrega em toda a Região Sudeste.',
    cidade: 'Diadema', uf: 'SP', receita: 320, crescimento: 12, margemEbitda: 7, funcionarios: 180,
    perfil: 'Familiar', contato: { nome: 'Ivo Bertoldi', cargo: 'Diretor-Presidente', email: 'ivo.bertoldi@quimibras.com.br', telefone: '+55 (11) 98455-2031' },
    mercadoFragmentado: true, rodadaRecente: false, mudancaControle: true, expansaoGeografica: false,
    origem: 'Simulado', dataAtualizacao: '2026-06-10', confianca: 'Média',
    descricao: 'Distribuidora de segunda geração com carteira de representação de multinacional; fundador com 71 anos e nenhum herdeiro na administração.' },
  { id: 'dis02', nome: 'Solventec Comercial Química', setor: 'Químicos', subsetor: 'Distribuição e trading químico', cnae: '4684202',
    oQueFazem: 'Importa e distribui solventes oxigenados e hidrocarbonetos para o polo de Camaçari e para o Nordeste.',
    cidade: 'Camaçari', uf: 'BA', receita: 145, crescimento: 9, margemEbitda: 6, funcionarios: 95,
    perfil: 'Familiar', contato: { nome: 'Marlene Sá Barreto', cargo: 'Sócia-Diretora', email: 'marlene.barreto@solventec.com.br', telefone: '+55 (71) 99320-8814' },
    mercadoFragmentado: true, rodadaRecente: false, mudancaControle: false, expansaoGeografica: false,
    origem: 'Estimativa', dataAtualizacao: '2026-05-22', confianca: 'Média',
    descricao: 'Operação ancorada no polo petroquímico, com licença da Polícia Federal para linha completa de solventes controlados.' },
  { id: 'dis03', nome: 'Additiva Sul Distribuição', setor: 'Químicos', subsetor: 'Distribuição e trading químico', cnae: '4684299',
    oQueFazem: 'Distribuição técnica de aditivos e especialidades para as indústrias de tintas, plásticos e couro do Sul.',
    cidade: 'Canoas', uf: 'RS', receita: 88, crescimento: 18, margemEbitda: 9, funcionarios: 70,
    perfil: 'Founder-led', contato: { nome: 'Guilherme Tessari', cargo: 'Fundador & CEO', email: 'guilherme.tessari@additivasul.com.br', telefone: '+55 (51) 98761-4402' },
    mercadoFragmentado: true, rodadaRecente: false, mudancaControle: false, expansaoGeografica: true,
    origem: 'Simulado', dataAtualizacao: '2026-06-28', confianca: 'Alta',
    descricao: 'Distribuidora técnica com equipe de aplicação própria — o perfil que os consolidadores globais de especialidades compram.' },
  { id: 'dis04', nome: 'Polimix Trading Químico', setor: 'Químicos', subsetor: 'Distribuição e trading químico', cnae: '4684201',
    oQueFazem: 'Trading e distribuição de resinas e elastômeros importados, com armazenagem alfandegada em Santos.',
    cidade: 'Santos', uf: 'SP', receita: 610, crescimento: 22, margemEbitda: 5, funcionarios: 210,
    perfil: 'Fundo/PE', contato: { nome: 'Renata Kubota', cargo: 'CEO', email: 'renata.kubota@polimixtrading.com.br', telefone: '+55 (13) 99188-7723' },
    mercadoFragmentado: false, rodadaRecente: true, mudancaControle: false, expansaoGeografica: true,
    origem: 'Estimativa', dataAtualizacao: '2026-07-02', confianca: 'Alta',
    descricao: 'Plataforma de consolidação com apoio de private equity; três aquisições em 24 meses e mandato declarado para mais.' },
  { id: 'dis05', nome: 'Nordeste Química Distribuidora', setor: 'Químicos', subsetor: 'Distribuição e trading químico', cnae: '4684299',
    oQueFazem: 'Revende insumos químicos básicos para indústrias de alimentos, saneantes e tratamento de água do Nordeste.',
    cidade: 'Recife', uf: 'PE', receita: 52, crescimento: 4, margemEbitda: 4, funcionarios: 60,
    perfil: 'Familiar', contato: { nome: 'Josué Amorim', cargo: 'Diretor', email: 'josue.amorim@nordestequimica.com.br', telefone: '+55 (81) 99504-1176' },
    mercadoFragmentado: true, rodadaRecente: false, mudancaControle: false, expansaoGeografica: false,
    origem: 'Simulado', dataAtualizacao: '2026-04-14', confianca: 'Baixa',
    descricao: 'Distribuidora regional com margem espremida entre o produtor e o cliente industrial; sem equipe técnica própria.' },
  { id: 'dis06', nome: 'Ativa Insumos Químicos', setor: 'Químicos', subsetor: 'Distribuição e trading químico', cnae: '4684299',
    oQueFazem: 'Distribui insumos para as indústrias metalmecânica e têxtil de Santa Catarina, com dois centros de distribuição.',
    cidade: 'Joinville', uf: 'SC', receita: 210, crescimento: 15, margemEbitda: 8, funcionarios: 130,
    perfil: 'Familiar', contato: { nome: 'Cristiane Hoffmann', cargo: 'Diretora Comercial', email: 'cristiane.hoffmann@ativainsumos.com.br', telefone: '+55 (47) 99230-6650' },
    mercadoFragmentado: true, rodadaRecente: false, mudancaControle: false, expansaoGeografica: true,
    origem: 'Estimativa', dataAtualizacao: '2026-06-19', confianca: 'Alta',
    descricao: 'Segunda geração profissionalizada, abrindo praça no Paraná — perfil de alvo e de consolidador regional ao mesmo tempo.' },
  { id: 'dis07', nome: 'Interquímica Comércio', setor: 'Químicos', subsetor: 'Distribuição e trading químico', cnae: '4684299',
    oQueFazem: 'Comércio atacadista de produtos químicos diversos, sem especialização declarada.',
    cidade: 'Guarulhos', uf: 'SP', receita: 96, crescimento: -3, margemEbitda: 2, funcionarios: 88,
    perfil: 'Familiar', contato: { nome: 'Wanderley Prieto', cargo: 'Sócio-Administrador', email: 'wanderley.prieto@interquimica.com.br', telefone: '+55 (11) 97622-3308' },
    mercadoFragmentado: true, rodadaRecente: false, mudancaControle: true, expansaoGeografica: false,
    origem: 'Hipótese', dataAtualizacao: '2026-03-27', confianca: 'Incompleto',
    descricao: 'Receita em queda e margem quase nula; há relato não confirmado de reorganização societária em curso.' },
  { id: 'dis08', nome: 'Vale Solventes', setor: 'Químicos', subsetor: 'Distribuição e trading químico', cnae: '4684202',
    oQueFazem: 'Fracionamento e distribuição de solventes para oficinas, gráficas e indústria moveleira de Minas Gerais.',
    cidade: 'Contagem', uf: 'MG', receita: 41, crescimento: 26, margemEbitda: 11, funcionarios: 45,
    perfil: 'Founder-led', contato: { nome: 'Débora Nogueira', cargo: 'Fundadora', email: 'debora.nogueira@valesolventes.com.br', telefone: '+55 (31) 98844-9017' },
    mercadoFragmentado: true, rodadaRecente: false, mudancaControle: false, expansaoGeografica: false,
    origem: 'Simulado', dataAtualizacao: '2026-06-05', confianca: 'Média',
    descricao: 'Operação pequena, crescimento forte e margem acima da média do subsetor por atuar em fracionado de baixo volume.' },

  /* ================= ESPECIALIDADES E ADITIVOS =================
     O coração do middle market químico: margem de 15–25% e nicho técnico. */
  { id: 'esp01', nome: 'Adesivar Indústria Química', setor: 'Químicos', subsetor: 'Especialidades e aditivos', cnae: '2091600',
    oQueFazem: 'Formula adesivos e selantes industriais para calçado, embalagem e construção civil.',
    cidade: 'São Bernardo do Campo', uf: 'SP', receita: 74, crescimento: 19, margemEbitda: 21, funcionarios: 160,
    perfil: 'Familiar', contato: { nome: 'Otávio Bianchi', cargo: 'Diretor Industrial', email: 'otavio.bianchi@adesivar.com.br', telefone: '+55 (11) 99077-5528' },
    mercadoFragmentado: true, rodadaRecente: false, mudancaControle: false, expansaoGeografica: false,
    origem: 'Estimativa', dataAtualizacao: '2026-05-30', confianca: 'Alta',
    descricao: 'Formulação própria com 40 anos de histórico e carteira concentrada em cinco clientes industriais.' },
  { id: 'esp02', nome: 'Catalix Tecnologia Química', setor: 'Químicos', subsetor: 'Especialidades e aditivos', cnae: '2094100',
    oQueFazem: 'Desenvolve e produz catalisadores para refino e para a indústria de oleoquímica.',
    cidade: 'Paulínia', uf: 'SP', receita: 38, crescimento: 33, margemEbitda: 24, funcionarios: 85,
    perfil: 'Founder-led', contato: { nome: 'Dra. Yara Monteiro', cargo: 'Fundadora & Diretora Técnica', email: 'yara.monteiro@catalix.com.br', telefone: '+55 (19) 98311-7264' },
    mercadoFragmentado: false, rodadaRecente: true, mudancaControle: false, expansaoGeografica: false,
    origem: 'Simulado', dataAtualizacao: '2026-06-25', confianca: 'Média',
    descricao: 'Base tecnológica com patentes próprias; o ativo é o conhecimento da fundadora, o que é risco e valor ao mesmo tempo.' },
  { id: 'esp03', nome: 'Adminas Aditivos', setor: 'Químicos', subsetor: 'Especialidades e aditivos', cnae: '2093200',
    oQueFazem: 'Produz aditivos de uso industrial para concreto, argamassa e cerâmica.',
    cidade: 'Betim', uf: 'MG', receita: 128, crescimento: 11, margemEbitda: 18, funcionarios: 240,
    perfil: 'Fundo/PE', contato: { nome: 'Sérgio Vasconcelos', cargo: 'CEO', email: 'sergio.vasconcelos@adminas.com.br', telefone: '+55 (31) 99418-2205' },
    mercadoFragmentado: true, rodadaRecente: false, mudancaControle: false, expansaoGeografica: true,
    origem: 'Estimativa', dataAtualizacao: '2026-07-01', confianca: 'Alta',
    descricao: 'Controlada por fundo desde 2022, comprando formuladores regionais para montar plataforma nacional.' },
  { id: 'esp04', nome: 'Selanor Selantes', setor: 'Químicos', subsetor: 'Especialidades e aditivos', cnae: '2091600',
    oQueFazem: 'Selantes de poliuretano e silicone para as indústrias moveleira e automotiva da Serra Gaúcha.',
    cidade: 'Caxias do Sul', uf: 'RS', receita: 29, crescimento: 7, margemEbitda: 16, funcionarios: 55,
    perfil: 'Familiar', contato: { nome: 'Ilda Bertolini', cargo: 'Sócia-Gerente', email: 'ilda.bertolini@selanor.com.br', telefone: '+55 (54) 99126-3390' },
    mercadoFragmentado: true, rodadaRecente: false, mudancaControle: true, expansaoGeografica: false,
    origem: 'Simulado', dataAtualizacao: '2026-04-18', confianca: 'Média',
    descricao: 'Empresa de 38 anos com quadro societário em reorganização entre os três filhos do fundador.' },
  { id: 'esp05', nome: 'Tecnoquímica Aditivos', setor: 'Químicos', subsetor: 'Especialidades e aditivos', cnae: '2093200',
    oQueFazem: 'Aditivos para o processamento de plásticos, com foco em antioxidantes e agentes de deslizamento.',
    cidade: 'Londrina', uf: 'PR', receita: 22, crescimento: 41, margemEbitda: 13, funcionarios: 40,
    perfil: 'Founder-led', contato: { nome: 'Kleber Matsuda', cargo: 'Fundador', email: 'kleber.matsuda@tecnoquimica.ind.br', telefone: '+55 (43) 99655-8871' },
    mercadoFragmentado: true, rodadaRecente: false, mudancaControle: false, expansaoGeografica: true,
    origem: 'Hipótese', dataAtualizacao: '2026-05-09', confianca: 'Baixa',
    descricao: 'Crescimento acelerado sobre base pequena; a expansão para São Paulo é relato do fundador, ainda não verificada.' },
  { id: 'esp06', nome: 'Sinerquímica Especialidades', setor: 'Químicos', subsetor: 'Especialidades e aditivos', cnae: '2099199',
    oQueFazem: 'Produtos químicos de performance para tratamento de água industrial e para mineração.',
    cidade: 'Cotia', uf: 'SP', receita: 185, crescimento: 14, margemEbitda: 22, funcionarios: 300,
    perfil: 'Multinacional', contato: { nome: 'Paul Renner', cargo: 'Diretor-Geral Brasil', email: 'paul.renner@sinerquimica.com', telefone: '+55 (11) 97300-1145' },
    mercadoFragmentado: false, rodadaRecente: false, mudancaControle: false, expansaoGeografica: false,
    origem: 'Estimativa', dataAtualizacao: '2026-06-12', confianca: 'Alta',
    descricao: 'Subsidiária de grupo europeu com mandato regional de aquisição — comprador, não alvo.' },

  /* ================= TINTAS, VERNIZES E REVESTIMENTOS ================= */
  { id: 'tin01', nome: 'Coralina Tintas', setor: 'Químicos', subsetor: 'Tintas, vernizes e revestimentos', cnae: '2071100',
    oQueFazem: 'Fabrica tintas imobiliárias de marca própria, vendidas por revendas de material de construção no Nordeste.',
    cidade: 'Feira de Santana', uf: 'BA', receita: 118, crescimento: 8, margemEbitda: 14, funcionarios: 290,
    perfil: 'Familiar', contato: { nome: 'Aurélio Nascimento', cargo: 'Presidente', email: 'aurelio.nascimento@coralinatintas.com.br', telefone: '+55 (75) 99811-4437' },
    mercadoFragmentado: true, rodadaRecente: false, mudancaControle: true, expansaoGeografica: false,
    origem: 'Simulado', dataAtualizacao: '2026-05-16', confianca: 'Média',
    descricao: 'Marca com penetração forte em quatro estados; a família contratou assessoria para estudar a venda de participação.' },
  { id: 'tin02', nome: 'RevestSul Industrial', setor: 'Químicos', subsetor: 'Tintas, vernizes e revestimentos', cnae: '2071100',
    oQueFazem: 'Tintas e revestimentos industriais anticorrosivos para estruturas metálicas e implementos agrícolas.',
    cidade: 'Gravataí', uf: 'RS', receita: 64, crescimento: 16, margemEbitda: 17, funcionarios: 150,
    perfil: 'Founder-led', contato: { nome: 'Tarso Menegotto', cargo: 'Fundador & CEO', email: 'tarso.menegotto@revestsul.com.br', telefone: '+55 (51) 99402-7719' },
    mercadoFragmentado: true, rodadaRecente: false, mudancaControle: false, expansaoGeografica: true,
    origem: 'Estimativa', dataAtualizacao: '2026-06-21', confianca: 'Alta',
    descricao: 'Tinta industrial de especificação técnica, margem acima da média do segmento imobiliário.' },
  { id: 'tin03', nome: 'Imperbrás Impermeabilizantes', setor: 'Químicos', subsetor: 'Tintas, vernizes e revestimentos', cnae: '2073800',
    oQueFazem: 'Impermeabilizantes asfálticos e acrílicos para construção civil, vendidos em home centers.',
    cidade: 'Jundiaí', uf: 'SP', receita: 43, crescimento: 5, margemEbitda: 9, funcionarios: 110,
    perfil: 'Familiar', contato: { nome: 'Neusa Camargo', cargo: 'Diretora', email: 'neusa.camargo@imperbras.com.br', telefone: '+55 (11) 98230-6614' },
    mercadoFragmentado: true, rodadaRecente: false, mudancaControle: false, expansaoGeografica: false,
    origem: 'Simulado', dataAtualizacao: '2026-04-30', confianca: 'Baixa',
    descricao: 'Dependência alta de dois grandes varejistas, o que comprime margem e concentra risco de receita.' },
  { id: 'tin04', nome: 'PrintInk Tintas Gráficas', setor: 'Químicos', subsetor: 'Tintas, vernizes e revestimentos', cnae: '2072000',
    oQueFazem: 'Tintas para impressão flexográfica e offset, atendendo convertedores de embalagem.',
    cidade: 'Diadema', uf: 'SP', receita: 27, crescimento: -6, margemEbitda: 3, funcionarios: 70,
    perfil: 'Familiar', contato: { nome: 'Hamilton Ruiz', cargo: 'Sócio-Administrador', email: 'hamilton.ruiz@printink.com.br', telefone: '+55 (11) 97744-2286' },
    mercadoFragmentado: true, rodadaRecente: false, mudancaControle: false, expansaoGeografica: false,
    origem: 'Hipótese', dataAtualizacao: '2026-03-19', confianca: 'Incompleto',
    descricao: 'Segmento em retração pela migração para digital; receita e margem em queda há três exercícios.' },

  /* ================= DOMISSANITÁRIOS E PRODUTOS DE LIMPEZA ================= */
  { id: 'dom01', nome: 'Limpec Profissional', setor: 'Químicos', subsetor: 'Domissanitários e produtos de limpeza', cnae: '2062200',
    oQueFazem: 'Formula produtos de limpeza profissional para hospitais, indústria de alimentos e facilities.',
    cidade: 'Osasco', uf: 'SP', receita: 92, crescimento: 20, margemEbitda: 15, funcionarios: 210,
    perfil: 'Fundo/PE', contato: { nome: 'Vivian Castelo', cargo: 'CEO', email: 'vivian.castelo@limpec.com.br', telefone: '+55 (11) 99512-8840' },
    mercadoFragmentado: true, rodadaRecente: true, mudancaControle: false, expansaoGeografica: true,
    origem: 'Estimativa', dataAtualizacao: '2026-06-30', confianca: 'Média',
    descricao: 'Linha B2B com contrato recorrente e portfólio amplo de saneantes regularizados na ANVISA.' },
  { id: 'dom02', nome: 'Sanitiza Indústria Química', setor: 'Químicos', subsetor: 'Domissanitários e produtos de limpeza', cnae: '2052500',
    oQueFazem: 'Desinfestantes domissanitários e desinfetantes para os canais agropecuário e institucional.',
    cidade: 'Maringá', uf: 'PR', receita: 48, crescimento: 10, margemEbitda: 12, funcionarios: 130,
    perfil: 'Familiar', contato: { nome: 'Elias Fontana', cargo: 'Diretor', email: 'elias.fontana@sanitiza.com.br', telefone: '+55 (44) 99188-5563' },
    mercadoFragmentado: true, rodadaRecente: false, mudancaControle: false, expansaoGeografica: false,
    origem: 'Simulado', dataAtualizacao: '2026-05-11', confianca: 'Média',
    descricao: 'Portfólio com 60 registros vivos na ANVISA — ativo transferível que sustenta o múltiplo.' },
  { id: 'dom03', nome: 'BrilhoMax Produtos de Limpeza', setor: 'Químicos', subsetor: 'Domissanitários e produtos de limpeza', cnae: '2062200',
    oQueFazem: 'Fabrica linha de limpeza doméstica de marca própria para redes de atacarejo.',
    cidade: 'Contagem', uf: 'MG', receita: 31, crescimento: 3, margemEbitda: 5, funcionarios: 95,
    perfil: 'Familiar', contato: { nome: 'Rosana Diniz', cargo: 'Sócia-Diretora', email: 'rosana.diniz@brilhomax.com.br', telefone: '+55 (31) 98307-1192' },
    mercadoFragmentado: true, rodadaRecente: false, mudancaControle: false, expansaoGeografica: false,
    origem: 'Simulado', dataAtualizacao: '2026-04-08', confianca: 'Baixa',
    descricao: 'Produção para marca própria de terceiros: volume sem marca, margem estrutural baixa e poder de barganha nulo.' },
  { id: 'dom04', nome: 'Higiennor Domissanitários', setor: 'Químicos', subsetor: 'Domissanitários e produtos de limpeza', cnae: '2061400',
    oQueFazem: 'Sabões e detergentes sintéticos para o mercado regional do Ceará e do Piauí.',
    cidade: 'Fortaleza', uf: 'CE', receita: 19, crescimento: 28, margemEbitda: 8, funcionarios: 60,
    perfil: 'Founder-led', contato: { nome: 'Iranildo Barros', cargo: 'Fundador', email: 'iranildo.barros@higiennor.com.br', telefone: '+55 (85) 99244-0937' },
    mercadoFragmentado: true, rodadaRecente: false, mudancaControle: false, expansaoGeografica: false,
    origem: 'Hipótese', dataAtualizacao: '2026-06-02', confianca: 'Baixa',
    descricao: 'Abaixo da faixa consolidável do subsetor; entra na base como referência de piso, não como alvo.' },

  /* ================= INORGÂNICOS E GASES INDUSTRIAIS ================= */
  { id: 'gas01', nome: 'Gases do Vale', setor: 'Químicos', subsetor: 'Inorgânicos e gases industriais', cnae: '2014200',
    oQueFazem: 'Produz e distribui oxigênio, nitrogênio e acetileno para siderurgia, metalmecânica e hospitais do Sul Fluminense.',
    cidade: 'Volta Redonda', uf: 'RJ', receita: 156, crescimento: 9, margemEbitda: 26, funcionarios: 240,
    perfil: 'Familiar', contato: { nome: 'Reinaldo Peixoto', cargo: 'Diretor-Presidente', email: 'reinaldo.peixoto@gasesdovale.com.br', telefone: '+55 (24) 99866-3320' },
    mercadoFragmentado: false, rodadaRecente: false, mudancaControle: true, expansaoGeografica: false,
    origem: 'Estimativa', dataAtualizacao: '2026-06-17', confianca: 'Alta',
    descricao: 'Contratos de fornecimento de longo prazo com dois clientes âncora; controle familiar em transição.' },
  { id: 'gas02', nome: 'OxiCentro Gases Industriais', setor: 'Químicos', subsetor: 'Inorgânicos e gases industriais', cnae: '2014200',
    oQueFazem: 'Envase e distribuição de gases industriais e medicinais no Centro-Oeste.',
    cidade: 'Goiânia', uf: 'GO', receita: 67, crescimento: 13, margemEbitda: 23, funcionarios: 120,
    perfil: 'Familiar', contato: { nome: 'Márcia Toledo', cargo: 'Diretora-Geral', email: 'marcia.toledo@oxicentro.com.br', telefone: '+55 (62) 99373-4418' },
    mercadoFragmentado: true, rodadaRecente: false, mudancaControle: false, expansaoGeografica: true,
    origem: 'Simulado', dataAtualizacao: '2026-05-27', confianca: 'Média',
    descricao: 'Negócio de densidade logística: abriu base em Palmas para ampliar o raio econômico de entrega.' },
  { id: 'gas03', nome: 'Cloralto Química', setor: 'Químicos', subsetor: 'Inorgânicos e gases industriais', cnae: '2011800',
    oQueFazem: 'Produz cloro, soda cáustica e derivados para tratamento de água e para a indústria de papel.',
    cidade: 'Aracaju', uf: 'SE', receita: 340, crescimento: 2, margemEbitda: 11, funcionarios: 420,
    perfil: 'Capital aberto', contato: { nome: 'Fábio Andrade', cargo: 'Diretor de RI', email: 'fabio.andrade@cloralto.com.br', telefone: '+55 (79) 99155-2274' },
    mercadoFragmentado: false, rodadaRecente: false, mudancaControle: false, expansaoGeografica: false,
    origem: 'Estimativa', dataAtualizacao: '2026-06-08', confianca: 'Alta',
    descricao: 'Ativo eletrointensivo de grande porte; a energia responde por parcela dominante do custo.' },
  { id: 'gas04', nome: 'NitroSul Criogenia', setor: 'Químicos', subsetor: 'Inorgânicos e gases industriais', cnae: '2014200',
    oQueFazem: 'Gases criogênicos e serviços de congelamento para a indústria de alimentos do Paraná e de Santa Catarina.',
    cidade: 'Curitiba', uf: 'PR', receita: 44, crescimento: 17, margemEbitda: 20, funcionarios: 80,
    perfil: 'Founder-led', contato: { nome: 'Anderson Klein', cargo: 'Fundador & CEO', email: 'anderson.klein@nitrosul.com.br', telefone: '+55 (41) 99622-8805' },
    mercadoFragmentado: true, rodadaRecente: false, mudancaControle: false, expansaoGeografica: false,
    origem: 'Simulado', dataAtualizacao: '2026-06-23', confianca: 'Média',
    descricao: 'Modelo de equipamento cedido em comodato com contrato de fornecimento — receita previsível e capital imobilizado alto.' },

  /* ================= FERTILIZANTES E NUTRIÇÃO VEGETAL ================= */
  { id: 'fer01', nome: 'NutriCampo Fertilizantes', setor: 'Químicos', subsetor: 'Fertilizantes e nutrição vegetal', cnae: '2013402',
    oQueFazem: 'Mistura (blending) e entrega de fertilizantes NPK direto na fazenda, no eixo do Mato Grosso.',
    cidade: 'Rondonópolis', uf: 'MT', receita: 480, crescimento: 24, margemEbitda: 6, funcionarios: 260,
    perfil: 'Familiar', contato: { nome: 'Valdemir Scherer', cargo: 'Diretor-Presidente', email: 'valdemir.scherer@nutricampo.com.br', telefone: '+55 (66) 99711-5540' },
    mercadoFragmentado: true, rodadaRecente: false, mudancaControle: false, expansaoGeografica: true,
    origem: 'Estimativa', dataAtualizacao: '2026-07-03', confianca: 'Média',
    descricao: 'Receita alta com margem fina e capital de giro pesado de safra; abriu unidade de mistura no Matopiba.' },
  { id: 'fer02', nome: 'Blend Agro Nutrição', setor: 'Químicos', subsetor: 'Fertilizantes e nutrição vegetal', cnae: '2013402',
    oQueFazem: 'Blending de fertilizantes e revenda de insumos agrícolas para produtores de Goiás.',
    cidade: 'Rio Verde', uf: 'GO', receita: 215, crescimento: 18, margemEbitda: 8, funcionarios: 140,
    perfil: 'Fundo/PE', contato: { nome: 'Luciano Prates', cargo: 'CEO', email: 'luciano.prates@blendagro.com.br', telefone: '+55 (64) 99230-1188' },
    mercadoFragmentado: true, rodadaRecente: true, mudancaControle: false, expansaoGeografica: false,
    origem: 'Simulado', dataAtualizacao: '2026-06-26', confianca: 'Alta',
    descricao: 'Plataforma de consolidação de misturadores regionais, capitalizada para comprar concorrentes.' },
  { id: 'fer03', nome: 'Organomix Nutrição Vegetal', setor: 'Químicos', subsetor: 'Fertilizantes e nutrição vegetal', cnae: '2013401',
    oQueFazem: 'Fertilizantes organominerais e bioinsumos para cana, café e hortifrúti.',
    cidade: 'Uberaba', uf: 'MG', receita: 76, crescimento: 31, margemEbitda: 19, funcionarios: 90,
    perfil: 'Founder-led', contato: { nome: 'Dr. Emerson Pádua', cargo: 'Fundador & Diretor Técnico', email: 'emerson.padua@organomix.com.br', telefone: '+55 (34) 99504-7726' },
    mercadoFragmentado: true, rodadaRecente: false, mudancaControle: false, expansaoGeografica: false,
    origem: 'Estimativa', dataAtualizacao: '2026-06-14', confianca: 'Alta',
    descricao: 'Nutrição vegetal especial com registro próprio no MAPA: margem de especialidade dentro de um subsetor de commodity.' },

  /* ================= DEFENSIVOS AGRÍCOLAS ================= */
  { id: 'def01', nome: 'Defenza Formulados', setor: 'Químicos', subsetor: 'Defensivos agrícolas', cnae: '2051700',
    oQueFazem: 'Formula e envasa herbicidas e fungicidas pós-patente, com registros próprios no MAPA.',
    cidade: 'Cambé', uf: 'PR', receita: 168, crescimento: 15, margemEbitda: 17, funcionarios: 175,
    perfil: 'Familiar', contato: { nome: 'Nelson Kawamoto', cargo: 'Diretor-Presidente', email: 'nelson.kawamoto@defenza.com.br', telefone: '+55 (43) 99811-2044' },
    mercadoFragmentado: true, rodadaRecente: false, mudancaControle: true, expansaoGeografica: false,
    origem: 'Estimativa', dataAtualizacao: '2026-06-20', confianca: 'Alta',
    descricao: 'Carteira de registros construída ao longo de 15 anos — o ativo real da empresa. Sócios discutem entrada de investidor.' },
  { id: 'def02', nome: 'AgroProteção Química', setor: 'Químicos', subsetor: 'Defensivos agrícolas', cnae: '2051700',
    oQueFazem: 'Formulação de defensivos e distribuição técnica para produtores de soja e algodão do Mato Grosso.',
    cidade: 'Sorriso', uf: 'MT', receita: 92, crescimento: 9, margemEbitda: 13, funcionarios: 105,
    perfil: 'Familiar', contato: { nome: 'Simone Dallagnol', cargo: 'Diretora Comercial', email: 'simone.dallagnol@agroprotecao.com.br', telefone: '+55 (66) 99355-6612' },
    mercadoFragmentado: true, rodadaRecente: false, mudancaControle: false, expansaoGeografica: false,
    origem: 'Simulado', dataAtualizacao: '2026-05-18', confianca: 'Média',
    descricao: 'Integra formulação e distribuição, o que protege margem mas concentra risco de crédito no produtor rural.' },

  /* ================= RESINAS, ELASTÔMEROS E FIBRAS =================
     Uma única empresa, e de grande porte: é assim que o subsetor se comporta.
     A faixa consolidável dele começa em R$ 150 mi por isso. */
  { id: 'res01', nome: 'Resinorte Termofixos', setor: 'Químicos', subsetor: 'Resinas, elastômeros e fibras', cnae: '2032100',
    oQueFazem: 'Produz resinas termofixas (poliéster insaturado e epóxi) para compósitos, náutica e construção.',
    cidade: 'Camaçari', uf: 'BA', receita: 265, crescimento: 4, margemEbitda: 10, funcionarios: 380,
    perfil: 'Capital aberto', contato: { nome: 'Cláudia Serpa', cargo: 'Diretora de RI', email: 'claudia.serpa@resinorte.com.br', telefone: '+55 (71) 99400-3317' },
    mercadoFragmentado: false, rodadaRecente: false, mudancaControle: false, expansaoGeografica: false,
    origem: 'Estimativa', dataAtualizacao: '2026-06-09', confianca: 'Alta',
    descricao: 'Ativo de segunda geração exposto ao ciclo petroquímico e ao câmbio da matéria-prima importada.' },
];

/* Exposto globalmente para uso pelo app (sem bundler/import). */
window.EMPRESAS_DEMO = EMPRESAS_DEMO;
window.PERFIS = PERFIS;
