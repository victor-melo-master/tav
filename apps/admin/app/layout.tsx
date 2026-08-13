import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TAV Admin',
  description: 'Panel de administración TAV',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
