/* =============================================================================
 *  GHT4 · papéis, permissões e escopo de mandato
 * -----------------------------------------------------------------------------
 *  Duas perguntas diferentes, e confundi-las é como vazamento acontece:
 *
 *    1. ESTE USUÁRIO PODE FAZER ISTO?        → papel (`pode`)
 *    2. SOBRE ESTE MANDATO, ESPECIFICAMENTE? → participação (`alcancaMandato`)
 *
 *  Um sócio pode aprovar shortlist — mas não a shortlist de um mandato do qual
 *  não participa. As duas verificações são independentes e AMBAS obrigatórias
 *  em qualquer rota que toque dado de mandato.
 *
 *  NEGA POR PADRÃO
 *  Permissão desconhecida devolve `false`. Errar escrevendo o nome de uma
 *  permissão nova bloqueia o acesso, que é o lado seguro de falhar — o inverso
 *  abriria a rota para todo mundo em silêncio.
 * ========================================================================== */

/** Papel dentro de um mandato pode ser MENOR que o global, nunca maior. */
export const PAPEIS = Object.freeze(['admin', 'socio', 'analista', 'leitura']);

/* Ordem de poder. Serve para o mínimo entre papel global e papel no mandato. */
const FORCA = Object.freeze({ leitura: 0, analista: 1, socio: 2, admin: 3 });

/**
 * O que cada papel pode. Lista explícita, não herança implícita: ler a tabela
 * responde "quem pode aprovar valuation?" sem seguir cadeia de herança.
 */
const PERMISSOES = Object.freeze({
  admin: [
    'usuario.criar', 'usuario.editar', 'usuario.desativar',
    'mandato.criar', 'mandato.editar', 'mandato.membros',
    'auditoria.ler',
    'template.criar', 'template.editar', 'template.usar',
    'triagem.decidir', 'triagem.ler',
    'crm.ler', 'crm.editar', 'crm.mover',
    'rede.ler', 'rede.editar', 'rede.ver_contato',
    'valuation.ler', 'valuation.revisar',
    'exportar',
  ],
  socio: [
    'mandato.membros',
    'auditoria.ler',
    'template.criar', 'template.editar', 'template.usar',
    'triagem.decidir', 'triagem.ler',
    'crm.ler', 'crm.editar', 'crm.mover',
    'rede.ler', 'rede.editar', 'rede.ver_contato',
    'valuation.ler', 'valuation.revisar',
    'exportar',
  ],
  analista: [
    'template.criar', 'template.usar',
    'triagem.decidir', 'triagem.ler',
    'crm.ler', 'crm.editar',
    'rede.ler',
    'valuation.ler',
    'exportar',
  ],
  leitura: [
    'triagem.ler',
    'crm.ler',
    'rede.ler',
    'valuation.ler',
  ],
});

/** Todas as permissões que existem. Serve de guarda contra nome digitado errado. */
export const PERMISSOES_CONHECIDAS = Object.freeze(
  [...new Set(Object.values(PERMISSOES).flat())].sort(),
);

/**
 * O papel concede a permissão?
 *
 * @param {string} papel
 * @param {string} permissao
 */
export function pode(papel, permissao) {
  if (!PERMISSOES_CONHECIDAS.includes(permissao)) {
    /* Nome desconhecido é quase sempre erro de digitação numa rota nova. Negar
       em silêncio esconderia o bug; avisar e negar deixa o rastro. */
    console.warn(`[rbac] permissão desconhecida: "${permissao}" — negando`);
    return false;
  }
  return (PERMISSOES[papel] ?? []).includes(permissao);
}

/** O menor entre o papel global e o papel dentro do mandato. */
export function papelEfetivo(papelGlobal, papelNoMandato) {
  if (!papelNoMandato) return papelGlobal;
  return (FORCA[papelGlobal] ?? -1) <= (FORCA[papelNoMandato] ?? -1)
    ? papelGlobal
    : papelNoMandato;
}

/**
 * O usuário alcança este mandato?
 *
 * `admin` alcança todos — é quem administra o sistema. Os demais alcançam
 * apenas aqueles de que participam. Mandato não confidencial é visível a
 * qualquer autenticado, e é assim que o piloto compartilhado funciona sem
 * expor o que é sigiloso.
 *
 * @param {{papel: string, mandatos: Array<{id: string, papel: string}>}} usuario
 * @param {{id: string, confidencial: boolean}} mandato
 */
export function alcancaMandato(usuario, mandato) {
  if (!usuario || !mandato) return false;
  if (usuario.papel === 'admin') return true;
  if (mandato.confidencial === false) return true;
  return (usuario.mandatos ?? []).some((m) => m.id === mandato.id);
}

/**
 * Pode a permissão DENTRO deste mandato?
 *
 * É a checagem que as rotas devem usar: junta as duas perguntas e não deixa
 * passar quem tem o papel mas não participa.
 */
export function podeNoMandato(usuario, mandato, permissao) {
  if (!alcancaMandato(usuario, mandato)) return false;
  const noMandato = (usuario.mandatos ?? []).find((m) => m.id === mandato.id)?.papel;
  return pode(papelEfetivo(usuario.papel, noMandato), permissao);
}

/* ---------------------------------------------------------------------------
 *  Política de campo — dado pessoal da rede
 *
 *  O módulo 4 guarda currículo, e-mail e telefone de gente real. O documento de
 *  requisitos pede controle de quem vê o quê, e "quem vê a ficha vê tudo" não
 *  atende: saber que existe um contato dentro do alvo é uma coisa; ter o
 *  telefone dele é outra.
 * ------------------------------------------------------------------------- */

/** Campos que só aparecem para quem tem `rede.ver_contato`. */
export const CAMPOS_SENSIVEIS_REDE = Object.freeze([
  'email', 'telefone', 'linkedin', 'endereco', 'cpf', 'observacoesPessoais',
]);

/**
 * Devolve o membro da rede com os campos sensíveis removidos quando o usuário
 * não pode vê-los, e um marcador dizendo que foram omitidos.
 *
 * Omitir declarando é diferente de omitir em silêncio: a interface consegue
 * mostrar "há contato, você não tem acesso" em vez de sugerir que não existe.
 */
export function filtrarMembroDaRede(membro, usuario, mandato = null) {
  if (!membro) return membro;

  const autorizado = mandato
    ? podeNoMandato(usuario, mandato, 'rede.ver_contato')
    : pode(usuario?.papel, 'rede.ver_contato');

  if (autorizado) return { ...membro, camposOmitidos: [] };

  const filtrado = { ...membro };
  const omitidos = [];
  for (const campo of CAMPOS_SENSIVEIS_REDE) {
    if (filtrado[campo] !== undefined && filtrado[campo] !== null) {
      delete filtrado[campo];
      omitidos.push(campo);
    }
  }
  return { ...filtrado, camposOmitidos: omitidos };
}
