import { createContext, useContext } from 'react'

/** Abre a ficha única de uma empresa de qualquer ponto do agente, sem repassar a função por props. */
export const FichaContexto = createContext<(empresaId: string) => void>(() => {})
export const useAbrirFicha = () => useContext(FichaContexto)
