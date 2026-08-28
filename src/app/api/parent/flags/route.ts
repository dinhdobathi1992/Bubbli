/** Flags list. Severity first, recency second. */
import { NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';
import { getSession } from '@/lib/auth/request-session';
import { assertIsGuardian } from '@/lib/authz';
import { projectFlagRow } from '@/lib/parent/dto';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  try {
    assertIsGuardian(session);
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const r = await pool.query(
    `select c.id as conversation_id,
            c.max_severity as severity,
            f.triggered_rules,
            count(f.id)::int as count,
            max(f.created_at) as last_at,
            ch.display_name as child_name
       from conversations c
       join children ch on ch.id = c.child_id
       join flags f on f.conversation_id = c.id
      where ch.family_id = $1 and f.reviewed = false
      group by c.id, c.max_severity, ch.display_name, f.triggered_rules
      order by array_position(array['info','low','medium','high','critical'], c.max_severity) desc,
               max(f.created_at) desc
      limit 100`,
    [session.familyId],
  );

  return NextResponse.json({ flags: r.rows.map(projectFlagRow) });
}
