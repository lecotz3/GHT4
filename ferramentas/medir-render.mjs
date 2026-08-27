/* =============================================================================
 *  GHT4 · QUANTO TRABALHO A TELA ENTREGA AO NAVEGADOR
 * -----------------------------------------------------------------------------
 *  Roda o render() de verdade num DOM simulado e conta o que ele produz:
 *  fichas construidas, nos de DOM criados e MB de HTML gerado.
 *
 *  POR QUE ISTO EXISTE
 *  Quando a base real do CNPJ entrou, com 38.583 empresas, qualquer toque num
 *  filtro congelava a pagina. A causa: render() montava uma ficha por empresa,
 *  1,66 milhao de nos e 80 MB de HTML a cada mexida. A correcao foi limitar a
 *  JANELA de renderizacao — e este arquivo e o que impede a correcao de se
 *  perder numa refatoracao futura sem ninguem perceber.
 *
 *  O QUE ELE NAO MEDE
 *  O custo do navegador de verdade: parse de HTML, layout, paint e memoria.
 *  Esses sao maiores que os numeros daqui. O que ele mede e o TAMANHO DO
 *  TRABALHO que o app entrega ao navegador — que e a parte sob nosso controle.
 *
 *  REFERENCIA medida em 20/08/2026, base CNPJ com 38.583 empresas:
 *    com janela .... 120 fichas ·     5.316 nos ·  0,3 MB
 *    sem janela .... 38.583 fichas · 1.663.278 nos · 80,6 MB
 *
 *  USO
 *    node ferramentas/medir-render.mjs
 * ========================================================================== */

import fs from 'node:fs';
import vm from 'node:vm';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') + '/';
const contador = { nos: 0, innerHTML: 0, chars: 0 };

class Elemento {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.style = { setProperty(){} };
    this.dataset = {}; this._classes = new Set(); this._html = '';
    this.textContent = ''; contador.nos++;
  }
  set className(v){ this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className(){ return [...this._classes].join(' '); }
  get classList(){ const s=this._classes; return {
    add:(...c)=>c.forEach(x=>s.add(x)), remove:(...c)=>c.forEach(x=>s.delete(x)),
    toggle:(c,f)=>{ const on = f===undefined ? !s.has(c) : f; on?s.add(c):s.delete(c); },
    contains:(c)=>s.has(c) }; }
  set innerHTML(v){ this._html = v; contador.innerHTML++; contador.chars += String(v).length;
    /* o navegador cria um nó por tag; aqui a conta é por tag aberta */
    contador.nos += (String(v).match(/<[a-z]/gi) || []).length; }
  get innerHTML(){ return this._html; }
  setAttribute(){} getAttribute(){ return null; }
  addEventListener(){} removeEventListener(){}
  appendChild(n){ this.children.push(n); return n; }
  append(...n){ this.children.push(...n); }
  remove(){}
  querySelector(s){
    /* só o que o código usa: '.cards' dentro da seção recém-criada */
    const busca = (el) => {
      for (const f of el.children) {
        if (f._classes && f._classes.has(s.replace(/^\./,''))) return f;
        const r = busca(f); if (r) return r;
      }
      return null;
    };
    return busca(this) || new Elemento('div');
  }
  querySelectorAll(){ return []; }
  closest(){ return null; }
  focus(){}
}

const documento = {
  createElement:(t)=>new Elemento(t),
  createDocumentFragment:()=>new Elemento('#fragment'),
  querySelector:()=>new Elemento('div'),
  querySelectorAll:()=>[],
  addEventListener(){}, body:new Elemento('body'),
};

const janela = {
  addEventListener(){}, matchMedia:()=>({matches:false, addEventListener(){}, addListener(){}}),
  localStorage:{ getItem:(k)=>/base/i.test(k)?'cnpj':null, setItem(){}, removeItem(){} },
  requestAnimationFrame:(f)=>f(), setTimeout, clearTimeout, console,
  URL:{ createObjectURL:()=>'', revokeObjectURL(){} },
  location:{ href:'file:///index.html', protocol:'file:', search:'', hash:'' },
  history:{ replaceState(){}, pushState(){} },
  getComputedStyle:()=>({ getPropertyValue:()=>'' }),
  Blob: class { constructor(){} },
  alert(){}, print(){},
};
janela.window = janela; janela.document = documento;

const ctx = vm.createContext(Object.assign(janela, {
  document: documento, console, setTimeout, clearTimeout,
  localStorage: janela.localStorage, navigator:{ language:'pt-BR' },
}));

for (const a of ['setores.js','fontes.js','data.js','data-real.js','data-quimicos.js','data-ibama.js',
                 'scoring.js','evidencias.js','conexoes.js','analises.js','mercado.js',
                 'matchmaking.js','crm.js','configuracao.js']) {
  if (!fs.existsSync(RAIZ + a)) continue;
  try { vm.runInContext(fs.readFileSync(RAIZ + a, 'utf8'), ctx, { filename: a }); }
  catch (e) { console.log(`  (${a}: ${e.message})`); }
}

const html = fs.readFileSync(RAIZ + 'index.html', 'utf8');
const corpo = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)][0][1];

/* O script termina chamando render(); precisamos de acesso a ele e ao state,
   então exportamos os dois para o contexto no fim. */
const instrumentado = corpo
  .replace('function cardEl(e){', 'function cardEl(e){ globalThis.__fichas++;')
  /* o corpo e uma IIFE: os ganchos tem que entrar DENTRO dela */
  .replace('  abrirPorHash();', '  globalThis.__render = render; globalThis.__state = state; globalThis.__BASE = () => BASE;');

ctx.__fichas = 0;
try { vm.runInContext(instrumentado, ctx, { filename: 'app-inline' }); }
catch (e) { console.log(`\n  o script parou em: ${e.message}`); }

const BASE = ctx.__BASE ? ctx.__BASE() : [];
console.log(`\nbase carregada na tela: ${BASE.length.toLocaleString('pt-BR')} empresas`);

const rodar = (rot, estender) => {
  ctx.__fichas = 0; contador.nos = 0; contador.innerHTML = 0; contador.chars = 0;
  const t0 = process.hrtime.bigint();
  ctx.__render(estender);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`  ${rot.padEnd(30)} ${String(ctx.__fichas).padStart(6)} fichas · `
    + `${contador.nos.toLocaleString('pt-BR').padStart(9)} nós · `
    + `${(contador.chars/1048576).toFixed(1).padStart(5)} MB de HTML · ${ms.toFixed(0).padStart(5)} ms`);
  return ms;
};

console.log('\nrender completo (o que acontece a cada mexida no filtro):');
rodar('sem filtro nenhum');
ctx.__state.busca = 'quimica';
rodar('busca "quimica"');
ctx.__state.busca = 'distribuidora paulista';
rodar('busca mais estreita');
ctx.__state.busca = '';
ctx.__state.limite = 38583;
rodar('SEM a janela (como era antes)', true);
