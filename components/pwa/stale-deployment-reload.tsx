'use client';

// Headless. A Server Action from an older deployment usually rejects inside an
// event handler or form action, so it never reaches a React error boundary —
// it surfaces as an unhandled rejection and the click just does nothing. This
// listens for exactly that error and reloads the tab once so it picks up the
// current build (BUG-006164). Every other error is left alone.

import { useEffect } from 'react';
import {
  isStaleServerActionError,
  reloadOnceForStaleDeployment,
} from '@/lib/utils/stale-deployment';

export function StaleDeploymentReload() {
  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      if (isStaleServerActionError(event.reason)) reloadOnceForStaleDeployment();
    };
    const onError = (event: ErrorEvent) => {
      if (isStaleServerActionError(event.error)) reloadOnceForStaleDeployment();
    };
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onError);
    };
  }, []);

  return null;
}
