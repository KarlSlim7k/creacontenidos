const { Pool } = require('pg');
const config = require('../config');

// Pool compartido para los routers (migrate.js y seed.js crean el suyo propio
// porque son procesos one-shot que hacen pool.end()).
const pool = new Pool({ connectionString: config.databaseUrl });

// Sin este listener, un cliente idle que pierde la conexión (ej. `db` se
// reinicia) emite 'error' sin handler -> Node lo trata como excepción no
// capturada y tumba el proceso entero. El pool ya descarta el cliente roto
// solo; loguear y seguir es suficiente.
pool.on('error', (err) => {
  console.error('pg pool: conexión idle perdida', err.message);
});

module.exports = pool;
