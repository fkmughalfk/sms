import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'Sales Management System',
  description: 'Waqar Rice Mills — sales, recovery and reporting',
  applicationName: 'WRM Sales',
  // Installable on phones (app/manifest.ts); iPhone reads these instead of the manifest.
  appleWebApp: { capable: true, title: 'WRM Sales', statusBarStyle: 'default' },
  icons: {
    icon: [{ url: '/icons/favicon-48.png', sizes: '48x48', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#312e81',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
