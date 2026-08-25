import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const noDirectMessageQuery = require('./eslint-rules/no-direct-message-query.js');

const config = [
  ...coreWebVitals,
  ...typescript,
  {
    // Release gate G8: src/config/settings.ts is the ONLY module allowed to
    // read process.env. The prior-art review found three settings that
    // bypassed validation this way, one of which silently disabled a safety
    // check in production.
    files: ['src/**/*.{ts,tsx}'],
    // NODE_ENV is a build-time constant, not runtime configuration, and cookie
    // prefixes must key off it before settings.ts is even loaded.
    ignores: ['src/config/settings.ts', 'src/lib/auth/child-session.ts', 'src/lib/db/client.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'G8: read configuration from src/config/settings.ts, which validates it with Zod. Direct process.env access is banned.',
        },
      ],
    },
  },
  {
    // G1 enforced structurally: only audited modules may read messages.content.
    files: ['src/**/*.{ts,tsx}'],
    plugins: { bubbli: { rules: { 'no-direct-message-query': noDirectMessageQuery } } },
    rules: { 'bubbli/no-direct-message-query': 'error' },
  },
  {
    ignores: ['node_modules/**', 'drizzle/**', 'coverage/**', '.stryker-tmp/**'],
  },
]

export default config;
