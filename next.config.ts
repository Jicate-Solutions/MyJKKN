import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://my-jkkn-nine.vercel.app/api/:path*'
      }
    ];
  },
  images: {
    domains: ['kvizhngldtiuufknvehv.supabase.co']
  },
  typescript: {
    ignoreBuildErrors: true
  }
};

export default nextConfig;
