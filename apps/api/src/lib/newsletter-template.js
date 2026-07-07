// Template del newsletter "Buenos días, Perote". Estructura fija según
// crea_web/docs/updates/CREA_Newsletter_Podcast.md: saludo, clima, nota del día,
// en breve, dato del día, agenda, cierre, patrocinador. HTML con estilos inline
// (requisito de clientes de correo, no se puede usar tokens.css aquí).

const COLORS = {
  paper: '#ECEAE2',
  ink: '#1F2A22',
  stone: '#6B6A60',
  pine: '#2F5233',
  ochre: '#C77D2E',
  line: '#C9C6B8',
};

function esc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// data: { weekday, date, clima, notaDelDia: {titulo, cuerpo}, enBreve: [str],
//         datoDelDia, agenda, patrocinador: {nombre, copy, link} | null }
function renderNewsletterHtml(data) {
  const enBreveHtml = (data.enBreve || [])
    .map((item) => `<li style="margin:0 0 8px;line-height:1.5;">${esc(item)}</li>`)
    .join('');

  const patrocinadorHtml = data.patrocinador
    ? `<tr><td style="padding:16px 24px;background:${COLORS.paper};border-top:1px solid ${COLORS.line};font-size:12px;color:${COLORS.stone};">
        <strong style="color:${COLORS.ink};">Buenos días, Perote</strong> es presentado por
        <a href="${esc(data.patrocinador.link || '#')}" style="color:${COLORS.ochre};font-weight:600;text-decoration:none;">${esc(data.patrocinador.nombre)}</a>.
        ${esc(data.patrocinador.copy || '')}
      </td></tr>`
    : '';

  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${COLORS.paper};font-family:Georgia,'Roboto Slab',serif;color:${COLORS.ink};">
  <!-- Preheader: resumen que el cliente muestra en la vista previa de la bandeja,
       oculto en el cuerpo. Sin esto el preview arranca con "Buenos días, Perote. Hoy es…". -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${COLORS.paper};opacity:0;">${esc(data.notaDelDia.titulo)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.paper};padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:24px 24px 16px;background:${COLORS.pine};">
          <p style="margin:0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#DCE6D6;">CREA Contenidos</p>
          <h1 style="margin:6px 0 0;font-size:22px;color:#fff;font-family:Georgia,'Roboto Slab',serif;">Buenos días, Perote</h1>
        </td></tr>
        <tr><td style="padding:20px 24px 0;font-size:15px;line-height:1.6;font-family:Inter,Arial,sans-serif;">
          Buenos días, Perote. Hoy es ${esc(data.weekday)} ${esc(data.date)}. Esto es lo que necesitas saber.
        </td></tr>
        <tr><td style="padding:16px 24px 0;font-family:Inter,Arial,sans-serif;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.06em;color:${COLORS.ochre};">EL CLIMA</p>
          <p style="margin:0;font-size:14px;line-height:1.5;color:${COLORS.ink};">${esc(data.clima)}</p>
        </td></tr>
        <tr><td style="padding:20px 24px 0;font-family:Inter,Arial,sans-serif;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.06em;color:${COLORS.ochre};">LA NOTA DEL DÍA</p>
          <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:${COLORS.ink};font-family:Georgia,'Roboto Slab',serif;">${esc(data.notaDelDia.titulo)}</p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:${COLORS.ink};">${esc(data.notaDelDia.cuerpo)}</p>
        </td></tr>
        ${enBreveHtml ? `<tr><td style="padding:20px 24px 0;font-family:Inter,Arial,sans-serif;">
          <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.06em;color:${COLORS.ochre};">EN BREVE</p>
          <ul style="margin:0;padding-left:18px;font-size:14px;color:${COLORS.ink};">${enBreveHtml}</ul>
        </td></tr>` : ''}
        ${data.datoDelDia ? `<tr><td style="padding:20px 24px 0;font-family:Inter,Arial,sans-serif;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.06em;color:${COLORS.ochre};">DATO DEL DÍA</p>
          <p style="margin:0;font-size:14px;line-height:1.5;color:${COLORS.ink};">${esc(data.datoDelDia)}</p>
        </td></tr>` : ''}
        ${data.agenda ? `<tr><td style="padding:20px 24px 0;font-family:Inter,Arial,sans-serif;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.06em;color:${COLORS.ochre};">AGENDA</p>
          <p style="margin:0;font-size:14px;line-height:1.5;color:${COLORS.ink};">${esc(data.agenda)}</p>
        </td></tr>` : ''}
        <tr><td style="padding:24px 24px;font-family:Inter,Arial,sans-serif;font-size:13px;color:${COLORS.stone};">
          Que tengas un buen ${esc(data.weekday)}. Nos leemos pronto.<br>CREA Contenidos — crea-contenidos.com
        </td></tr>
        ${patrocinadorHtml}
        <tr><td style="padding:14px 24px;border-top:1px solid ${COLORS.line};font-family:Inter,Arial,sans-serif;font-size:11px;color:${COLORS.stone};text-align:center;">
          Recibes este correo porque te suscribiste en crea-contenidos.com.
          <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:${COLORS.stone};">Cancelar suscripción</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function renderNewsletterText(data) {
  const lines = [
    `Buenos días, Perote. Hoy es ${data.weekday} ${data.date}. Esto es lo que necesitas saber.`,
    '',
    `EL CLIMA: ${data.clima}`,
    '',
    `LA NOTA DEL DÍA: ${data.notaDelDia.titulo} — ${data.notaDelDia.cuerpo}`,
  ];
  if (data.enBreve && data.enBreve.length) {
    lines.push('', 'EN BREVE:', ...data.enBreve.map((i) => `- ${i}`));
  }
  if (data.datoDelDia) lines.push('', `DATO DEL DÍA: ${data.datoDelDia}`);
  if (data.agenda) lines.push('', `AGENDA: ${data.agenda}`);
  lines.push('', `Que tengas un buen ${data.weekday}. Nos leemos pronto.`, 'CREA Contenidos — crea-contenidos.com');
  if (data.patrocinador) {
    lines.push('', `Buenos días, Perote es presentado por ${data.patrocinador.nombre}. ${data.patrocinador.copy || ''}`);
  }
  lines.push('', 'Cancelar suscripción: {{{RESEND_UNSUBSCRIBE_URL}}}');
  return lines.join('\n');
}

// Guion hablado para el podcast (TTS). Sin footer de unsubscribe, sin el
// merge-tag de Resend. Cortinillas/jingles de entrada-salida (per spec:
// crea_web/docs/updates/CREA_Newsletter_Podcast.md) siguen fuera de alcance —
// esto es solo el contenido narrado.
function renderPodcastScript(data) {
  const lines = [
    `Buenos días, Perote. Tu resumen informativo. Hoy es ${data.weekday} ${data.date}.`,
    '',
    `El clima: ${data.clima}`,
    '',
    `La nota del día: ${data.notaDelDia.titulo}. ${data.notaDelDia.cuerpo}`,
  ];
  if (data.enBreve && data.enBreve.length) {
    lines.push('', 'En breve:', ...data.enBreve);
  }
  if (data.datoDelDia) lines.push('', `Dato del día: ${data.datoDelDia}`);
  if (data.agenda) lines.push('', `Agenda: ${data.agenda}`);
  lines.push('', `Esto fue Buenos días, Perote. Que tengas un buen ${data.weekday}.`, 'CREA Contenidos.');
  return lines.join('\n');
}

module.exports = { renderNewsletterHtml, renderNewsletterText, renderPodcastScript };
