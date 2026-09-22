/** Leitor limitado de CSV: aspas, quebras internas, BOM e ; ou ,. Nunca executa conteúdo. */
export function lerCsvRede(texto: string, separador: ',' | ';' = ','): string[][] {
  if (texto.length > 2_000_000) throw new Error('Use arquivos de até 2 MB.');
  const linhas: string[][] = []
  let linha: string[] = [], valor = '', aspas = false, fechou = false
  const entrada = texto.replace(/^\uFEFF/, '')
  for (let i = 0; i <= entrada.length; i++) {
    const c = entrada[i]
    if (aspas) {
      if (c === undefined) throw new Error('Há um campo com aspas sem fechamento.')
      if (c === '"') {
        if (entrada[i + 1] === '"') { valor += '"'; i++ } else { aspas = false; fechou = true }
      } else valor += c
    } else if (c === '"' && !valor && !fechou) aspas = true
    else if (c === separador || c === '\n' || c === '\r' || c === undefined) {
      linha.push(valor.trim()); valor = ''; fechou = false
      if (c !== separador) {
        if (linha.some(Boolean)) linhas.push(linha)
        linha = []
        if (c === '\r' && entrada[i + 1] === '\n') i++
        if (linhas.length > 550) throw new Error('Divida a seleção em arquivos de até 500 contatos.')
      }
    } else {
      if (fechou && c.trim()) throw new Error('Há texto depois do fechamento de aspas.')
      if (c === '"') throw new Error('Aspas internas precisam estar duplicadas dentro de um campo entre aspas.')
      if (!fechou) valor += c
    }
  }
  return linhas
}

export const camposRede = ['nome', 'sobrenome', 'cargo', 'organizacao', 'empresaId', 'email', 'telefone', 'linkedin', 'evidencia'] as const
export type CampoRede = typeof camposRede[number]
export const rotulosRede: Record<CampoRede,string> = { nome:'Nome', sobrenome:'Sobrenome (se separado)', cargo:'Cargo', organizacao:'Empresa',
  empresaId:'CNPJ ou raiz do CNPJ', email:'E-mail', telefone:'Telefone', linkedin:'LinkedIn', evidencia:'Como o titular conhece a pessoa' }
const normalizar = (s: string) => s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim()
const apelidos: Record<CampoRede,string[]> = { nome:['nome','name','first name','nome completo'],sobrenome:['sobrenome','last name'],cargo:['cargo','position','title'],
  organizacao:['empresa','organizacao','company'],empresaId:['cnpj','cnpj raiz','empresaid'],email:['email','e-mail','email address'],telefone:['telefone','phone'],
  linkedin:['linkedin','url','profile url'],evidencia:['evidencia','relacao','como conhece'] }
export function mapearCabecalho(cabecalho: string[]): Record<CampoRede,number> {
  return Object.fromEntries(camposRede.map((c) => [c,cabecalho.findIndex((h) => apelidos[c].includes(normalizar(h)))])) as Record<CampoRede,number>
}
export function empresaDoCsv(valor: string): string | null {
  if (!valor.trim()) return null
  const numeros = valor.replace(/^cnpj/i,'').replace(/[.\-/\s]/g,'')
  if (!/^\d{8}$|^\d{14}$/.test(numeros)) throw new Error('Informe CNPJ com 14 dígitos ou raiz com 8 dígitos.')
  return `cnpj${numeros.slice(0,8)}`
}
