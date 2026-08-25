/**
 * Liveness only.
 *
 * The reviewed prior art returned provider endpoints to anonymous callers,
 * disclosing internal infrastructure. This returns status and timestamp: no
 * provider names, no endpoints, no model ids, no versions.
 */
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
}
