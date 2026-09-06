'use client';

// IMS entry point.
//
// This used to be a one-line server redirect to /ims/dashboard for everyone. It
// cannot stay that way, because who should land where depends on the user's
// permissions, and those are only known client-side.
//
// The cost is a brief spinner while permissions resolve. The alternative —
// redirecting immediately and correcting afterwards — would flash the dashboard at
// a cashier, or worse, flash the till at an administrator.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BeatLoader } from 'react-spinners';
import { useImsHomeRoute } from '@/hooks/ims/use-ims-home-route';

export default function ImsRootPage() {
  const router = useRouter();
  const { route, isReady } = useImsHomeRoute();

  useEffect(() => {
    // Wait for permissions. canAccess answers false for everything while loading,
    // which would read as "cannot run the store" and send an admin to the till.
    if (!isReady) return;
    router.replace(route);
  }, [isReady, route, router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <BeatLoader color="hsl(var(--primary))" size={12} />
    </div>
  );
}
