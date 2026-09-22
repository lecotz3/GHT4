import type { ReactNode } from 'react'

const desenhos = {
  casa: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/></>,
  pasta: <path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/>,
  ajuda: <><circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 0c0 2-3 2-3 4m0 4h.01"/></>,
  sair: <><path d="M9 4H4v16h5m4-8h8m-4-4 4 4-4 4"/></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
  fechar: <path d="m6 6 12 12M6 18 18 6"/>,
  brilho: <><path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3Z"/></>,
  agenda: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-14 4h3m4 0h3"/></>,
  painel: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  pessoas: <><circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3"/></>,
  empresa: <><rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h1m4 0h1M9 11h1m4 0h1M10 21v-5h4v5"/></>,
  rede: <><circle cx="5" cy="12" r="3"/><circle cx="18" cy="5" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8 10 7-4M8 14l7 4"/></>,
  verificar: <><path d="m12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7l8-4Z"/><path d="m8 12 3 3 5-6"/></>,
  importar: <><path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/></>,
  seta: <path d="M4 12h16m-6-6 6 6-6 6"/>,
  voltar: <path d="M20 12H4m6-6-6 6 6 6"/>,
  busca: <><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>,
  mais: <path d="M12 4v16M4 12h16"/>,
  tempo: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  certo: <path d="m5 12 4 4L19 6"/>,
} satisfies Record<string, ReactNode>

export function IconeRede({ nome, className = '' }: { nome: keyof typeof desenhos; className?: string }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 ${className}`}>{desenhos[nome]}</svg>
}
