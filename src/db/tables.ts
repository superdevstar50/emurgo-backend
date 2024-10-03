import { pool } from "./pool";

export async function createTables() {
  await pool.query(`
      CREATE TABLE IF NOT EXISTS blocks (
          id TEXT PRIMARY KEY,
          height INTEGER NOT NULL,
          UNIQUE(height)
      );
    `);

  await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
          id TEXT PRIMARY KEY,
          block_id TEXT REFERENCES blocks(id) ON DELETE CASCADE,
          inputs JSONB[] NOT NULL,
          outputs JSONB[] NOT NULL
      );
    `);

  await pool.query(`
      CREATE TABLE IF NOT EXISTS balances (
          address TEXT PRIMARY KEY,
          balance INTEGER DEFAULT 0
      );
    `);
}
