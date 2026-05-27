import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/farmer_data'
});

async function main() {
  try {
    const tables = await pool.query("select table_name from information_schema.tables where table_schema='public' order by table_name");
    console.log('TABLES', JSON.stringify(tables.rows.map(r => r.table_name)));

    const usersExists = tables.rows.some(r => r.table_name === 'users');
    console.log('USERS_TABLE_EXISTS', usersExists);

    if (usersExists) {
      const result = await pool.query("select id, email, role, is_active from users order by id limit 20");
      console.log('USERS', JSON.stringify(result.rows));
    }
  } catch (error) {
    console.error('DB_INSPECT_ERROR', error.message);
    if (error.stack) console.error(error.stack);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
