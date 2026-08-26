/**
 * Does outbound email actually work?
 *
 * Two modes:
 *   pnpm email:verify            — connect and authenticate, send nothing
 *   pnpm email:verify <address>  — also send one real test message
 *
 * The default sends nothing, because proving credentials work should not put a
 * message in somebody's inbox. Note that while SES is in sandbox the only
 * deliverable recipients are verified identities.
 */
import { readFileSync, existsSync } from 'fs';

// Same loader the test bootstrap uses: exercise the REAL validated config
// rather than a hand-built stub.
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

async function main() {
  const { settings } = await import('../src/config/settings');
  const { verifyMailTransport, sendMail } = await import('../src/lib/email/send');

  console.log('\n  Email configuration');
  console.log(`    host      ${settings.SES_SMTP_HOST ?? '(none — will log instead)'}`);
  console.log(`    port      ${settings.SES_SMTP_PORT}`);
  console.log(`    user      ${settings.SES_SMTP_USER ? 'set' : 'not set'}`);
  console.log(`    password  ${settings.SES_SMTP_PASSWORD ? 'set' : 'not set'}`);
  console.log(`    from      ${settings.EMAIL_FROM}`);

  const transport = await verifyMailTransport();
  console.log(`\n  Transport: ${transport}${transport === 'ses' ? ' — credentials accepted' : ' — development log'}`);

  const to = process.argv[2];
  if (!to) {
    console.log('\n  No recipient given, so nothing was sent.');
    console.log('  To send one real message: pnpm email:verify you@example.com\n');
    return;
  }

  const result = await sendMail({
    to,
    subject: 'Bubbli email transport test',
    text: [
      'This is a test message from Bubbli.',
      '',
      'If you are reading it, outbound email works: SES accepted the message',
      'over SMTP and delivered it.',
    ].join('\n'),
  });
  console.log(`\n  Sent to ${to} via ${result.transport}${result.messageId ? ` (${result.messageId})` : ''}\n`);
}

main().catch((e) => {
  console.error(`\n  FAILED: ${e.message}\n`);
  process.exit(1);
});
