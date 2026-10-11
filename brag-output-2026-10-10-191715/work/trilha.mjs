// Trilha e efeitos do vídeo "o agente inteiro", sintetizados do zero (mesma linguagem do vídeo anterior).
// Ré maior, 100 BPM (tempo = 0,6 s; compasso = 2,4 s). Os cortes das cenas caem no tempo.
// Efeitos tocam notas do acorde do momento e ficam abaixo da música.
import { writeFileSync } from 'node:fs';

const SR = 48000, DUR = 45.0, N = Math.round(SR * DUR);
const BEAT = 0.6, BAR = 2.4;
const L = new Float32Array(N), R = new Float32Array(N);
const SL = new Float32Array(N), SRv = new Float32Array(N);
const PL = new Float32Array(N), PR = new Float32Array(N);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const TAU = Math.PI * 2;

let semente = 0x5eed1234;
const rnd = () => { semente |= 0; semente = (semente + 0x6d2b79f5) | 0; let t = Math.imul(semente ^ (semente >>> 15), 1 | semente); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ruido = () => rnd() * 2 - 1;

function soma(t0, dur, gerar, { ganho = 1, pan = 0, envio = 0, alvo = 'seco' } = {}) {
  const i0 = Math.round(t0 * SR), n = Math.round(dur * SR);
  const gl = Math.cos(((pan + 1) * Math.PI) / 4) * ganho, gr = Math.sin(((pan + 1) * Math.PI) / 4) * ganho;
  const [AL, AR] = alvo === 'pad' ? [PL, PR] : [L, R];
  for (let i = 0; i < n; i++) {
    const j = i0 + i; if (j < 0 || j >= N) continue;
    const s = gerar(i / SR);
    AL[j] += s * gl; AR[j] += s * gr;
    if (envio) { SL[j] += s * gl * envio; SRv[j] += s * gr * envio; }
  }
}

/* ---------- harmonia ---------- */
const ACORDES = {
  D: { baixo: 38, voz: [57, 62, 66, 69, 74], arp: [62, 69, 74, 66, 69, 74, 66, 69] },
  Bm: { baixo: 35, voz: [59, 62, 66, 71], arp: [59, 66, 71, 62, 66, 71, 62, 66] },
  G: { baixo: 31, voz: [55, 59, 62, 67, 69], arp: [55, 62, 67, 59, 62, 67, 69, 62] },
  A: { baixo: 33, voz: [57, 61, 64, 69], arp: [57, 64, 69, 61, 64, 69, 61, 64] },
  Dfim: { baixo: 38, voz: [50, 57, 64, 66, 69, 74], arp: [] },
};
const CICLO = ['D', 'Bm', 'G', 'A'];
const GRADE = [];
for (let k = 0; k * BAR < 38.4 - 1e-6; k++) GRADE.push([k * BAR, CICLO[k % 4]]);
GRADE.push([38.4, 'G'], [39.6, 'A'], [40.8, 'Dfim']);
const fimDe = (i) => (i + 1 < GRADE.length ? GRADE[i + 1][0] : DUR);
const acordeEm = (t) => ACORDES[GRADE[GRADE.findLastIndex(([t0]) => t0 <= t + 1e-6)][1]];

/* ---------- instrumentos ---------- */
const piano = (f, vel = 1) => (t) => {
  const ind = 1.1 * Math.exp(-t * 6) + 0.12;
  const env = (1 - Math.exp(-t * 300)) * Math.exp(-t * 2.4);
  return vel * env * (Math.sin(TAU * f * t + ind * Math.sin(TAU * f * t)) + 0.12 * Math.exp(-t * 5) * Math.sin(TAU * 2 * f * t));
};
const pluck = (f) => (t) => (1 - Math.exp(-t * 900)) * Math.exp(-t * 8) * (Math.sin(TAU * f * t) + 0.3 * Math.exp(-t * 14) * Math.sin(TAU * 2 * f * t) + 0.08 * Math.exp(-t * 20) * Math.sin(TAU * 3 * f * t));
const sino = (f) => (t) => (1 - Math.exp(-t * 700)) * Math.exp(-t * 1.3) * Math.sin(TAU * f * t + 1.6 * Math.exp(-t * 2.5) * Math.sin(TAU * 3.5 * f * t));
function padNota(t0, dur, m, ganho) {
  const f = mtof(m), det = [-0.07, 0, 0.07].map((c) => f * Math.pow(2, c / 12));
  const fases = [rnd(), rnd(), rnd()];
  const ataque = 0.7, sol = 1.0;
  soma(t0, dur + sol, (t) => {
    const env = Math.min(1, t / ataque) * (t > dur ? Math.max(0, 1 - (t - dur) / sol) : 1);
    let s = 0;
    for (let k = 0; k < 3; k++) { const ph = (fases[k] + det[k] * t) % 1; s += 2 * ph - 1; }
    return (s / 3) * env;
  }, { ganho, pan: (m % 5 - 2) * 0.18, alvo: 'pad' });
}
const baixo = (f) => (t) => { const env = (1 - Math.exp(-t * 400)) * Math.exp(-t * 3.2); const x = Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * 2 * f * t); return Math.tanh(1.4 * x) * env; };
function bumbo(t0, ganho = 1) {
  let fase = 0;
  soma(t0, 0.45, (t) => { const f = 46 + 95 * Math.exp(-t * 32); fase += f / SR; return Math.sin(TAU * fase) * Math.exp(-t * 8.5) + 0.25 * ruido() * Math.exp(-t * 400); }, { ganho });
}
function chimbal(t0, ganho, pan) {
  let a = 0, b = 0;
  soma(t0, 0.09, (t) => { const x = ruido(); const h1 = x - a; a = x; const h2 = h1 - b; b = h1; return h2 * Math.exp(-t * 70); }, { ganho, pan });
}
function estalo(t0, ganho) {
  let lp = 0;
  soma(t0, 0.3, (t) => { lp += 0.35 * (ruido() - lp); return (lp * 2.2 * Math.exp(-t * 26) + 0.4 * Math.sin(TAU * 196 * t) * Math.exp(-t * 40)); }, { ganho, envio: 0.6 });
}
function sopro(t0, dur, ganho, f0 = 500, f1 = 3500, pan = 0) {
  let lp1 = 0, lp2 = 0;
  soma(t0, dur, (t) => {
    const p = t / dur, fc = f0 * Math.pow(f1 / f0, p), a = 1 - Math.exp((-TAU * fc) / SR);
    lp1 += a * (ruido() - lp1); lp2 += a * (lp1 - lp2);
    return lp2 * Math.pow(Math.sin(Math.PI * p), 1.6) * 2.4;
  }, { ganho, pan, envio: 0.35 });
}
function tecla(t0, ganho) {
  let a = 0, lp = 0; const f = 1800 + rnd() * 900;
  soma(t0, 0.035, (t) => { const x = ruido(); const h = x - a; a = x; lp += 0.5 * (h - lp); return lp * Math.exp(-t * 180) + 0.15 * Math.sin(TAU * f * t) * Math.exp(-t * 260); }, { ganho, pan: rnd() * 0.5 - 0.25 });
}
function clique(t0, ganho) {
  soma(t0, 0.05, (t) => 0.6 * ruido() * Math.exp(-t * 600) + Math.sin(TAU * 1250 * t) * Math.exp(-t * 120), { ganho });
}
function estrondo(t0, ganho) {
  let fase = 0, lp = 0;
  soma(t0, 2.6, (t) => { const f = 36 + 26 * Math.exp(-t * 5); fase += f / SR; lp += 0.02 * (ruido() - lp); return Math.sin(TAU * fase) * Math.exp(-t * 1.6) + lp * 3 * Math.exp(-t * 4); }, { ganho, envio: 0.25 });
}
// Nota de destaque: um tom do acorde do momento, uma oitava acima.
const destaque = (t, ganho = 0.05, pan = 0.25) => { const c = acordeEm(t); soma(t, 0.9, pluck(mtof(c.voz[c.voz.length - 1] + 12)), { ganho, pan, envio: 0.45 }); };

/* ---------- música ---------- */
GRADE.forEach(([t0, nome], i) => {
  const c = ACORDES[nome], fim = fimDe(i);
  const gPad = nome === 'Dfim' ? 0.05 : t0 < 4.8 ? 0.03 : 0.038;
  c.voz.forEach((m) => padNota(t0, fim - t0, m, gPad));
});
// gancho: acordes de piano espaçados, sob a digitação
[[0.02, 'D'], [2.4, 'Bm']].forEach(([t0, n]) => ACORDES[n].voz.slice(0, 4).forEach((m, k) => soma(t0 + k * 0.018, 2.4, piano(mtof(m), 0.15), { pan: (k - 1.5) * 0.2, envio: 0.4 })));
// arpejo em colcheias da revelação até a subida do desfecho
for (let t = 4.8; t < 40.19; t += BEAT / 2) {
  const i = GRADE.findLastIndex(([t0]) => t0 <= t + 1e-6), c = ACORDES[GRADE[i][1]];
  const passo = Math.round((t - GRADE[i][0]) / (BEAT / 2)) % 8;
  const acento = passo % 4 === 0 ? 1 : 0.72;
  soma(t, 1.2, piano(mtof(c.arp[passo] + 12), 0.1 * acento), { pan: passo % 2 ? 0.3 : -0.3, envio: 0.45 });
}
// baixo e bateria: entram na revelação; chimbal e caixa nas funcionalidades
for (let t = 4.8; t < 40.2; t += BEAT) {
  const c = acordeEm(t);
  const tempo = Math.round(((t - 4.8) % BAR) / BEAT) % 4;
  if (tempo === 0 || tempo === 2) { soma(t, 0.9, baixo(mtof(c.baixo)), { ganho: 0.25 }); bumbo(t, 0.4); }
  if (tempo === 3) soma(t + BEAT / 2, 0.35, baixo(mtof(c.baixo + 7)), { ganho: 0.15 });
  if (t >= 8.4 - 1e-6) {
    chimbal(t + BEAT / 2, 0.045, 0.25);
    if (tempo === 1 || tempo === 3) estalo(t, 0.065);
  }
}
// subida para o desfecho
sopro(39.6, 1.25, 0.11, 300, 6000);
// desfecho: estrondo, acorde aberto e sino
estrondo(40.8, 0.42);
ACORDES.Dfim.voz.forEach((m, k) => soma(40.8 + k * 0.02, 3.8, piano(mtof(m), 0.17), { pan: (k - 2.5) * 0.16, envio: 0.55 }));
soma(40.8, 2.4, baixo(mtof(38)), { ganho: 0.22 });
[[40.8, 86], [41.1, 81], [41.4, 78], [41.7, 81]].forEach(([t, m]) => soma(t, 2.8, sino(mtof(m)), { ganho: 0.07, pan: 0.15, envio: 0.6 }));

/* ---------- efeitos (sincronizados com stage.html) ---------- */
for (let t = 0.48; t < 2.35; t += 0.055 + rnd() * 0.045) tecla(t, 0.065);      // digitação do gancho
clique(2.62, 0.12);
sopro(2.85, 0.5, 0.05, 400, 2600, -0.2);                                        // o resultado sobe
destaque(3.4, 0.07);                                                            // anel no 257
sopro(4.75, 0.6, 0.07, 350, 3200, 0);                                           // revelação
[67, 71, 74, 79, 71, 74, 79, 83].forEach((m, k) => soma(5.75 + k * 0.11, 0.8, pluck(mtof(m + 12)), { ganho: 0.06, pan: (k % 4 - 1.5) * 0.18, envio: 0.4 }));
for (const t of [8.4, 12.6, 16.8, 21.0, 25.2, 29.4, 33.6]) sopro(t - 0.12, 0.42, 0.035, 500, 3000, 0.2);  // cortes
for (let t = 8.6; t < 9.62; t += 0.05 + rnd() * 0.04) tecla(t, 0.05);           // digitação da tese
clique(9.8, 0.11);
for (const t of [10.2, 11.6, 13.8, 17.5, 19.4, 22.0, 23.5, 24.35, 25.6, 27.5, 28.3, 29.9, 30.8, 31.9, 34.3]) destaque(t, 0.042);  // anéis
clique(22.32, 0.1);
clique(26.85, 0.11);
sopro(26.95, 0.5, 0.045, 600, 4200, -0.25);                                     // a IA lê
sopro(37.15, 0.55, 0.05, 300, 2400, 0.25);                                      // o telefone entra
sopro(38.95, 0.4, 0.035, 500, 2600, 0.2);
sopro(40.38, 0.72, 0.13, 250, 5000, 0);                                         // a diagonal

/* ---------- pad filtrado ---------- */
for (const B of [PL, PR]) {
  let a = 0, b = 0; const k = 1 - Math.exp((-TAU * 1100) / SR);
  for (let i = 0; i < N; i++) { a += k * (B[i] - a); b += k * (a - b); B[i] = b; }
}
for (let i = 0; i < N; i++) { L[i] += PL[i]; R[i] += PR[i]; SL[i] += PL[i] * 0.4; SRv[i] += PR[i] * 0.4; }

/* ---------- reverb (Freeverb reduzido) ---------- */
function reverb(entrada, espalha) {
  const esc = SR / 44100, combs = [1116, 1188, 1277, 1356, 1422, 1491].map((d) => Math.round((d + espalha) * esc));
  const aps = [556, 441, 341].map((d) => Math.round((d + espalha) * esc));
  const saida = new Float32Array(N);
  for (const d of combs) {
    const buf = new Float32Array(d); let idx = 0, filt = 0;
    for (let i = 0; i < N; i++) { const y = buf[idx]; filt = y * 0.7 + filt * 0.3; buf[idx] = entrada[i] * 0.015 + filt * 0.84; saida[i] += y; idx = (idx + 1) % d; }
  }
  for (const d of aps) {
    const buf = new Float32Array(d); let idx = 0;
    for (let i = 0; i < N; i++) { const b = buf[idx]; const y = -saida[i] + b; buf[idx] = saida[i] + b * 0.5; saida[i] = y; idx = (idx + 1) % d; }
  }
  return saida;
}
const WL = reverb(SL, 0), WR = reverb(SRv, 23);

/* ---------- mix e master ---------- */
let pico = 0;
const outL = new Float32Array(N), outR = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fade = Math.min(1, t / 0.03) * (t > 44.1 ? Math.max(0, 1 - (t - 44.1) / 0.9) : 1);
  outL[i] = Math.tanh((L[i] + WL[i] * 0.9) * 1.1) * fade;
  outR[i] = Math.tanh((R[i] + WR[i] * 0.9) * 1.1) * fade;
  pico = Math.max(pico, Math.abs(outL[i]), Math.abs(outR[i]));
}
const norm = 0.89 / pico;
const wav = Buffer.alloc(44 + N * 4);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + N * 4, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(SR, 24);
wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, outL[i] * norm)) * 32767), 44 + i * 4);
  wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, outR[i] * norm)) * 32767), 46 + i * 4);
}
writeFileSync(new URL('./trilha.wav', import.meta.url), wav);
console.log(`trilha.wav: ${DUR}s, pico antes da normalização ${pico.toFixed(3)}, ganho ${norm.toFixed(2)}`);
