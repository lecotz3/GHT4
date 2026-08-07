/* Formatação pt-BR. Nulo NUNCA vira zero: um indicador ausente é "—", não um
   valor baixo. Confundir os dois foi um bug real do protótipo — `null < 10` é
   verdadeiro em JavaScript, e toda empresa sem margem apurada acendia o sinal
   de "margem baixa". */

export const naoInformado = '—'

export function num(v: number | null | undefined, casas = 0): string {
  if (v === null || v === undefined) return naoInformado
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

export function pct(v: number | null | undefined, casas = 1): string {
  if (v === null || v === undefined) return naoInformado
  return num(v, casas) + '%'
}

export function milhoes(v: number | null | undefined): string {
  if (v === null || v === undefined) return naoInformado
  return `R$ ${num(v)} mi`
}

export function data(iso: string | null | undefined): string {
  if (!iso) return naoInformado
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export function iniciais(nome: string): string {
  return nome
    .replace(/^(Dr\.|Dra\.)\s*/, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
