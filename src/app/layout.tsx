import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Bubbli',
  description: 'A safe AI learning companion for children.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      {/* The ground lives on <body> so no surface ever floats on an
          unstyled backdrop. That omission is what made the previous build
          unreadable in dark mode. */}
      <body className="min-h-full bg-ground text-ink">{children}</body>
    </html>
  );
}
