const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const config = require('../config');

const SEEDS_DIR = path.join(__dirname, 'seeds');

async function run() {
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

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
