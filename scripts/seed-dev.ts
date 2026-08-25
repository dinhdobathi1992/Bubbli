/**
 * Development seed. Creates one consented family with a child, so the app can
 * be used end to end locally.
 *
 * Development only. It writes a real consent record, which in production must
 * come from the verified flow (and is still gated on Q-B).
 */
import { Pool } from 'pg';
import { readFileSync, existsSync } from 'fs';
import { hashPin } from '../src/lib/auth/child-pin';
import { ensurePolicyVersion } from '../src/lib/guardrails/policy-store';

const url =
  process.env.DATABASE_URL ??
  (existsSync('.secrets-tmp/dburl') ? readFileSync('.secrets-tmp/dburl', 'utf8').trim() : undefined);
if (!url) throw new Error('No DATABASE_URL');

const PIN = '835492';

async function main() {
  const pool = new Pool({ connectionString: url });
  await ensurePolicyVersion(pool);

  await pool.query(`delete from families where name = 'Dev Family'`).catch(() => undefined);

  const f = await pool.query(`insert into families (name) values ('Dev Family') returning id`);
  const familyId = f.rows[0].id as string;

  const p = await pool.query(
    `insert into parents (family_id, email, consented_at) values ($1,$2, now()) returning id`,
    [familyId, 'parent@dev.local'],
  );

  const c = await pool.query(
    `insert into children (family_id, display_name, pin_hash, age_band, activated_at)
     values ($1,'Emma',$2,'8-11', now()) returning id`,
    [familyId, await hashPin(PIN)],
  );

  console.log('\n  Seeded development family\n');
  console.log(`  Family code : ${familyId}`);
  console.log(`  Child name  : Emma`);
  console.log(`  PIN         : ${PIN}`);
  console.log(`  Parent id   : ${p.rows[0].id}`);
  console.log(`  Child id    : ${c.rows[0].id}`);
  console.log('\n  Sign in at  : http://localhost:3000/login\n');

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
