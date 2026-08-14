import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
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

/**
 * data-real.js NÃO passa pelo bundler — é servido e copiado como ativo estático.
 *
 * Motivo: é DADO gerado (~1 MB, 537 companhias da CVM), não código. Como módulo,
 * virava um chunk de 991 kB e o Vite avisava "chunk maior que 500 kB, considere
 * code-splitting" — conselho que não se aplica, porque o arquivo já era um chunk
 * próprio carregado sob demanda. Subir o `chunkSizeWarningLimit` calaria o aviso
 * também para o código da aplicação, e o limite voltaria a estourar no dia em que
 * o importador da CVM trouxesse mais empresas. Como ativo, o arquivo sai da
 * contabilidade de chunks de vez e o limite de 500 kB continua vigiando o que
 * interessa.
 *
 * Efeito colateral bem-vindo: o mesmo <script src="data-real.js"> do protótipo
 * passa a ser o mecanismo das duas interfaces.
 *
 * O arquivo é gerado por `node ferramentas/importar-cvm.mjs` e pode legitimamente
 * não existir num clone novo — por isso a ausência responde 404 (dev) ou apenas
 * não emite nada (build), nunca quebra. Quem carrega trata a falha.
 */
function baseRealComoAtivo(): Plugin {
  const ARQUIVO = path.join(RAIZ, 'data-real.js')
  const ROTA = '/data-real.js'

  return {
    name: 'ght4-base-real-como-ativo',

    configureServer(server) {
      server.middlewares.use(ROTA, (_req, res) => {
        if (!fs.existsSync(ARQUIVO)) {
          /* 404 explícito em vez de next(): o fallback de SPA devolveria o
             index.html com status 200, e o <script> engasgaria com HTML em vez
             de simplesmente falhar. */
          res.statusCode = 404
          res.end()
          return
        }
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
        fs.createReadStream(ARQUIVO).pipe(res)
      })
    },

    generateBundle() {
      if (!fs.existsSync(ARQUIVO)) return
      /* Nome fixo, sem hash: a URL é montada em tempo de execução por quem
         injeta o <script>, então não há como um hash ser conhecido lá. */
      this.emitFile({
        type: 'asset',
        fileName: 'data-real.js',
        source: fs.readFileSync(ARQUIVO),
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), baseRealComoAtivo()],
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
