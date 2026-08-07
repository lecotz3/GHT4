/* =============================================================================
 *  Dossiê — o conteúdo da gaveta
 * -----------------------------------------------------------------------------
 *  A ordem das seções é uma decisão de produto, não de layout: primeiro o que a
 *  empresa é, depois o índice, e só então a evidência que o sustenta — com a
 *  lacuna declarada no mesmo lugar que a fonte, nunca escondida em outra aba.
 *  "Afirmação de um lado, documento do outro."
 * ========================================================================== */

import { evidencia, motor } from '../dominio'
import type { Contribuicao, EmpresaAvaliada, Evidencia, Papel } from '../dominio/tipos'
import { data, iniciais, milhoes, num, pct } from '../formato'
import { BarraLastro, SeloLastro } from './SeloLastro'

const PAPEIS: Papel[] = ['alvo', 'comprador', 'vendedora']

const TINTA_PAPEL: Record<Papel, string> = {
  alvo: 'text-alvo-tinta',
  comprador: 'text-comprador-tinta',
  vendedora: 'text-vendedora-tinta',
}
const MARCA_PAPEL: Record<Papel, string> = {
  alvo: 'bg-alvo',
  comprador: 'bg-comprador',
  vendedora: 'bg-vendedora',
}
const TOM_SINAL: Record<string, string> = {
  positivo: 'bg-alvo-fundo text-alvo-tinta border-alvo/25',
  atencao: 'bg-vendedora-fundo text-vendedora-tinta border-vendedora/25',
  neutro: 'bg-papel-2 text-tinta-2 border-fio',
}

function Secao({
  titulo,
  aparte,
  children,
}: {
  titulo: string
  aparte?: string
  children: React.ReactNode
}) {
  return (
    <section className="border-t border-fio pt-4 first:border-t-0 first:pt-0">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-suave">{titulo}</h3>
        {aparte && <span className="text-[11px] italic text-suave">{aparte}</span>}
      </header>
      {children}
    </section>
  )
}

/** O documento que sustenta um sinal — ou a declaração de que não existe. */
function Fonte({ ev }: { ev: Evidencia | null }) {
  if (!ev || ev.natureza === 'lacuna') {
    return (
      <p className="border-l-2 border-lacre bg-lacre/6 px-3 py-2 text-[11.5px] leading-relaxed text-lacre">
        <b>Sem fonte anexada.</b> {ev?.trecho ?? 'Este sinal pesa no índice, mas nada o documenta.'}
      </p>
    )
  }

  return (
    <div className="border-l-2 border-fio-forte bg-papel-2 px-3 py-2">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[10.5px] text-suave">
        <b className="font-bold text-tinta-2">{ev.veiculo}</b>
        <span>· {ev.tipo}</span>
        {ev.data && <span>· {data(ev.data)}</span>}
        <span>· confiança {ev.confianca}</span>
        {ev.escopo === 'setorial' && (
          <span className="border border-fio-forte px-1 font-semibold">dado setorial</span>
        )}
      </p>
      {ev.titulo && <p className="mt-1 text-[11.5px] font-semibold text-tinta">{ev.titulo}</p>}
      {ev.trecho && (
        <p className="mt-1 text-[11.5px] italic leading-relaxed text-tinta-2">“{ev.trecho}”</p>
      )}
    </div>
  )
}

function LinhaSinal({ c }: { c: Contribuicao }) {
  return (
    <li className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-ficha border px-2 py-1 text-[10.5px] font-semibold ${TOM_SINAL[c.tipo]}`}
        >
          {c.rotulo}
        </span>
        <span className="text-[11px] tabular-nums text-suave">
          peso {c.peso > 0 ? '+' : ''}
          {num(c.peso)}
        </span>
        {c.detalhe && <span className="text-[11.5px] text-tinta-2">{c.detalhe}</span>}
      </div>
      <Fonte ev={c.evidencia} />
    </li>
  )
}

export function Dossie({ e }: { e: EmpresaAvaliada }) {
  const indisponiveis = evidencia.sinaisIndisponiveis(e)
  const principal = e.papeis[e.classificacao]

  const cifras: [string, string][] = [
    ['Receita', milhoes(e.receita)],
    ['Crescimento', pct(e.crescimento)],
    ['Margem EBITDA', pct(e.margemEbitda)],
    ['Funcionários', num(e.funcionarios)],
    ['Praça', `${e.cidade}/${e.uf}`],
    ['Perfil societário', e.perfil],
  ]

  return (
    <div className="space-y-5">
      {/* --- índice, em destaque, com o lastro ao lado e nunca embutido nele --- */}
      <Secao titulo="Índice de priorização">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="leading-none">
            <span className="text-[52px] font-semibold tracking-tight">{e.scorePrincipal}</span>
            <span className="ml-1 text-[13px] text-suave">/100</span>
            <div className={`mt-2 h-[3px] w-16 ${MARCA_PAPEL[e.classificacao]}`} />
          </div>

          <div className="flex-1 space-y-2">
            <span
              className={`inline-flex items-center gap-2 rounded-ficha border-[1.5px] border-current px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.15em] ${TINTA_PAPEL[e.classificacao]}`}
            >
              <i className="size-1.5 rotate-45 bg-current" />
              {motor.CONFIG_PAPEIS[e.classificacao].rotulo}
            </span>
            <SeloLastro chave={e.rotuloLastro.chave} rotulo={e.rotuloLastro.rotulo} />
          </div>
        </div>

        <div className="mt-3">
          <BarraLastro lastro={e.lastroPrincipal} />
        </div>

        <p className="mt-3 border-l-2 border-fio-forte pl-3 text-[11.5px] italic leading-relaxed text-suave">
          Índice ilustrativo de <b>priorização de leitura</b>. Não é recomendação de transação,
          valuation nem previsão de negócio.
        </p>
      </Secao>

      <Secao titulo="O que a empresa faz">
        <p className="text-[13px] leading-relaxed text-tinta-2">{e.oQueFazem}</p>
        {e.situacaoEspecial && (
          <p className="mt-3 border-l-2 border-latao bg-latao/8 px-3 py-2 text-[12px] leading-relaxed text-tinta-2">
            <b>Situação relevante para M&amp;A:</b> {e.situacaoEspecial}
            {e.dataSituacaoEspecial && (
              <span className="text-suave"> · {data(e.dataSituacaoEspecial)}</span>
            )}
          </p>
        )}
      </Secao>

      <Secao titulo="Indicadores">
        <dl className="grid grid-cols-2 overflow-hidden rounded-ficha border border-fio bg-papel-2 text-[11.5px]">
          {cifras.map(([k, v], i) => (
            <div
              key={k}
              className={`flex items-baseline justify-between gap-2 px-3 py-2
                          ${i % 2 === 0 ? 'border-r border-fio' : ''} ${i < cifras.length - 2 ? 'border-b border-fio' : ''}`}
            >
              <dt className="font-semibold text-suave">{k}</dt>
              <dd className="text-right font-semibold tabular-nums text-tinta">{v}</dd>
            </div>
          ))}
        </dl>
        {e.margemObservacao && (
          <p className="mt-2 text-[11px] italic leading-relaxed text-suave">{e.margemObservacao}</p>
        )}
      </Secao>

      {/* --- o mesmo registro vale coisas diferentes conforme o papel --- */}
      <Secao titulo="Índice por papel" aparte="o mesmo registro, três leituras">
        <ul className="space-y-2.5">
          {PAPEIS.map((p) => {
            const r = e.papeis[p]
            const atual = p === e.classificacao
            return (
              <li key={p} className="flex items-center gap-3">
                <span
                  className={`w-[168px] shrink-0 text-[11.5px] ${atual ? 'font-bold text-tinta' : 'text-suave'}`}
                >
                  {motor.CONFIG_PAPEIS[p].rotulo}
                </span>
                <span className="h-2 flex-1 bg-papel-2">
                  <i
                    className={`block h-full ${MARCA_PAPEL[p]} ${atual ? '' : 'opacity-40'}`}
                    style={{ width: `${r.score}%` }}
                  />
                </span>
                <span
                  className={`w-9 shrink-0 text-right text-[12px] tabular-nums ${atual ? 'font-bold text-tinta' : 'text-suave'}`}
                >
                  {r.score}
                </span>
              </li>
            )
          })}
        </ul>
      </Secao>

      <Secao titulo="Sinais e evidência" aparte={`${principal.contribuicoes.length} no papel atual`}>
        {principal.contribuicoes.length === 0 ? (
          <p className="text-[12px] italic text-suave">Nenhum sinal pontuou neste papel.</p>
        ) : (
          <ul className="space-y-4">
            {principal.contribuicoes.map((c) => (
              <LinhaSinal key={c.chave} c={c} />
            ))}
          </ul>
        )}
      </Secao>

      {/* --- o que a base NÃO consegue avaliar: a lista de compras de dados --- */}
      {indisponiveis.length > 0 && (
        <Secao titulo="Não avaliado" aparte="sem fonte disponível">
          <ul className="space-y-1.5">
            {indisponiveis.map((s) => (
              <li key={s.chave} className="flex gap-2 text-[11.5px] leading-relaxed">
                <span className="mt-[7px] size-1 shrink-0 rotate-45 bg-suave" />
                <span>
                  <b className="text-tinta-2">{motor.SINAIS[s.chave]?.rotulo ?? s.chave}</b>
                  <span className="text-suave"> — {s.motivo}</span>
                </span>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      <Secao titulo="Contato" aparte={e.fonteBase === 'cvm' ? 'relações com investidores' : 'fictício'}>
        <div className="flex items-center gap-3 rounded-ficha border border-fio bg-papel-2 p-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-tinta text-[13px] font-semibold text-papel">
            {iniciais(e.contato.nome)}
          </span>
          <div className="min-w-0 text-[12px]">
            <p className="truncate font-bold">
              {e.contato.nome} <span className="font-normal text-suave">· {e.contato.cargo}</span>
            </p>
            <p className="truncate text-[11px] text-tinta-2">
              {e.contato.email ?? 'e-mail não informado'}
              {e.contato.telefone && ` · ${e.contato.telefone}`}
            </p>
          </div>
        </div>
      </Secao>

      <Secao titulo="Transparência dos dados">
        <dl className="space-y-1 text-[11.5px]">
          {[
            ['Origem', e.origem],
            ['Data de referência', data(e.dataAtualizacao)],
            ['Nível de confiança', e.confianca],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="w-[150px] shrink-0 font-semibold text-suave">{k}</dt>
              <dd className="text-tinta-2">{v}</dd>
            </div>
          ))}
        </dl>
      </Secao>
    </div>
  )
}
