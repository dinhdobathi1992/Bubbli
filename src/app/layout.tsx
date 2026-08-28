import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Inter } from 'next/font/google';
import './globals.css';

/**
 * Type for the warm register.
 *
 * `next/font/google` downloads at BUILD time and serves from this origin, so
 * despite the name there is no runtime request to a font CDN and no third-party
 * connection from a children's product. It also emits a size-adjusted fallback,
 * which is what removes the shift when the real face arrives.
 *
 * A heavy geometric sans for headings and controls against a humanist sans for
 * body is a contrast pairing. The instrument register keeps its serif display —
 * see globals.css.
 */
const display = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-warm-display',
  display: 'swap',
});

const body = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-warm-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Bubbli',
  description: 'A safe AI learning companion for children.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${display.variable} ${body.variable}`}>
      {/* The ground lives on <body> so no surface ever floats on an
          unstyled backdrop. That omission is what made the previous build
          unreadable in dark mode. Each register's layout paints its own ground
          over the top; this is the floor beneath both. */}
      <body className="min-h-full bg-ground text-ink">{children}</body>
    </html>
  );
}
