/** Better Auth's own endpoints. Parent sign-in only; children never reach here. */
import { auth } from '@/lib/auth/better-auth';
import { toNextJsHandler } from 'better-auth/next-js';

export const { POST, GET } = toNextJsHandler(auth);
