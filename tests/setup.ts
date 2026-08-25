/**
 * Test bootstrap.
 *
 * Loads the same .env.local the app uses, so tests exercise the REAL validated
 * config rather than a hand-built stub. The config module deliberately exits
 * when a provider in the chain has no credentials — that guard should hold in
 * tests too, not be bypassed by them.
 */
import { readFileSync, existsSync } from 'fs';

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
