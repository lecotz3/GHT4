/* =============================================================================
 *  Declarações para os arquivos de domínio da raiz
 * -----------------------------------------------------------------------------
 *  `data.js`, `evidencias.js`, `scoring.js` e `data-real.js` são JavaScript puro,
 *  sem sintaxe de módulo — precisam continuar assim para o protótipo carregá-los
 *  por <script> e rodar em file:// sem build.
 *
 *  São importados aqui só pelo efeito colateral: ao executar, cada um publica sua
 *  parte em `window` (EMPRESAS_DEMO, EVIDENCIA, MOTOR, EMPRESAS_CVM). O contrato
 *  de tipo desses objetos está em src/dominio/tipos.ts; estas declarações apenas
 *  informam ao TypeScript que os módulos existem e não exportam nada.
 * ========================================================================== */

declare module '@dominio/data.js'
declare module '@dominio/data-real.js'
declare module '@dominio/evidencias.js'
declare module '@dominio/scoring.js'
