/**
 * Resuming a conversation, and the band fork it forced.
 *
 * The reported symptom was that a child sent a message, refreshed, and landed
 * on an empty greeting. Nothing was lost — the pointer was. It lived in React
 * state, which does not survive a reload.
 *
 * Making conversations survive the page session activated a second, dormant
 * problem. `conversations.age_band` is pinned at creation and the schema says
 * "Pinned at creation so a mid-conversation band change starts a new one" —
 * but nothing implemented that fork, because until now a conversation could not
 * outlive the session that created it. These tests pin both halves.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync, existsSync } from 'fs';
import { getOwnTranscript } from '@/lib/chat/child-transcript';
import { AuthzError, type Session } from '@/lib/authz';
import { continuesConversation } from '@/lib/chat/conversation-continuity';
import type { AgeBand } from '@/config/settings';

const url =
  process.env.DATABASE_URL ??
  (existsSync('.secrets-tmp/dburl') ? readFileSync('.secrets-tmp/dburl', 'utf8').trim() : undefined);
if (!url) throw new Error('No database URL');
const pool = new Pool({ connectionString: url, max: 4 });

let familyId: string;
let childId: string;
let otherChildId: string;
let session: Session;

/**
 * The route's own send path, driven through the SAME rule the handler uses.
 * Restating the rule here would let this pass whatever the handler later did.
 */
async function conversationForSend(
  childIdArg: string,
  currentBand: AgeBand,
  resuming: string | null,
): Promise<string> {
  if (resuming) {
    const pinned = await pool.query<{ age_band: string }>(
      `select age_band from conversations where id = $1`,
      [resuming],
    );
    if (continuesConversation(pinned.rows[0]?.age_band, currentBand)) return resuming;
  }
  const c = await pool.query(
    `insert into conversations (child_id, age_band) values ($1,$2) returning id`,
    [childIdArg, currentBand],
  );
  return c.rows[0].id as string;
}

beforeAll(async () => {
  const f = await pool.query(`insert into families (name) values ('resume-conv') returning id`);
  familyId = f.rows[0].id;
  const c = await pool.query(
    `insert into children (family_id, display_name, pin_hash, age_band, activated_at)
     values ($1,'Resumer','x','8-11',now()) returning id`,
    [familyId],
  );
  childId = c.rows[0].id;
  const o = await pool.query(
    `insert into children (family_id, display_name, pin_hash, age_band, activated_at)
     values ($1,'Other','x','8-11',now()) returning id`,
    [familyId],
  );
  otherChildId = o.rows[0].id;
  session = { principalType: 'child', familyId, childId };
});

afterAll(async () => {
  await pool.query(`delete from children where family_id = $1`, [familyId]).catch(() => {});
  await pool.query(`delete from families where id = $1`, [familyId]).catch(() => {});
  await pool.end();
});

describe('the reported symptom', () => {
  it('a conversation survives being re-read from its id alone', async () => {
    const id = await conversationForSend(childId, '8-11', null);
    await pool.query(
      `insert into messages (conversation_id, child_id, role, content, status)
       values ($1,$2,'child','why is the sky blue','completed'),
              ($1,$2,'assistant','Sunlight scatters.','completed')`,
      [id, childId],
    );

    // What the page does on ?c=<id>. Nothing is carried over from the send.
    const messages = await getOwnTranscript(pool, session, id);
    expect(messages.map((m) => m.content)).toEqual(['why is the sky blue', 'Sunlight scatters.']);
  });

  it('another child’s id is refused, so the page can fall back to a new chat', async () => {
    const theirs = await conversationForSend(otherChildId, '8-11', null);
    await expect(getOwnTranscript(pool, session, theirs)).rejects.toBeInstanceOf(AuthzError);
  });

  it('refusal carries 404, never 403 — a 403 would confirm the id exists', async () => {
    const theirs = await conversationForSend(otherChildId, '8-11', null);
    await getOwnTranscript(pool, session, theirs).catch((e) => {
      expect((e as AuthzError).status).toBe(404);
    });
    expect.assertions(1);
  });
});

describe('the fork rule itself', () => {
  it('continues only on an exact band match', () => {
    expect(continuesConversation('8-11', '8-11')).toBe(true);
    expect(continuesConversation('8-11', '12')).toBe(false);
    expect(continuesConversation('12', '13-15')).toBe(false);
  });

  it('refuses to continue a conversation that is gone', () => {
    expect(continuesConversation(undefined, '8-11')).toBe(false);
    expect(continuesConversation(null, '8-11')).toBe(false);
  });
});

describe('the band fork', () => {
  it('reuses the conversation while the band is unchanged', async () => {
    const first = await conversationForSend(childId, '8-11', null);
    const again = await conversationForSend(childId, '8-11', first);
    expect(again).toBe(first);
  });

  it('starts a NEW conversation when the child’s band has moved', async () => {
    const before = await conversationForSend(childId, '8-11', null);
    const after = await conversationForSend(childId, '12', before);

    expect(after).not.toBe(before);
    const bands = await pool.query<{ id: string; age_band: string }>(
      `select id, age_band from conversations where id = any($1)`,
      [[before, after]],
    );
    const byId = Object.fromEntries(bands.rows.map((r) => [r.id, r.age_band]));
    // Neither row lies about which band its turns were judged under.
    expect(byId[before]).toBe('8-11');
    expect(byId[after]).toBe('12');
  });

  it('leaves the older conversation readable after the fork', async () => {
    const before = await conversationForSend(childId, '8-11', null);
    await pool.query(
      `insert into messages (conversation_id, child_id, role, content, status)
       values ($1,$2,'child','from before the birthday','completed')`,
      [before, childId],
    );
    await conversationForSend(childId, '12', before);

    // Reads are never gated by band: a birthday must not make history unreachable.
    const messages = await getOwnTranscript(pool, session, before);
    expect(messages[0].content).toBe('from before the birthday');
  });
});
