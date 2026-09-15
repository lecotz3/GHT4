import { readFile } from 'node:fs/promises';
import { abrir, fechar } from '../server/src/db/cliente.mjs';
import { migrar } from '../server/src/db/migrar.mjs';
import { importarCatalogo } from '../server/src/agente/importar-catalogo.mjs';
import { prepararAdministrador } from '../server/src/operacao/administrador-inicial.mjs';

// Executado antes do deploy, nunca como chamada pública ou a cada pesquisa.
try {
  if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL do PostgreSQL de destino. Este comando não abre o banco local.');
  const db = await abrir();
  if (db.tipo !== 'postgres') throw new Error('A preparação exige PostgreSQL persistente.');
  const trava = await db.conectar();
  try {
    await trava.query('SELECT pg_advisory_lock(742814)');
    await migrar(db);
    const texto = await readFile(new URL('../data-quimicos.js', import.meta.url), 'utf8');
    const resultado = await importarCatalogo(db, { texto });
    const administrador = await prepararAdministrador(db, process.env);
    console.log(JSON.stringify({ catalogo: resultado, administrador }));
  } finally {
    try { await trava.query('SELECT pg_advisory_unlock(742814)'); } finally { trava.release(); }
  }
} catch (erro) {
  // Não imprimir connection strings ou objetos de conexão em logs de deployment.
  console.error('Falha ao preparar banco e catálogo.', erro.code ?? erro.name);
  process.exitCode = 1;
} finally { await fechar(); }
