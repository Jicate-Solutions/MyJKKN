'use client';

// ---------------------------------------------------------------------------
// /auth/dev-login
//
// Purpose: Handle magic-link tokens that Supabase's admin.generate_link emits.
// Unlike /auth/callback (which only handles PKCE ?code= from Google OAuth),
// this route also accepts:
//   1. URL hash fragment: #access_token=...&refresh_token=...&type=magiclink
//      → calls supabase.auth.setSession({ access_token, refresh_token })
//   2. Query param: ?token=xxx&type=magiclink  (verifyOtp path)
//      → calls supabase.auth.verifyOtp({ token_hash, type })
//
// After session is set, respects ?next=/path for deep-link routing.
//
// SECURITY: Gated to non-production by NEXT_PUBLIC_ENABLE_DEV_LOGIN env flag.
// Admin.generate_link requires service-role key, so tokens already imply
// insider access — but defense-in-depth: disable in prod.
//
// USED BY: scripts/local-auth.sh (the one-command local-preview tool)
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClientSupabaseClient } from '@/lib/supabase/client';

type Status =
  | { state: 'loading' }
  | { state: 'disabled' }
  | { state: 'success'; redirecting: string }
  | { state: 'error'; message: string };

function safeNext(raw: string | null): string {
  if (!raw) return '/';
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//')) return '/';
  return raw;
}

export default function DevLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>({ state: 'loading' });

  useEffect(() => {
    const enabled = process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN === 'true';
    if (!enabled) {
      setStatus({ state: 'disabled' });
      return;
    }

    const supabase = createClientSupabaseClient();
    const nextPath = safeNext(searchParams.get('next'));

    const run = async () => {
      // Path 1: hash fragment (#access_token=...&refresh_token=...)
      if (typeof window !== 'undefined' && window.location.hash) {
        const hash = new URLSearchParams(window.location.hash.slice(1));
        const accessToken = hash.get('access_token');
        const refreshToken = hash.get('refresh_token');

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            setStatus({ state: 'error', message: `setSession failed: ${error.message}` });
            return;
          }
          setStatus({ state: 'success', redirecting: nextPath });
          // Clear the hash so token isn't left in URL history
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
          router.replace(nextPath);
          return;
        }
      }

      // Path 2: ?token_hash=xxx&type=magiclink (verifyOtp)
      const tokenHash = searchParams.get('token_hash');
      const otpType = searchParams.get('type');
      if (tokenHash && otpType) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: otpType as 'magiclink' | 'signup' | 'invite' | 'recovery' | 'email',
        });
        if (error) {
          setStatus({ state: 'error', message: `verifyOtp failed: ${error.message}` });
          return;
        }
        setStatus({ state: 'success', redirecting: nextPath });
        router.replace(nextPath);
        return;
      }

      setStatus({
        state: 'error',
        message: 'No token found in URL. Expected hash (#access_token=...) or ?token_hash=...',
      });
    };

    run();
  }, [router, searchParams]);

  return (
    <div style={{ maxWidth: 480, margin: '80px auto', padding: 24, fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>MyJKKN — Dev Login</h1>

      {status.state === 'loading' && <p>Exchanging token…</p>}

      {status.state === 'disabled' && (
        <div>
          <p style={{ color: '#b45309' }}>This route is disabled.</p>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 8 }}>
            Set <code>NEXT_PUBLIC_ENABLE_DEV_LOGIN=true</code> in <code>.env.local</code> to enable
            local magic-link exchange. Intended for local development only.
          </p>
        </div>
      )}

      {status.state === 'success' && (
        <p style={{ color: '#047857' }}>
          Signed in. Redirecting to <code>{status.redirecting}</code>…
        </p>
      )}

      {status.state === 'error' && (
        <div>
          <p style={{ color: '#b91c1c' }}>Sign-in failed.</p>
          <pre style={{ fontSize: 12, background: '#f3f4f6', padding: 12, marginTop: 8 }}>
            {status.message}
          </pre>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 12 }}>
            Re-run <code>scripts/local-auth.sh</code> to generate a fresh link (tokens expire).
          </p>
        </div>
      )}
    </div>
  );
}
