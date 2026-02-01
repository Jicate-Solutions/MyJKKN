'use client';

import dynamic from 'next/dynamic';

const ParentRegisterClient = dynamic(
  () => import('./parent-register-client').then(mod => ({ default: mod.ParentRegisterClient })),
  {
    ssr: false,
    loading: () => <div className="flex min-h-screen items-center justify-center">Loading...</div>
  }
);

export default function ParentRegisterPage() {
  return <ParentRegisterClient />;
}
