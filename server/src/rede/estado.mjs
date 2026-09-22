export async function alterarRede(tx) {
  await tx.query('UPDATE rede_estado SET versao=versao+1 WHERE id=1');
  // Resultados de acesso não são documentos históricos: podem conter contatos
  // retirados. Mantemos a ocorrência e o pedido, mas exigimos uma nova consulta.
  await tx.query(`UPDATE agente_turnos SET resultado=$1::jsonb
    WHERE pedido->>'tarefa'='mapear_acesso' AND resultado->>'redeDesatualizada' IS DISTINCT FROM 'true'`,
  [JSON.stringify({ modo:'assistido', titulo: 'Consulte novamente os caminhos de acesso',
    resumo: 'A rede mudou depois desta consulta. Execute Abrir caminho novamente para usar vínculos e permissões atuais.',
    redeDesatualizada: true, empresas: [], fontes: [], blocos: [], proximas: ['mapear_acesso'] })]);
}

export async function versaoDaRede(db) {
  return (await db.query('SELECT versao FROM rede_estado WHERE id=1')).rows[0].versao;
}
