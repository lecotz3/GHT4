/* Validador de paleta — contraste WCAG, ΔE (CIE76 sobre Lab) e simulação de
   daltonismo (Brettel/Viénot machado-style matrices).
   Reproduz os pisos que o projeto já documentava:
     · contraste ≥ 3:1 para cor de marca sobre superfície (componente de UI)
     · contraste ≥ 4.5:1 para cor de texto sobre superfície (corpo pequeno)
     · ΔE ≥ 15 entre papéis, em visão normal E em cada tipo de daltonismo     */

const hex = (h) => {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (rgb) => { const [r, g, b] = rgb.map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contraste = (a, b) => {
  const [l1, l2] = [lum(hex(a)), lum(hex(b))].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

const lab = (rgbArr) => {
  const [r, g, b] = rgbArr.map(lin);
  let x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  let y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 1.0;
  let z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  [x, y, z] = [f(x), f(y), f(z)];
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
const deltaE = (a, b) => {
  const [l1, a1, b1] = lab(a), [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
};

/* Simulação de daltonismo — matrizes LMS (Viénot, Brettel & Mollon 1999) */
const MAT = {
  protanopia:   [[0.0, 2.02344, -2.52581], [0, 1, 0], [0, 0, 1]],
  deuteranopia: [[1, 0, 0], [0.494207, 0.0, 1.24827], [0, 0, 1]],
  tritanopia:   [[1, 0, 0], [0, 1, 0], [-0.395913, 0.801109, 0.0]],
};
const RGB2LMS = [[17.8824, 43.5161, 4.11935], [3.45565, 27.1554, 3.86714], [0.0299566, 0.184309, 1.46709]];
const LMS2RGB = [[0.080944, -0.130504, 0.116721], [-0.0102485, 0.0540194, -0.113615], [-0.000365294, -0.00412163, 0.693513]];
const mul = (m, v) => m.map((row) => row.reduce((s, k, i) => s + k * v[i], 0));
const simular = (h, tipo) => {
  const rgb = hex(h);
  const out = mul(LMS2RGB, mul(MAT[tipo], mul(RGB2LMS, rgb)));
  return out.map((c) => Math.max(0, Math.min(255, c)));
};

/* ------------------------------ a paleta proposta ------------------------- */
const SUPERFICIES = { branco: '#FFFFFF', nevoa: '#ECEFF1', ficha: '#F7F8F9' };

const MARCA = {              // barras, selos, blocos de cor — piso 3:1
  alvo:       '#FF6E00',
  comprador:  '#0F4C81',
  vendedora:  '#111111',
  inferido:   '#C0392F',
};
const TEXTO = {              // rótulos e carimbos em corpo pequeno — piso 4.5:1
  alvo:       '#9A4200',
  comprador:  '#0F4C81',
  vendedora:  '#111111',
  suave:      '#6B6B6B',
  tinta:      '#111111',
};

let falhas = 0;
const linha = (ok, txt) => { if (!ok) falhas++; console.log(`  ${ok ? 'ok  ' : 'FALHA'} ${txt}`); };

/* Laranja da marca não alcança 3:1 sobre superfície clara — nenhum laranja
   vivo alcança. Escurecê-lo seria deixar de usar a cor da GHT4. A norma mede a
   PERCEPÇÃO DO LIMITE do componente, então a forma ganha um fio da mesma
   família (--alvo-tinta) e é esse fio que responde pelo contraste. Regra de
   uso: preenchimento laranja sobre claro SEMPRE com o fio. */
const CONTORNO = { alvo: '#9A4200' };

console.log('\n=== 1. Cor de MARCA sobre as superfícies (piso 3:1) ===');
for (const [nome, cor] of Object.entries(MARCA))
  for (const [sn, sc] of Object.entries(SUPERFICIES)) {
    const limite = CONTORNO[nome] ?? cor;               // quem define a borda
    const c = contraste(limite, sc);
    const nota = CONTORNO[nome] ? ` (via fio ${limite}; preenchimento ${cor} a ${contraste(cor, sc).toFixed(2)}:1)` : '';
    linha(c >= 3, `${nome.padEnd(10)} ${cor} sobre ${sn.padEnd(7)} ${sc}  ${c.toFixed(2)}:1${nota}`);
  }

console.log('\n=== 1b. Laranja da marca sobre preto (uso sem fio) ===');
linha(contraste('#FF6E00', '#000000') >= 3, `alvo       #FF6E00 sobre preto   #000000  ${contraste('#FF6E00', '#000000').toFixed(2)}:1`);

console.log('\n=== 2. Cor de TEXTO sobre as superfícies (piso 4.5:1) ===');
for (const [nome, cor] of Object.entries(TEXTO))
  for (const [sn, sc] of Object.entries(SUPERFICIES)) {
    const c = contraste(cor, sc);
    linha(c >= 4.5, `${nome.padEnd(10)} ${cor} sobre ${sn.padEnd(7)} ${sc}  ${c.toFixed(2)}:1`);
  }

console.log('\n=== 3. Separação entre os papéis (ΔE ≥ 15) ===');
const papeis = ['alvo', 'comprador', 'vendedora'];
const pares = [['alvo', 'comprador'], ['alvo', 'vendedora'], ['comprador', 'vendedora']];
for (const visao of ['normal', 'protanopia', 'deuteranopia', 'tritanopia']) {
  console.log(`  — ${visao}`);
  for (const [a, b] of pares) {
    const ca = visao === 'normal' ? hex(MARCA[a]) : simular(MARCA[a], visao);
    const cb = visao === 'normal' ? hex(MARCA[b]) : simular(MARCA[b], visao);
    const d = deltaE(ca, cb);
    linha(d >= 15, `    ${a} × ${b}`.padEnd(30) + `ΔE ${d.toFixed(1)}`);
  }
}

console.log('\n=== 4. Escala de cinza (o teste da impressão P&B) ===');
for (const p of papeis) {
  const L = lab(hex(MARCA[p]))[0];
  console.log(`  ${p.padEnd(10)} L* ${L.toFixed(1)}`);
}
const Ls = papeis.map((p) => lab(hex(MARCA[p]))[0]).sort((a, b) => a - b);
for (let i = 1; i < Ls.length; i++)
  linha(Ls[i] - Ls[i - 1] >= 15, `    degrau L* ${(Ls[i] - Ls[i - 1]).toFixed(1)}`);

console.log(`\n${falhas === 0 ? '✔ paleta aprovada' : `✘ ${falhas} falha(s)`}\n`);
process.exit(falhas === 0 ? 0 : 1);
