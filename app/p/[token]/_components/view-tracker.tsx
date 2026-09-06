'use client';

// Fire-and-forget public view ping. Mounts once on the public program page and
// POSTs to the service-role track API so the visit is logged as an anonymous
// fact. No personal data leaves the browser; failures are swallowed silently
// (tracking must never break the patient-facing page).

import { useEffect, useRef } from 'react';

export function ViewTracker({ token }: { token: string }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    void fetch(`/api/public/health-programs/${encodeURIComponent(token)}/track`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      keepalive: true,
    }).catch(() => {
      /* silent — tracking is best-effort */
    });
  }, [token]);

  return null;
}
