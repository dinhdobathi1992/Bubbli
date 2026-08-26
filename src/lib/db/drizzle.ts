/**
 * Drizzle handle over the shared pool.
 *
 * Better Auth's adapter needs a Drizzle instance; everything else in this
 * codebase uses the raw pool directly. Both sit on the SAME pool, so there is
 * one connection budget rather than two competing ones.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { pool } from './client';
import * as schema from '@/db/schema';

export const db = drizzle(pool, { schema });
