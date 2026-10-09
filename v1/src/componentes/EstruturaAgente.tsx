import { useRef, useState, type ReactNode } from 'react'
import { MarcaGHT4 } from './MarcaGHT4'
import { IconeRede } from './IconeRede'
import type { Usuario } from '../agente/api'

export type SecaoAgente = 'inicio' | 'pesquisa' | 'encontrar' | 'agente' | 'rede' | 'crm' | 'equipe' | 'ajuda'
const secoes = [
  { id: 'inicio', nome: 'Início', icone: 'casa' },
  { id: 'pesquisa', nome: 'Pesquisar por tese', icone: 'alvo' },
  { id: 'encontrar', nome: 'Encontrar quem decide', icone: 'busca' },
  { id: 'agente', nome: 'Meus trabalhos', icone: 'pasta' },
  { id: 'rede', nome: 'Relacionamentos', icone: 'rede' },
  { id: 'crm', nome: 'Oportunidades', icone: 'empresa' },
  { id: 'equipe', nome: 'Equipe e acessos', icone: 'pessoas' },
] as const

export function EstruturaAgente({ usuario, secao, aoNavegar, aoSair, saindo, children }: {
  usuario: Usuario; secao: SecaoAgente; aoNavegar: (s: SecaoAgente) => void; aoSair: () => void; saindo: boolean; children: ReactNode
}) {
  const [menu, setMenu] = useState(false)
  const conteudo = useRef<HTMLDivElement>(null)
  // Trocar de seção leva o foco ao título dela: o leitor de tela anuncia a página nova e o
  // próximo Tab segue a partir do conteúdo, não do menu.
  const titulo = useRef<HTMLHeadingElement>(null)
  const navegar = (s: SecaoAgente) => {
    aoNavegar(s); setMenu(false); window.scrollTo({ top: 0, behavior: 'instant' })
    // Depois da renderização da seção nova; setTimeout também roda com a aba em segundo plano.
    setTimeout(() => titulo.current?.focus({ preventScroll: true }), 0)
  }
  return <div className="agente-app agente-shell">
    <a className="agente-pular" href="#conteudo-agente" onClick={e => { e.preventDefault(); conteudo.current?.focus() }}>Pular para o conteúdo</a>
    <aside className="agente-lateral">
      <div className="agente-marca"><MarcaGHT4 className="h-10" /><span>ADVISORY<span>Inteligência de M&amp;A</span></span><button className="agente-menu-movel" aria-label={menu ? 'Fechar menu' : 'Abrir menu'} aria-expanded={menu} aria-controls="menu-agente" onClick={() => setMenu(!menu)}><IconeRede nome={menu ? 'fechar' : 'menu'} /></button></div>
      <div id="menu-agente" className={`agente-menu ${menu ? 'is-open' : ''}`}>
        <p className="agente-menu-legenda">Seu espaço de trabalho</p>
        <nav aria-label="Navegação principal">{secoes.filter(s => s.id !== 'equipe' || usuario.papel === 'admin').map(s => <button key={s.id} className="agente-nav-item" aria-current={secao === s.id ? 'page' : undefined} onClick={() => navegar(s.id)}><IconeRede nome={s.icone} /><span>{s.nome}</span>{secao === s.id && <span className="agente-nav-ponto" />}</button>)}</nav>
        <div className="agente-lateral-final"><button className="agente-nav-item" aria-current={secao === 'ajuda' ? 'page' : undefined} onClick={() => navegar('ajuda')}><IconeRede nome="ajuda" />Como usar o agente</button>
          <div className="agente-perfil"><span className="agente-avatar">{usuario.nome.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('')}</span><div><strong>{usuario.nome}</strong><small>{usuario.papel === 'admin' ? 'Administrador' : usuario.papel === 'leitura' ? 'Acesso de leitura' : usuario.papel === 'socio' ? 'Sócio' : 'Analista'}</small></div><button aria-label="Sair da conta" title="Sair da conta" onClick={aoSair} disabled={saindo}><IconeRede nome="sair" /></button></div>
        </div>
      </div>
    </aside>
    <div className="agente-corpo">
      <header className="agente-cabecalho"><div><span>Seu espaço</span><span aria-hidden="true">/</span><h1 ref={titulo} tabIndex={-1} className="agente-cabecalho-titulo">{secao === 'ajuda' ? 'Como usar' : secoes.find(s => s.id === secao)?.nome}</h1></div><span className="agente-selo-setor">Químicos · setores-alvo</span></header>
      <div id="conteudo-agente" ref={conteudo} tabIndex={-1}>{children}</div>
    </div>
  </div>
}

export function GuiaDeUso({ aoNavegar, aoExplorar }: { aoNavegar: (s: SecaoAgente) => void; aoExplorar: () => void }) {
  return <main className="agente-pagina space-y-7">
    <div className="agente-titulo"><span className="agente-sobretitulo">Um passo de cada vez</span><h2>Do primeiro alvo à próxima conversa.</h2><p>Escolha uma tarefa. O agente reúne o contexto; você decide como avançar.</p></div>
    <div className="agente-guia-grid">{[
      { n: '01', titulo: 'Descreva a tese', texto: 'Em Início, escreva as empresas que procura. Revise os critérios, rode a amostra de 10 e confira a evidência de cada veredito. Leve as melhores para o trabalho.', destino: 'pesquisa' as const, acao: 'Pesquisar por tese', icone: 'alvo' as const },
      { n: '02', titulo: 'Descubra quem pode ajudar', texto: 'Escolha Abrir caminho em uma empresa. O agente consulta a rede da GHT4. Em Relacionamentos, os membros confirmam quem conhecem.', destino: 'rede' as const, acao: 'Conhecer a rede', icone: 'rede' as const },
      { n: '03', titulo: 'Transforme interesse em ação', texto: 'No resultado, clique em Revisar empresa, registre o motivo e escolha Priorizar. Depois, crie uma oportunidade com responsável e prazo.', destino: 'crm' as const, acao: 'Ver oportunidades', icone: 'agenda' as const },
    ].map(g => <article key={g.n} className="agente-guia-card"><span className="agente-icone-bloco"><IconeRede nome={g.icone} /></span><span className="agente-etapa-numero">{g.n}</span><h3>{g.titulo}</h3><p>{g.texto}</p><button className="agente-link" onClick={() => aoNavegar(g.destino)}>{g.acao}<IconeRede nome="seta" /></button></article>)}</div>
    <section className="agente-superficie p-6"><h3 className="text-lg font-semibold">Dúvidas na primeira utilização</h3>{[
      ['Como a pesquisa por tese decide se uma empresa atende?', 'Critérios de cadastro (idade, porte, filiais, sócios, IBAMA) são conferidos na Receita Federal. O que o cadastro não responde é procurado no site oficial da empresa, a partir do domínio declarado no CNPJ. Sem trecho que comprove, o critério fica “sem evidência”, nunca “não atende”. Com IA gratuita configurada, o modelo só pode citar trechos que existem na página.'],
      ['Como encontro quem decide nas empresas?', 'Em Encontrar quem decide, escreva o cargo e a empresa, por exemplo “quem decide nas distribuidoras de SP que a casa conhece”. A empresa também pode vir pelo nome ou pelo CNPJ (“diretores da Química Alfa”). Suas buscas ficam em “Suas buscas recentes” para repetir com um clique; só você as vê. O agente procura entre as pessoas que a casa já mapeou e mostra, para cada uma, o juízo de cada exigência com a fonte e o caminho pela rede. As empresas que se encaixam e onde ninguém mapeado serve aparecem em “Onde falta quem decide”: abra o plano e registre quem decide, com a fonte. Telefone e e-mail não aparecem.'],
      ['Por que uma ação está indisponível?', 'Algumas tarefas precisam de uma empresa escolhida ou de um texto mínimo. A explicação aparece junto ao botão. Conversa livre e pesquisa web dependem da configuração de IA; pesquisa cadastral e relações funcionam sem ela.'],
      ['Onde encontro o que já fiz?', 'Em Meus trabalhos. Cada pedido executado salva o contexto e a resposta. Abra um trabalho recente para continuar; o rascunho ainda não executado não é salvo ao sair da conta.'],
      ['Um contato cadastrado já pode me apresentar?', 'Não. O titular precisa confirmar a relação e sua disposição. Confira a evidência do caminho e as restrições da empresa antes de abordar.'],
      ['O agente envia mensagens?', 'Não. Ele organiza contexto e prepara sugestões. A decisão de abordar e o envio continuam com a equipe.'],
    ].map(([pergunta, resposta]) => <details key={pergunta} className="agente-pergunta"><summary>{pergunta}</summary><p>{resposta}</p></details>)}</section>
    <button className="agente-link text-sm" onClick={aoExplorar}>Explorar a demonstração de mercado<IconeRede nome="seta" /></button>
  </main>
}
