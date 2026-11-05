import type { MetadataRoute } from 'next';

/**
 * Installable web app: on a phone, "Add to Home Screen" (iPhone) or "Install app"
 * (Android Chrome) opens the system full-screen with its own icon, like a native app.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Waqar Rice Mills — Sales',
    short_name: 'WRM Sales',
    description: 'Orders, rate lists, invoices, payments and recovery for Waqar Rice Mills.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#312e81',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Rate lists',
        url: '/rates',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Invoices',
        url: '/invoices',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
    ],
  };
}
