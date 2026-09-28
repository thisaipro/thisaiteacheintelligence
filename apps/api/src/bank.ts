/* Loads and validates the item bank JSON (source of truth for seeding). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBank } from './bank-parse';
import type { ItemRow } from './repo/types';

const here = path.dirname(fileURLToPath(import.meta.url));
// src/bank.ts, dist/server.js and dist/db/migrate.js all resolve to apps/api/data.
export const DEFAULT_BANK_PATH = ['../data', '../../data']
  .map((d) => path.resolve(here, d, 'item-bank.v1.json'))
  .find((f) => fs.existsSync(f)) ?? path.resolve(here, '../data/item-bank.v1.json');

export { parseBank };

export function loadBank(file = process.env.TA_ITEM_BANK_PATH || DEFAULT_BANK_PATH): ItemRow[] {
  return parseBank(JSON.parse(fs.readFileSync(file, 'utf8')));
}
