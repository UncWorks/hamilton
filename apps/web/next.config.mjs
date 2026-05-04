/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // NFR-01: no external assets at runtime. Disable image optimization domains
  // (we self-host everything in /public).
  images: {
    unoptimized: true,
  },
  transpilePackages: ['@hamilton/contracts'],
  async headers() {
    const csp = [
      "default-src 'self'",
      // Cesium ships inline workers and shader compilation needs eval.
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "worker-src 'self' blob:",
      "connect-src 'self' ws://localhost:9001 http://localhost:8080",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; ');
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
