import type { Contexto, EstadoAgente, Tarefa } from './api'

export const orientacoes: Record<Tarefa, { titulo: string; ajuda: string; acao: string }> = {
  buscar_empresas: { titulo: 'Encontre as empresas certas', ajuda: 'Informe um nome, cidade ou estado. Você pode deixar os campos em branco para explorar a base.', acao: 'Buscar empresas' },
  mapear_acesso: { titulo: 'Descubra um caminho de acesso', ajuda: 'Escolha a empresa. Vamos procurar relações da GHT4 e mostrar o que ainda precisa ser confirmado.', acao: 'Encontrar caminhos' },
  preparar_reuniao: { titulo: 'Chegue com contexto à conversa', ajuda: 'Escolha a empresa e, se quiser, conte o objetivo da reunião. Você receberá um roteiro para revisar.', acao: 'Preparar roteiro' },
  interpretar_busca: { titulo: 'Transforme seu pedido em filtros', ajuda: 'Descreva o recorte desejado. Confira a proposta antes de aplicar os filtros e pesquisar.', acao: 'Preparar filtros' },
  conversar: { titulo: 'Converse sobre este trabalho', ajuda: 'Descreva sua dúvida. A IA recebe seu pedido e o contexto deste trabalho para preparar uma análise.', acao: 'Enviar ao agente' },
  pesquisar_web: { titulo: 'Pesquise fontes públicas', ajuda: 'Escreva uma pergunta com informações públicas. A consulta será enviada ao serviço de pesquisa.', acao: 'Pesquisar fontes' },
  registrar_passo: { titulo: 'Defina o próximo movimento', ajuda: 'Descreva uma ação concreta. Ela ficará na lista deste trabalho para você acompanhar.', acao: 'Salvar próximo passo' },
  ver_pendencias: { titulo: 'Retome o que falta fazer', ajuda: 'Reúna as ações ainda abertas neste trabalho e escolha por onde continuar.', acao: 'Consultar pendências' },
}

export function impedimentoDaTarefa(tarefa: Tarefa, contexto: Contexto, texto: string, estado: EstadoAgente | null, podeUsar: boolean): string | null {
  if (!podeUsar) return 'Seu perfil permite consulta. Peça ao administrador acesso de analista ou sócio para executar tarefas.'
  if (!estado) return 'Aguarde a conexão com o agente.'
  if (['buscar_empresas', 'preparar_reuniao', 'mapear_acesso'].includes(tarefa) && !estado.base.disponivel) return 'O catálogo de empresas está indisponível. Tente novamente ou consulte as pendências do trabalho.'
  if (['preparar_reuniao', 'mapear_acesso'].includes(tarefa) && !contexto.empresaId) return 'Busque e selecione uma empresa acima para liberar esta ação.'
  if (['conversar', 'pesquisar_web'].includes(tarefa) && !estado.iaConfigurada) return 'Esta tarefa precisa de IA configurada pelo administrador. Encontrar empresas e mapear relações continuam disponíveis.'
  if (tarefa === 'pesquisar_web' && !estado.ia?.web) return 'A pesquisa web ainda não está habilitada pelo administrador.'
  if (['interpretar_busca', 'conversar', 'pesquisar_web'].includes(tarefa) && texto.trim().length < 10) return 'Descreva seu pedido com pelo menos 10 caracteres para continuar.'
  if (tarefa === 'registrar_passo' && !texto.trim()) return 'Escreva a ação que você quer guardar neste trabalho.'
  return null
}
