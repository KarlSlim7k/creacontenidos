const { Pool } = require('pg');
const config = require('../config');

// Pool compartido para los routers (migrate.js y seed.js crean el suyo propio
// porque son procesos one-shot que hacen pool.end()).
module.exports = new Pool({ connectionString: config.databaseUrl });
