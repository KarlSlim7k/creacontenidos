#!/usr/bin/env node
// Check de Telegram: firma, autorización, callback idempotente y transiciones editoriales.
const assert = require('node:assert');
const http = require('node:http');
const {
  runMigrate, runSeed, createPool, startApi, stopApi, waitForHealth,
} = require('./lib/check-helpers');

const PORT = Number(process.env.CHECK_PORT) || 3992;
const BASE = `http://127.0.0.1:${PORT}`;
const CHAT_ID = 1471148902;
const SECRET = 'telegram-check-secret';
const UPDATE_BASE = Date.now();

function startTelegramStub() {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      calls.push({ path: req.url, body: JSON.parse(body || '{}') });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, result: { message_id: 700 + calls.length } }));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, calls, port: server.address().port })));
}

function callbackUpdate(updateId, data, chatId = CHAT_ID) {
  return { update_id: updateId, callback_query: { id: `cb-${updateId}`, data, from: { id: chatId }, message: { message_id: 44, chat: { id: chatId } } } };
}

function messageUpdate(updateId, text, chatId = CHAT_ID) {
  return { update_id: updateId, message: { message_id: 45, chat: { id: chatId }, from: { id: chatId }, text } };
}

async function webhook(update, secret = SECRET) {
  return fetch(`${BASE}/api/telegram/webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret }, body: JSON.stringify(update),
  });
}

async function main() {
  runMigrate(); runSeed();
  const pool = createPool();
  const stub = await startTelegramStub();
  const api = startApi({ port: PORT, env: {
    TELEGRAM_BOT_TOKEN: 'check-token', TELEGRAM_WEBHOOK_SECRET: SECRET,
    TELEGRAM_DIRECTOR_CHAT_IDS: String(CHAT_ID), TELEGRAM_REVIEW_ENABLED: 'false',
    TELEGRAM_API_BASE_URL: `http://127.0.0.1:${stub.port}`,
  } });
  let publishId; let returnId;
  try {
    await waitForHealth(BASE);
    const published = await pool.query(
      `INSERT INTO content_proposals (format, title, body, status, section, slug)
       VALUES ('Nota', '[check telegram] publicar', 'Cuerpo de prueba', 'en_revision', 'Local', 'check-telegram-publicar') RETURNING id`
    );
    publishId = published.rows[0].id;
    const returned = await pool.query(
      `INSERT INTO content_proposals (format, title, body, status, section, slug)
       VALUES ('Nota', '[check telegram] devolver', 'Cuerpo de prueba', 'en_revision', 'Local', 'check-telegram-devolver') RETURNING id`
    );
    returnId = returned.rows[0].id;

    assert.strictEqual((await webhook(callbackUpdate(UPDATE_BASE + 1, `approve:${publishId}`), 'mal')).status, 401, 'un secreto inválido fue aceptado');
    assert.strictEqual((await webhook(callbackUpdate(UPDATE_BASE + 2, `publish:${publishId}:h`, 999))).status, 200, 'un chat ajeno no debe revelar datos');
    assert.strictEqual((await pool.query('SELECT status FROM content_proposals WHERE id = $1', [publishId])).rows[0].status, 'en_revision');

    const approveRes = await webhook(callbackUpdate(UPDATE_BASE + 3, `approve:${publishId}`));
    assert.strictEqual(approveRes.status, 200, await approveRes.text());
    const originRes = await webhook(callbackUpdate(UPDATE_BASE + 4, `origin:${publishId}:a`));
    assert.strictEqual(originRes.status, 200, await originRes.text());
    const publishRes = await webhook(callbackUpdate(UPDATE_BASE + 5, `publish:${publishId}:a`));
    assert.strictEqual(publishRes.status, 200, await publishRes.text());
    let proposal = (await pool.query('SELECT status, origin FROM content_proposals WHERE id = $1', [publishId])).rows[0];
    assert.deepStrictEqual(proposal, { status: 'published', origin: 'Asistido por IA' }, `la publicación de ${publishId} no persistió`);
    const callsAfterPublish = stub.calls.length;
    assert.strictEqual((await webhook(callbackUpdate(UPDATE_BASE + 5, `publish:${publishId}:a`))).status, 200);
    assert.strictEqual(stub.calls.length, callsAfterPublish, 'un update repetido volvió a contactar Telegram');

    assert.strictEqual((await webhook(callbackUpdate(UPDATE_BASE + 6, `return:${returnId}`))).status, 200);
    assert.strictEqual((await webhook(messageUpdate(UPDATE_BASE + 7, 'Ajustar el enfoque y verificar las cifras.'))).status, 200);
    proposal = (await pool.query('SELECT status, review_comment FROM content_proposals WHERE id = $1', [returnId])).rows[0];
    assert.deepStrictEqual(proposal, { status: 'borrador', review_comment: 'Ajustar el enfoque y verificar las cifras.' });
    assert.ok(stub.calls.some((call) => call.path.endsWith('/answerCallbackQuery')), 'no se confirmó el callback a Telegram');
    assert.ok((await pool.query("SELECT 1 FROM activity_log WHERE action IN ('telegram_publish', 'telegram_return')")).rowCount >= 2, 'faltan acciones en bitácora');
    console.log('OK: Telegram webhook, autorización, publicación y devolución verificados.');
  } finally {
    if (publishId || returnId) await pool.query('DELETE FROM content_proposals WHERE id = ANY($1)', [[publishId, returnId].filter(Boolean)]);
    await pool.end();
    await stopApi(api);
    await new Promise((resolve) => stub.server.close(resolve));
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
