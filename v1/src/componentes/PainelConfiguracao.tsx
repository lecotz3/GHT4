import { useMemo, useRef, useState } from 'react'
import { configuracao as cfg, motor } from '../dominio'
import type {
  Configuracao,
  Criterio,
  Empresa,
  Papel,
  Template,
} from '../dominio/tipos'

/**
 * Painel de configuração em tempo de uso — Módulos 3.2 e 3.3 do documento.
 *
 * O princípio da seção 1 ("o usuário precisa poder definir/ajustar filtros e
 * pesos no momento da consulta") tem uma consequência de interface que vale
 * declarar: se o usuário pode mudar a régua, ele precisa VER a régua que está
 * valendo. Por isso o painel mostra, o tempo todo, o que foi alterado em
 * relação ao padrão — e o cabeçalho da lista repete isso fora do painel.
 *
 * Configuração sem essa visibilidade produz o pior resultado possível numa
 * reunião: dois sócios olhando rankings diferentes da mesma base, sem saber por
 * quê.
 */

const PAPEIS: Papel[] = ['alvo', 'comprador', 'vendedora']

const ROTULO_PAPEL: Record<Papel, string> = {
  alvo: 'Alvo de aquisição',
  comprador: 'Potencial comprador',
  vendedora: 'Candidata a venda',
}

function novoId() {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export function PainelConfiguracao({
  config,
  aoMudar,
  empresas,
}: {
  config: Configuracao
  aoMudar: (proxima: Configuracao) => void
  empresas: Empresa[]
}) {
  const [papelAberto, setPapelAberto] = useState<Papel>('alvo')
  const [nomeTemplate, setNomeTemplate] = useState('')
  const [templates, setTemplates] = useState<Template[]>(() => cfg.listarTemplates())
  const [avisoPersistencia, setAvisoPersistencia] = useState(false)
  const [erroImportacao, setErroImportacao] = useState('')
  const entradaArquivo = useRef<HTMLInputElement>(null)

  /* Rascunho do critério em construção. Só vira critério de verdade no "Adicionar" —
     um critério pela metade não pode mexer no ranking enquanto é digitado. */
  const [rascunho, setRascunho] = useState<Partial<Criterio>>({
    papel: 'alvo',
    campo: 'conversaoCaixa',
    operador: 'maior_igual',
    peso: 20,
  })

  const ajustes = useMemo(() => cfg.ajustesAplicados(config), [config])

  const campoAtual = rascunho.campo ? cfg.CAMPOS[rascunho.campo] : null
  const operadoresDisponiveis = rascunho.campo ? cfg.operadoresPara(rascunho.campo) : []
  const operadorAtual = operadoresDisponiveis.find((o) => o.chave === rascunho.operador)
  const valoresCategoria = useMemo(
    () => (campoAtual?.tipo === 'categoria' && rascunho.campo ? cfg.valoresDe(rascunho.campo, empresas) : []),
    [campoAtual, rascunho.campo, empresas],
  )

  const camposPorGrupo = useMemo(() => {
    const grupos: Record<string, { chave: string; rotulo: string }[]> = {}
    for (const chave in cfg.CAMPOS) {
      const campo = cfg.CAMPOS[chave]
      ;(grupos[campo.grupo] ??= []).push({ chave, rotulo: campo.rotulo })
    }
    return grupos
  }, [])

  function mudarPeso(papel: Papel, sinal: string, peso: number) {
    aoMudar({
      ...config,
      pesos: { ...config.pesos, [papel]: { ...config.pesos[papel], [sinal]: peso } },
    })
  }

  function adicionarCriterio() {
    if (!rascunho.campo || !rascunho.operador) return
    if (operadorAtual?.precisaValor && (rascunho.valor === undefined || rascunho.valor === '')) return

    const criterio: Criterio = {
      id: novoId(),
      papel: (rascunho.papel as Papel) ?? 'alvo',
      campo: rascunho.campo,
      operador: rascunho.operador,
      valor: rascunho.valor,
      valor2: rascunho.valor2,
      peso: Number(rascunho.peso) || 20,
    }
    aoMudar({ ...config, criterios: [...config.criterios, criterio] })
    setRascunho({ ...rascunho, valor: undefined, valor2: undefined })
  }

  function removerCriterio(id: string) {
    aoMudar({ ...config, criterios: config.criterios.filter((c) => c.id !== id) })
  }

  function restaurarPadrao() {
    aoMudar(cfg.configuracaoPadrao())
  }

  function salvar() {
    if (!nomeTemplate.trim()) return
    const { persistiu } = cfg.salvarTemplate(nomeTemplate.trim(), config)
    setTemplates(cfg.listarTemplates())
    setNomeTemplate('')
    setAvisoPersistencia(!persistiu)
  }

  function aplicar(template: Template) {
    /* Cópia profunda: sem ela, mexer num peso depois de aplicar o template
       editaria o template guardado — o usuário perderia o preset sem perceber. */
    aoMudar(JSON.parse(JSON.stringify(template.configuracao)))
  }

  function remover(id: string) {
    cfg.removerTemplate(id)
    setTemplates(cfg.listarTemplates())
  }

  function exportar(template: Template) {
    const blob = new Blob([cfg.exportarTemplate(template)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ght4-template-${template.nome.replace(/\W+/g, '-').toLowerCase()}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  async function importar(arquivo: File) {
    try {
      cfg.importarTemplate(await arquivo.text())
      setTemplates(cfg.listarTemplates())
      setErroImportacao('')
    } catch (erro) {
      setErroImportacao(erro instanceof Error ? erro.message : 'Arquivo inválido.')
    }
  }

  return (
    <div className="rounded-ficha border border-fio-forte bg-tinta/[0.015] p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Critérios e pesos desta consulta</h2>
          <p className="mt-0.5 max-w-prose text-[11.5px] leading-relaxed text-suave">
            Ajuste a régua sem reprogramar. O índice de cada empresa é a fração dos pontos que ela
            atende — mexer num peso muda o numerador e o denominador juntos.
          </p>
        </div>
        <button
          type="button"
          onClick={restaurarPadrao}
          className="rounded-ficha border border-fio-forte px-2.5 py-1 text-[11px] font-semibold text-suave transition hover:border-tinta-2"
        >
          Restaurar padrão
        </button>
      </div>

      {(ajustes.pesos.length > 0 || ajustes.criterios > 0) && (
        <p className="mb-4 rounded-ficha border border-comprador/40 bg-comprador-fundo px-3 py-2 text-[11.5px] leading-relaxed text-comprador-tinta">
          <b>Configuração alterada:</b> {ajustes.pesos.length} peso
          {ajustes.pesos.length === 1 ? '' : 's'} fora do padrão
          {ajustes.criterios > 0 && `, ${ajustes.criterios} critério${ajustes.criterios === 1 ? '' : 's'} ad hoc`}
          . O ranking abaixo não é comparável com o de outra configuração.
        </p>
      )}

      {/* ---- pesos por papel ---- */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {PAPEIS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPapelAberto(p)}
            className={`rounded-ficha border px-2.5 py-1 text-[11px] font-semibold transition
              ${papelAberto === p
                ? 'border-tinta bg-tinta text-papel'
                : 'border-fio-forte text-suave hover:border-tinta-2'}`}
          >
            {ROTULO_PAPEL[p]}
          </button>
        ))}
      </div>

      <div className="mb-5 grid gap-2 sm:grid-cols-2">
        {Object.keys(config.pesos[papelAberto] ?? {}).map((sinal) => {
          const peso = config.pesos[papelAberto][sinal]
          const padrao = motor.CONFIG_PAPEIS[papelAberto].pesos[sinal] ?? 0
          const mexido = peso !== padrao
          return (
            <label key={sinal} className="flex items-center gap-2.5 text-[11.5px]">
              <span className={`w-44 shrink-0 truncate ${mexido ? 'font-semibold text-tinta' : 'text-suave'}`}>
                {motor.SINAIS[sinal]?.rotulo ?? sinal}
              </span>
              <input
                type="range"
                min={0}
                max={60}
                step={1}
                value={peso}
                onChange={(e) => mudarPeso(papelAberto, sinal, Number(e.target.value))}
                className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-fio-forte accent-tinta"
                aria-label={`Peso de ${motor.SINAIS[sinal]?.rotulo ?? sinal}`}
              />
              <span className={`w-14 shrink-0 text-right tabular-nums ${mexido ? 'font-semibold text-tinta' : 'text-suave'}`}>
                {peso}
                {mexido && <span className="text-[10px] text-suave"> ({padrao})</span>}
              </span>
            </label>
          )
        })}
      </div>

      {/* ---- critérios ad hoc ---- */}
      <div className="border-t border-fio pt-4">
        <h3 className="text-[12.5px] font-semibold">Critérios criados agora</h3>
        <p className="mt-0.5 mb-3 max-w-prose text-[11.5px] leading-relaxed text-suave">
          A regra fica visível e reproduzível — quando a camada de linguagem natural entrar, é esta
          estrutura que ela vai gerar. Empresa que não publicou o dado <b>não</b> conta como atendida.
        </p>

        {config.criterios.length > 0 && (
          <ul className="mb-3 grid gap-1.5">
            {config.criterios.map((c) => {
              const campo = cfg.CAMPOS[c.campo]
              return (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center gap-2 rounded-ficha border border-fio-forte px-2.5 py-1.5 text-[11.5px]"
                >
                  <span className="rounded-ficha bg-tinta/8 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-suave">
                    {ROTULO_PAPEL[c.papel]}
                  </span>
                  <b>{cfg.descreverCriterio(c)}</b>
                  <span className="text-suave">peso {c.peso}</span>
                  <span className="text-[10.5px] text-suave/80">
                    {campo?.fonte}
                    {campo?.proxy && ' · proxy'}
                  </span>
                  <button
                    type="button"
                    onClick={() => removerCriterio(c.id)}
                    className="ml-auto text-[11px] font-semibold text-lacre hover:underline"
                  >
                    remover
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-2 text-[11.5px]">
          <label className="grid gap-1">
            <span className="text-[10.5px] font-semibold text-suave">Papel</span>
            <select
              value={rascunho.papel}
              onChange={(e) => setRascunho({ ...rascunho, papel: e.target.value as Papel })}
              className="rounded-ficha border border-fio-forte bg-papel px-2 py-1"
            >
              {PAPEIS.map((p) => (
                <option key={p} value={p}>{ROTULO_PAPEL[p]}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-[10.5px] font-semibold text-suave">Campo</span>
            <select
              value={rascunho.campo}
              onChange={(e) => {
                const campo = e.target.value
                const ops = cfg.operadoresPara(campo)
                setRascunho({ ...rascunho, campo, operador: ops[0]?.chave, valor: undefined, valor2: undefined })
              }}
              className="rounded-ficha border border-fio-forte bg-papel px-2 py-1"
            >
              {Object.entries(camposPorGrupo).map(([grupo, itens]) => (
                <optgroup key={grupo} label={grupo}>
                  {itens.map((i) => (
                    <option key={i.chave} value={i.chave}>{i.rotulo}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-[10.5px] font-semibold text-suave">Condição</span>
            <select
              value={rascunho.operador}
              onChange={(e) => setRascunho({ ...rascunho, operador: e.target.value })}
              className="rounded-ficha border border-fio-forte bg-papel px-2 py-1"
            >
              {operadoresDisponiveis.map((o) => (
                <option key={o.chave} value={o.chave}>{o.rotulo}</option>
              ))}
            </select>
          </label>

          {operadorAtual?.precisaValor && (
            <label className="grid gap-1">
              <span className="text-[10.5px] font-semibold text-suave">
                Valor {campoAtual?.unidade && `(${campoAtual.unidade})`}
              </span>
              {campoAtual?.tipo === 'categoria' ? (
                <select
                  value={String(rascunho.valor ?? '')}
                  onChange={(e) => setRascunho({ ...rascunho, valor: e.target.value })}
                  className="max-w-52 rounded-ficha border border-fio-forte bg-papel px-2 py-1"
                >
                  <option value="">escolha…</option>
                  {valoresCategoria.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  value={rascunho.valor === undefined ? '' : String(rascunho.valor)}
                  onChange={(e) => setRascunho({ ...rascunho, valor: Number(e.target.value) })}
                  className="w-24 rounded-ficha border border-fio-forte bg-papel px-2 py-1"
                />
              )}
            </label>
          )}

          {operadorAtual?.precisaValor2 && (
            <label className="grid gap-1">
              <span className="text-[10.5px] font-semibold text-suave">e</span>
              <input
                type="number"
                value={rascunho.valor2 === undefined ? '' : String(rascunho.valor2)}
                onChange={(e) => setRascunho({ ...rascunho, valor2: Number(e.target.value) })}
                className="w-24 rounded-ficha border border-fio-forte bg-papel px-2 py-1"
              />
            </label>
          )}

          <label className="grid gap-1">
            <span className="text-[10.5px] font-semibold text-suave">Peso</span>
            <input
              type="number"
              min={0}
              max={100}
              value={rascunho.peso ?? 20}
              onChange={(e) => setRascunho({ ...rascunho, peso: Number(e.target.value) })}
              className="w-20 rounded-ficha border border-fio-forte bg-papel px-2 py-1"
            />
          </label>

          <button
            type="button"
            onClick={adicionarCriterio}
            className="rounded-ficha border border-tinta bg-tinta px-3 py-1.5 text-[11px] font-semibold text-papel transition hover:opacity-90"
          >
            Adicionar critério
          </button>
        </div>

        {campoAtual && (
          <p className="mt-2 text-[11px] text-suave">
            <b>Fonte:</b> {campoAtual.fonte}
            {campoAtual.proxy && (
              <span className="text-lacre">
                {' '}· Proxy: aproxima o conceito, não o mede diretamente.
              </span>
            )}
          </p>
        )}
      </div>

      {/* ---- templates (seção 4.3) ---- */}
      <div className="mt-5 border-t border-fio pt-4">
        <h3 className="text-[12.5px] font-semibold">Templates salvos</h3>
        <p className="mt-0.5 mb-3 max-w-prose text-[11.5px] leading-relaxed text-suave">
          Guarde a combinação inteira com um nome e reaplique nas consultas recorrentes.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={nomeTemplate}
            onChange={(e) => setNomeTemplate(e.target.value)}
            placeholder="ex.: screening padrão agro"
            className="w-56 rounded-ficha border border-fio-forte bg-papel px-2 py-1 text-[11.5px]"
          />
          <button
            type="button"
            onClick={salvar}
            disabled={!nomeTemplate.trim()}
            className="rounded-ficha border border-fio-forte px-2.5 py-1 text-[11px] font-semibold transition hover:border-tinta-2 disabled:opacity-40"
          >
            Salvar configuração atual
          </button>
          <button
            type="button"
            onClick={() => entradaArquivo.current?.click()}
            className="rounded-ficha border border-fio-forte px-2.5 py-1 text-[11px] font-semibold text-suave transition hover:border-tinta-2"
          >
            Importar arquivo
          </button>
          <input
            ref={entradaArquivo}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const arquivo = e.target.files?.[0]
              if (arquivo) importar(arquivo)
              e.target.value = ''
            }}
          />
        </div>

        {avisoPersistencia && (
          <p className="mt-2 text-[11.5px] leading-relaxed text-lacre">
            <b>Salvo só nesta aba.</b> O navegador recusou o armazenamento local — comum ao abrir o
            arquivo por duplo-clique (<code>file://</code>). Use <b>exportar</b> para guardar o
            template em disco.
          </p>
        )}
        {erroImportacao && <p className="mt-2 text-[11.5px] text-lacre">{erroImportacao}</p>}

        {templates.length > 0 ? (
          <ul className="mt-3 grid gap-1.5">
            {templates.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center gap-3 rounded-ficha border border-fio-forte px-2.5 py-1.5 text-[11.5px]"
              >
                <b>{t.nome}</b>
                <span className="text-suave">
                  {t.configuracao.criterios.length} critério
                  {t.configuracao.criterios.length === 1 ? '' : 's'} ad hoc
                </span>
                <span className="text-[10.5px] text-suave/80">
                  {new Date(t.salvoEm).toLocaleDateString('pt-BR')}
                </span>
                <span className="ml-auto flex gap-3">
                  <button type="button" onClick={() => aplicar(t)} className="font-semibold hover:underline">
                    aplicar
                  </button>
                  <button type="button" onClick={() => exportar(t)} className="text-suave hover:underline">
                    exportar
                  </button>
                  <button type="button" onClick={() => remover(t.id)} className="text-lacre hover:underline">
                    remover
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[11.5px] text-suave">Nenhum template salvo ainda.</p>
        )}
      </div>
    </div>
  )
}
