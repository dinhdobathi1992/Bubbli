/**
 * `server-only` throws unless a React Server Component bundler resolves it. It
 * exists to turn a BROWSER import of settings.ts into a compile error — the
 * failure that shipped a crash to /parent/setup.
 *
 * A maintenance script is neither a browser nor an RSC, so scripts/tsconfig.json
 * maps it to this stub, exactly as the test suite does. Stubbing it there rather
 * than in the root config keeps the guard intact where it actually matters.
 */
export {};
