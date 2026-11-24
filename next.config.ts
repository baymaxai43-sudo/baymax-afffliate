import type { NextConfig } from 'next';

const backend = process.env.API_ORIGIN; // e.g. http://localhost:4000 for standalone mode

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Allow the Fastify backend sources to be compiled into the API bridge
  outputFileTracingIncludes: {
    '/api/[[...path]]': ['./server/src/**/*'],
  },
  async rewrites() {
    const rules: { source: string; destination: string }[] = [];
    if (backend) {
      // Standalone backend mode (local dev against `npm run server`)
      rules.push({
        source: '/api/:path*',
        destination: `${backend}/:path*`,
      });
    }
    return {
      beforeFiles: rules,
    };
  },
};

export default nextConfig;
