/**
 * No-op stand-in for the `server-only` package.
 *
 * That package throws unless a React Server Component bundler resolves it. Its
 * job is to turn a browser import of `src/config/settings.ts` into a BUILD
 * error — the failure that shipped a crash to /parent/setup. Tests run in node
 * with no browser bundle, so the guard has nothing to protect there and the
 * real module would just break the suite.
 */
export {};
