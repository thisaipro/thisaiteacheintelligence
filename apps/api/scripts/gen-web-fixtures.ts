/* Regenerates the report fixtures used by the web snapshot tests from the real
   scorer, so snapshots always reflect server output. Run: npm run gen:web-fixtures */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { createApp } from '../src/app';
import { devIdentity } from '../src/auth/identity';
import { loadBank } from '../src/bank';
import { seedDemo } from '../src/dev/seed';
import { toProfileDTO } from '../src/present';
import { MemoryRepo } from '../src/repo/memory';

const NOW = new Date('2026-09-27T10:00:00Z');
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/src/features/teacher-assessment/__tests__/fixtures');

const repo = new MemoryRepo({ items: loadBank() });
await seedDemo(repo, NOW);
const app = createApp({ repo, identity: devIdentity(), now: () => NOW });
const get = (u: string) => request(app).get('/api/teacher-assessment' + u).set('x-ta-dev-user', 'a');
const admin = (await get('/admin/teachers/TCH-0501/profile')).body;
const cohort = (await get('/admin/cohort')).body;
const inst = repo.forInstitution('inst-stpeters');
const a = (await inst.latestSubmittedAttempt('TCH-0501'))!;
const teacher = toProfileDTO({ attempt: a, institution_name: "St. Peter's Matriculation, Chennai" }, (await inst.getProfile(a.attempt_id))!, 'teacher', { items_answered: 35, items_total: 35 });
admin.item_level = admin.item_level.slice(0, 3);
fs.mkdirSync(out, { recursive: true });
for (const [f, v] of [['profile.teacher.json', teacher], ['profile.admin.json', admin], ['cohort.json', cohort]] as const)
  fs.writeFileSync(path.join(out, f), JSON.stringify(v, null, 1) + '\n');
console.log('wrote fixtures to', out);
