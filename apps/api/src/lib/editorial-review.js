const VALID_ORIGINS = ['100% humano', 'Asistido por IA', 'Generado con IA'];

function workflowError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function readProposal(pool, proposalId) {
  const { rows } = await pool.query('SELECT id, title, slug, status, sensibilidad, review_comment FROM content_proposals WHERE id = $1', [proposalId]);
  if (!rows[0]) throw workflowError(404, 'No encontrada');
  return rows[0];
}

async function publishProposal(pool, proposalId, origin) {
  if (!VALID_ORIGINS.includes(origin)) throw workflowError(400, 'Origen del contenido requerido');
  const proposal = await readProposal(pool, proposalId);
  if (proposal.status !== 'en_revision') throw workflowError(409, `Solo aplica cuando el estado es 'en_revision' (actual: '${proposal.status}')`);
  if (!proposal.slug) throw workflowError(400, 'Falta asignar un slug antes de publicar (Editor de nota)');
  if (proposal.sensibilidad === 'rojo' && !proposal.review_comment) {
    throw workflowError(400, 'Revisión documentada requerida para contenido sensible');
  }
  const { rows } = await pool.query(
    `UPDATE content_proposals SET status = 'published', origin = $1, published_at = now(), updated_at = now()
     WHERE id = $2 AND status = 'en_revision' RETURNING *`,
    [origin, proposalId]
  );
  if (!rows[0]) throw workflowError(409, 'La nota ya fue atendida por otro director');
  return rows[0];
}

async function returnProposal(pool, proposalId, comment) {
  if (typeof comment !== 'string' || !comment.trim()) throw workflowError(400, 'Motivo requerido');
  const proposal = await readProposal(pool, proposalId);
  if (proposal.status !== 'en_revision') throw workflowError(409, `Solo aplica cuando el estado es 'en_revision' (actual: '${proposal.status}')`);
  const { rows } = await pool.query(
    `UPDATE content_proposals SET status = 'borrador', review_comment = $1, updated_at = now()
     WHERE id = $2 AND status = 'en_revision' RETURNING *`,
    [comment.trim(), proposalId]
  );
  if (!rows[0]) throw workflowError(409, 'La nota ya fue atendida por otro director');
  return rows[0];
}

module.exports = { VALID_ORIGINS, publishProposal, returnProposal };
