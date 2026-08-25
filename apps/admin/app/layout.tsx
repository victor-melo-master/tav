import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'TAV Admin',
  description: 'Panel de administración TAV — casa de cambio',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
