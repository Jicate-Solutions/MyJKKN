import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    domains: ['https://lhaveojlrsahqfevulla.supabase.co']
  },
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    ignoreBuildErrors: true
  }
};

export default nextConfig;
