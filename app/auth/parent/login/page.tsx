'use client';

import dynamic from 'next/dynamic';

const ParentLoginClient = dynamic(
  () => import('./parent-login-client').then(mod => ({ default: mod.ParentLoginClient })),
  {
    ssr: false,
    loading: () => <div className="flex min-h-screen items-center justify-center">Loading...</div>
  }
);

export default function ParentLoginPage() {
  return <ParentLoginClient />;
}
