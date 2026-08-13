const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const config = require('../config');

const SEEDS_DIR = path.join(__dirname, 'seeds');

function assertSeedAllowed(nodeEnv = process.env.NODE_ENV || 'development') {
  if (nodeEnv === 'production') {
    throw new Error('Seed bloqueado en producción: contiene cuentas y credenciales exclusivas de desarrollo.');
  }
}

async function run() {
  assertSeedAllowed();
  const pool = new Pool({ connectionString: config.databaseUrl });
  const files = fs.readdirSync(SEEDS_DIR).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(SEEDS_DIR, file), 'utf8');
    console.log(`Seeding: ${file}`);
    await pool.query(sql);
  }

  console.log('Seed complete.');
  await pool.end();
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { assertSeedAllowed };
