const termos = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().split(',').map((t) => t.trim()).filter(Boolean);
export function compararTeses(a,b) {
  const criterios = [];
  for (const campo of ['produtos','regioes']) {
    const x = termos(a[campo]), y = termos(b[campo]);
    criterios.push({ criterio: campo, resultado: !x.length || !y.length ? 'não apurado' : x.some((s) => y.includes(s)) ? 'aderente' : 'divergente' });
  }
  const faixas = [a.receitaMin,a.receitaMax,b.receitaMin,b.receitaMax];
  criterios.push({ criterio: 'receita', resultado: faixas.some((n) => n === null || n === undefined) ? 'não apurado'
    : Math.max(a.receitaMin,b.receitaMin) <= Math.min(a.receitaMax,b.receitaMax) ? 'aderente' : 'divergente' });
  criterios.push({ criterio: 'controle', resultado: [a.controle,b.controle].some((s) => !s || s === 'nao_apurado') ? 'não apurado'
    : a.controle === b.controle || [a.controle,b.controle].includes('indiferente') ? 'aderente' : 'divergente' });
  const conhecidos = criterios.filter((c) => c.resultado !== 'não apurado').length;
  return { criterios, cobertura: conhecidos / 4, aderencia: conhecidos ? criterios.filter((c) => c.resultado === 'aderente').length / conhecidos : 0 };
}
export function analisarComparaveis(registros) {
  return registros.map((r) => {
    const d = r.dados, ev = d.ev;
    const calcular = (denominador) => r.revisado && ev !== null && denominador !== null && denominador > 0 ? ev / denominador : null;
    return { id:r.id,empresa:d.empresa,tipo:d.tipo,periodo:d.periodo,fonte:d.fonte,revisado:r.revisado,
      evReceita: calcular(d.receita), evEbitda: calcular(d.ebitda),
      limite: 'Múltiplos descritivos em BRL milhões. Dados não revisados, ausentes ou denominadores não positivos não geram múltiplo. Nenhum valor da empresa-alvo é estimado automaticamente.' };
  });
}
