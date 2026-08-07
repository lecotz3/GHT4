import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

/**
 * A v1 vive em v1/, mas consome o motor de scoring, a camada de evidência e as
 * duas bases de dados que estão na RAIZ do repositório — os mesmos arquivos que
 * o protótipo carrega por <script>. Isso é deliberado: manter uma fonte só
 * evita que as regras de negócio divirjam entre as duas interfaces.
 *
 * `fs.allow` libera o Vite a servir esses arquivos de fora da pasta do projeto.
 */
// import.meta.dirname (não __dirname): o carregador nativo de config do Vite,
// que passa a ser o padrão numa próxima major, não expõe __dirname.
const RAIZ = path.resolve(import.meta.dirname, '..')

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@dominio': RAIZ,
    },
  },
  server: {
    port: 5173,
    fs: { allow: [RAIZ] },
  },
})
