/** Shared pool. One per process; Next.js reuses modules across requests. */
import { Pool } from 'pg';
import { settings } from '@/config/settings';

declare global {
   
  var __bubbliPool: Pool | undefined;
}

export const pool: Pool =
  globalThis.__bubbliPool ??
  new Pool({ connectionString: settings.DATABASE_URL, max: 10, idleTimeoutMillis: 30_000 });

if (!globalThis.__bubbliPool) globalThis.__bubbliPool = pool;
