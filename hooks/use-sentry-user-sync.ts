'use client';

// =====================================================================
// Sentry user-context sync — pushes profile shape to every Sentry event
// =====================================================================
// Subscribes to useAuth() and syncs role/institution/super_admin tags to
// Sentry on every profile change. Without this, Sentry events are
// anonymous — with it, every error becomes searchable by:
//
//   user_role:faculty AND institution_id:<uuid>
//   user_role:student AND user_kind:learner
//   is_super_admin:true
//
// Why a hook (not direct integration in AuthProvider): keeps the auth
// provider untouched. If Sentry is removed/replaced, this file is the
// only deletion site. Additive, low-risk.

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { useAuth } from '@/hooks/use-auth';

export function useSentryUserSync() {
  const { profile } = useAuth();

  useEffect(() => {
    if (!profile) {
      Sentry.setUser(null);
      Sentry.setTags({
        role: undefined,
        institution_id: undefined,
        is_super_admin: undefined,
        user_kind: undefined
      });
      return;
    }

    Sentry.setUser({
      id: profile.id,
      email: profile.email,
      username: profile.full_name || profile.email
    });

    Sentry.setTags({
      role: profile.role,
      institution_id: profile.institution_id ?? 'none',
      is_super_admin: String(profile.is_super_admin ?? false),
      user_kind: profile.learner_id ? 'learner' : 'staff'
    });
  }, [profile]);
}

// Invisible component — drop into layout.tsx to activate sync.
// Separate from the hook so layouts don't need to be 'use client'-aware
// of the hook signature; they just render <SentryUserSync />.
export function SentryUserSync() {
  useSentryUserSync();
  return null;
}
