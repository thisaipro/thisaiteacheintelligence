/* Runs SQL migrations in order and (with --seed-items) upserts the item bank.
   Usage: DATABASE_URL=postgres://… tsx src/db/migrate.ts [--seed-items [path]] */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadBank } from '../bank';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = process.env.TA_MIGRATIONS_DIR ??
  [path.join(here, 'migrations'), path.resolve(here, '../src/db/migrations'), path.resolve(here, '../../src/db/migrations')].find((d) => fs.existsSync(d))!;

export async function migrate(pool: pg.Pool, dir = MIGRATIONS_DIR) {
  await pool.query('CREATE TABLE IF NOT EXISTS ta_schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const done = new Set((await pool.query('SELECT name FROM ta_schema_migrations')).rows.map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(fs.readFileSync(path.join(dir, f), 'utf8'));
      await c.query('INSERT INTO ta_schema_migrations (name) VALUES ($1)', [f]);
      await c.query('COMMIT');
      applied.push(f);
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  return applied;
}

/** Upserts items and options. Existing items whose content changed get version + 1. */
export async function seedItems(pool: pg.Pool, bankPath?: string) {
  const bank = loadBank(bankPath);
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    for (const i of bank) {
      await c.query(
        `INSERT INTO ta_items (item_id, grade_band, dimension, gate, scenario, source_tag, version, active)
         VALUES ($1,$2,$3,$4,$5,$6,1,true)
         ON CONFLICT (item_id) DO UPDATE SET grade_band = EXCLUDED.grade_band, dimension = EXCLUDED.dimension,
           gate = EXCLUDED.gate, scenario = EXCLUDED.scenario, source_tag = EXCLUDED.source_tag,
           version = ta_items.version + CASE WHEN ta_items.scenario IS DISTINCT FROM EXCLUDED.scenario THEN 1 ELSE 0 END`,
        [i.item_id, i.grade_band, i.dimension, i.gate_dimension, i.scenario, i.source_tag]);
      for (const o of i.options)
        await c.query(
          `INSERT INTO ta_options (item_id, label, text, key_rank, points, rationale) VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (item_id, label) DO UPDATE SET text = EXCLUDED.text, key_rank = EXCLUDED.key_rank,
             points = EXCLUDED.points, rationale = EXCLUDED.rationale`,
          [i.item_id, o.label, o.text, o.key_rank, o.points, o.rationale]);
    }
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
  return bank.length;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: url });
  const args = process.argv.slice(2);
  migrate(pool)
    .then(async (applied) => {
      console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Schema up to date');
      const i = args.indexOf('--seed-items');
      if (i > -1) console.log(`Seeded ${await seedItems(pool, args[i + 1])} items`);
    })
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
