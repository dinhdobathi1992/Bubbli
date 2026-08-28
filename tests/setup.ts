/**
 * Test bootstrap.
 *
 * Loads the same .env.local the app uses, so tests exercise the REAL validated
 * config rather than a hand-built stub. The config module deliberately exits
 * when a provider in the chain has no credentials — that guard should hold in
 * tests too, not be bypassed by them.
 *
 * The loader is shared with the scripts rather than reimplemented here. The
 * hand-rolled version this replaces did not expand `\$`, so the suite ran
 * against a corrupted SES password; see `src/config/load-env.ts`.
 */
import { loadEnv } from '@/config/load-env';

loadEnv();
