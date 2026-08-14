import { useMemo, useRef, useState } from 'react'
import { conexoes } from '../dominio'
import type { EmpresaAvaliada, MembroRede } from '../dominio/tipos'
import { milhoes } from '../formato'

/**
 * Módulo 4 — conexões da rede GHT4.
 *
 * A tela tem duas metades porque o módulo tem duas metades: alimentar a rede
 * (material que a casa envia) e consultar o que ela alcança. Sem a primeira, a
 * segunda não existe — e essa dependência precisa ficar óbvia na interface, não
 * escondida atrás de uma lista vazia que parece defeito.
 *
 * A força da conexão NÃO entra sozinha no índice das empresas. Ela está
 * disponível como critério no painel de configuração, e é o sócio que decide
 * quanto vale conhecer alguém lá dentro — coerente com o princípio de que a
 * régua é do usuário, não do programa.
 */

const CORES_NIVEL: Record<string, string> = {
  forte: 'text-alvo-tinta border-alvo/45 bg-alvo-fundo',
  media: 'text-comprador-tinta border-comprador/45 bg-comprador-fundo',
  fraca: 'text-suave border-fio-forte',
  tenue: 'text-suave border-fio',
  nenhuma: 'text-suave border-dashed border-fio',
}

export function Conexoes({
  avaliadas,
  aoAbrirEmpresa,
}: {
  avaliadas: EmpresaAvaliada[]
  aoAbrirEmpresa: (e: EmpresaAvaliada) => void
}) {
  const [rede, setRede] = useState<MembroRede[]>(() => conexoes.membros())
  const [aviso, setAviso] = useState('')
  const [erro, setErro] = useState('')
  const [expandida, setExpandida] = useState<string | null>(null)
  const entradaArquivo = useRef<HTMLInputElement>(null)

  /* `rede` é dependência de verdade, não enfeite — mesma situação de `temReal`
     em App.tsx. `ranquearPorConexao` lê o estado guardado dentro de conexoes.js,
     que é externo ao React; a troca de `rede` é o único aviso que o React recebe
     de que aquele estado mudou. A leitura fica carregada dentro do cálculo, em
     vez de suprimir o aviso do linter, para o próximo leitor não remover a
     dependência achando que sobra. */
  const ranking = useMemo(() => {
    if (rede.length === 0) return []
    return conexoes.ranquearPorConexao(avaliadas)
  }, [avaliadas, rede])

  const nomeaveis = useMemo(
    () => ranking.filter((r) => r.vinculos.some((v) => v.forcaVinculo !== 'fraca')),
    [ranking],
  )

  function recarregar(persistiu: boolean) {
    setRede(conexoes.membros())
    setAviso(persistiu ? '' : 'Rede válida só nesta aba — o navegador recusou o armazenamento local.')
  }

  async function importar(arquivo: File) {
    try {
      const { quantidade, persistiu } = conexoes.importarRede(await arquivo.text(), true)
      recarregar(persistiu)
      setErro('')
      setAviso((a) => a || `${quantidade} membros importados.`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Arquivo inválido.')
    }
  }

  function exportar() {
    const blob = new Blob([conexoes.exportarRede()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'ght4-rede.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <div className="grid gap-6">
      <section>
        <h2 className="text-[15px] font-semibold">Conexões da rede GHT4</h2>
        <p className="mt-0.5 max-w-prose text-[12px] leading-relaxed text-suave">
          Cruza currículos e listas de contatos da casa com as companhias da base. Por decisão de
          escopo, <b>nenhuma busca automatizada</b> é feita — a qualidade do módulo é exatamente a
          qualidade do material carregado aqui.
        </p>
      </section>

      {/* ---- alimentar a rede ---- */}
      <section className="rounded-ficha border border-fio-forte bg-tinta/[0.015] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="text-[12.5px] font-semibold">
            Rede carregada · {rede.length} membro{rede.length === 1 ? '' : 's'}
          </h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => entradaArquivo.current?.click()}
              className="rounded-ficha border border-tinta bg-tinta px-2.5 py-1 text-[11px] font-semibold text-papel transition hover:opacity-90"
            >
              Importar material (JSON)
            </button>
            <button
              type="button"
              onClick={() => recarregar(conexoes.carregarRedeDemonstracao())}
              className="rounded-ficha border border-fio-forte px-2.5 py-1 text-[11px] font-semibold text-suave transition hover:border-tinta-2"
            >
              Carregar rede fictícia
            </button>
            {rede.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={exportar}
                  className="rounded-ficha border border-fio-forte px-2.5 py-1 text-[11px] font-semibold text-suave transition hover:border-tinta-2"
                >
                  Exportar
                </button>
                <button
                  type="button"
                  onClick={() => recarregar(conexoes.limparRede())}
                  className="rounded-ficha border border-fio-forte px-2.5 py-1 text-[11px] font-semibold text-lacre transition hover:border-lacre"
                >
                  Limpar
                </button>
              </>
            )}
          </div>
        </div>

        <input
          ref={entradaArquivo}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const a = e.target.files?.[0]
            if (a) importar(a)
            e.target.value = ''
          }}
        />

        {aviso && <p className="mt-2 text-[11.5px] text-lacre">{aviso}</p>}
        {erro && <p className="mt-2 text-[11.5px] text-lacre">{erro}</p>}

        {rede.length === 0 ? (
          <div className="mt-3 rounded-ficha border border-dashed border-fio-forte px-4 py-6 text-[11.5px] leading-relaxed text-suave">
            <p className="mb-2">
              <b className="text-tinta">Nenhum material carregado.</b> O formato esperado é uma lista
              de membros, cada um com o que a casa souber:
            </p>
            <pre className="overflow-x-auto rounded bg-tinta/6 p-2.5 text-[10.5px] leading-relaxed">
{`[{ "nome": "…", "cargo": "…", "area": "GHT4 Advisory", "uf": "SP",
   "setores": ["Transporte & Logística"],
   "historico": [{ "empresa": "…", "cargo": "…", "de": "2014", "ate": "2018" }],
   "contatos": [{ "nome": "…", "empresa": "…", "cargo": "…", "relacao": "ex-colega" }] }]`}
            </pre>
            <p className="mt-2">
              Use <b>Carregar rede fictícia</b> para ver o módulo funcionando antes de o material
              real chegar — os membros são inventados, as companhias são reais.
            </p>
          </div>
        ) : (
          <ul className="mt-3 grid gap-1">
            {rede.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-fio py-1.5 text-[11.5px] last:border-0"
              >
                <b>{m.nome}</b>
                <span className="text-suave">{m.cargo}</span>
                <span className="rounded-ficha bg-tinta/8 px-1.5 py-0.5 text-[10px] text-suave">{m.area}</span>
                <span className="text-suave">
                  {(m.historico ?? []).length} passagem{(m.historico ?? []).length === 1 ? '' : 's'} ·{' '}
                  {(m.contatos ?? []).length} contato{(m.contatos ?? []).length === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  onClick={() => recarregar(conexoes.removerMembro(m.id))}
                  className="ml-auto text-[11px] font-semibold text-lacre hover:underline"
                >
                  remover
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- o que a rede alcança ---- */}
      {rede.length > 0 && (
        <section>
          <div className="mb-3 flex flex-wrap items-baseline gap-x-4">
            <h3 className="text-[13px] font-semibold">Companhias alcançadas</h3>
            <p className="text-[11.5px] text-suave">
              <b className="text-tinta">{nomeaveis.length}</b> com vínculo nomeável ·{' '}
              {ranking.length - nomeaveis.length} apenas por praça ou cobertura setorial ·{' '}
              {avaliadas.length - ranking.length} sem alcance
            </p>
          </div>

          <p className="mb-3 max-w-prose text-[11.5px] leading-relaxed text-suave">
            A distinção não é cosmética: cobrir o setor e estar na mesma UF casam com quase toda a
            base. Só o vínculo <b>nomeável</b> — contato dentro da companhia, passagem profissional,
            contato no mesmo grupo — encurta o caminho até a conversa.
          </p>

          <div className="grid gap-2">
            {ranking.slice(0, 25).map((r) => (
              <article key={r.empresa.id} className="rounded-ficha border border-fio-forte">
                <button
                  type="button"
                  onClick={() => setExpandida(expandida === r.empresa.id ? null : r.empresa.id)}
                  className="flex w-full items-start gap-4 p-3.5 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <b className="text-[13px]">{r.empresa.nome}</b>
                      <span className={`rounded-ficha border px-1.5 py-0.5 text-[10px] font-semibold ${CORES_NIVEL[r.nivel.chave]}`}>
                        {r.nivel.rotulo}
                      </span>
                      <span className="text-[11px] text-suave">{r.empresa.subsetor}</span>
                      <span className="text-[11px] text-suave">{milhoes(r.empresa.receita)}</span>
                    </span>
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      {r.vinculos.filter((v) => v.pontuou).map((v, i) => (
                        <span
                          key={i}
                          className={`rounded-ficha border px-1.5 py-0.5 text-[10px] ${
                            v.forcaVinculo === 'fraca'
                              ? 'border-dashed border-fio-forte text-suave/70'
                              : 'border-fio-forte text-suave'
                          }`}
                        >
                          {v.rotulo}
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[19px] font-semibold leading-none tabular-nums">{r.forca}</span>
                    <span className="block text-[10px] tracking-wide text-suave">força</span>
                  </span>
                </button>

                {expandida === r.empresa.id && (
                  <div className="border-t border-fio px-3.5 py-3">
                    <p className="mb-2 text-[11px] font-semibold tracking-wide text-suave">
                      Vínculos encontrados — conferir antes da abordagem
                    </p>
                    <ul className="grid gap-1.5">
                      {r.vinculos.map((v, i) => (
                        <li key={i} className="flex flex-wrap items-baseline gap-x-3 text-[11.5px]">
                          <span className="w-52 shrink-0 font-semibold">{v.rotulo}</span>
                          <span>{v.membro}</span>
                          <span className="text-suave">{v.detalhe}</span>
                          <span className="ml-auto text-[10.5px] text-suave/80">
                            {v.fonte}
                            {!v.pontuou && ' · não somou (tipo repetido)'}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => aoAbrirEmpresa(r.empresa)}
                      className="mt-3 rounded-ficha border border-fio-forte px-2.5 py-1 text-[11px] font-semibold transition hover:border-tinta-2"
                    >
                      Abrir dossiê completo
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ---- limitações ---- */}
      <section className="rounded-ficha border border-lacre/30 bg-lacre/[0.06] p-4">
        <h3 className="mb-2 text-[12.5px] font-semibold text-lacre">O que este módulo não alcança</h3>
        <ul className="grid gap-2.5">
          {conexoes.LIMITACOES.map((l) => (
            <li key={l.titulo} className="text-[11.5px] leading-relaxed">
              <b>{l.titulo}.</b> <span className="text-suave">{l.texto}</span>{' '}
              <span className="text-comprador-tinta">Via: {l.viaDeObtencao}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
