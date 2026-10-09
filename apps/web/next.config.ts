import type { NextConfig } from 'next';

// The API origin is baked into the rewrite at build time, so a Vercel build without it
// would silently proxy to localhost (Vercel rejects that: DNS_HOSTNAME_RESOLVED_PRIVATE).
if (process.env.VERCEL && !process.env.API_URL) {
  throw new Error(
    'API_URL is not set for this Vercel project. Add it under Settings → Environment Variables ' +
      '(e.g. API_URL=https://your-api.vercel.app, no trailing slash) and redeploy.',
  );
}

const apiUrl = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

const nextConfig: NextConfig = {
  // Same-origin proxy so httpOnly auth cookies work without cross-site issues (spec §8).
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
