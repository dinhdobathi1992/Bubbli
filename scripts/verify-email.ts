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
import { loadEnv } from '../src/config/load-env';

// Same loader the app and the test bootstrap use, so this script can never
// disagree with production about whether the credentials work.
loadEnv();

async function main() {
  const { settings } = await import('../src/config/settings');
  const { verifyMailTransport, sendMail } = await import('../src/lib/email/send');

  console.log('\n  Email configuration');
  console.log(`    order       ${settings.EMAIL_PROVIDER_ORDER.join(' → ')}`);
  console.log(`    resend      key ${settings.RESEND_API_KEY ? 'set' : 'not set'}`);
  console.log(`    ses         ${settings.SES_SMTP_HOST ?? '(not set)'}:${settings.SES_SMTP_PORT}`);
  console.log(`    ses auth    ${settings.SES_SMTP_USER && settings.SES_SMTP_PASSWORD ? 'set' : 'not set'}`);
  console.log(`    from (ses)  ${settings.EMAIL_FROM}`);
  console.log(`    from (resend) ${settings.RESEND_EMAIL_FROM ?? settings.EMAIL_FROM}`);

  const transport = await verifyMailTransport();
  const detail = {
    ses: 'SMTP credentials accepted',
    resend: 'API key present (a send-only key cannot be verified without sending)',
    log: 'nothing configured — messages go to the server log',
  }[transport];
  console.log(`\n  Active transport: ${transport} — ${detail}`);

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
  console.log(`\n  Accepted by ${result.transport}${result.messageId ? ` (${result.messageId})` : ''}`);
  console.log(`  Recipient: ${to}`);
  console.log('\n  Note: acceptance is not delivery. A relay takes custody before');
  console.log('  anything downstream checks SPF, DKIM or a rule set. Confirm in the');
  console.log("  recipient's inbox, or in the provider's delivery reporting.\n");
}

main().catch((e) => {
  console.error(`\n  FAILED: ${e.message}\n`);
  process.exit(1);
});
