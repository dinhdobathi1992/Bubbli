import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

const config = [
  ...coreWebVitals,
  ...typescript,
  {
    // Release gate G8: src/config/settings.ts is the ONLY module allowed to
    // read process.env. The prior-art review found three settings that
    // bypassed validation this way, one of which silently disabled a safety
    // check in production.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/config/settings.ts'],
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
    ignores: ['node_modules/**', 'drizzle/**', 'coverage/**', '.stryker-tmp/**'],
  },
]

export default config;
