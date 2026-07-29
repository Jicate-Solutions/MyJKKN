// hooks/events/use-event-access.ts
// Access model for GENERAL events (lecture, cultural, convocation, …) — the
// event-type-agnostic sibling of use-tournament-access.
//
// The manage set deliberately MIRRORS what the DB already enforces in
// events_reg_admin_read (super_admin | admin | administrator | event_coordinator)
// plus the per-event in-charge list. Keeping the UI gate identical to the RLS
// gate means we never show someone a page the database will then blank out.
//
// No new permission key: the Events catalog has no generic events.manage, and
// adding one without widening the RLS policies would let its holders into a
// page that returns zero rows.

'use client';

import { useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { getIncharges } from '@/hooks/events/use-tournament-access';
import type { Event } from '@/types/events';

/** Roles granted registration read/write by events_reg_admin_read. */
const MANAGER_ROLES = ['super_admin', 'admin', 'administrator', 'event_coordinator'];

export interface EventAccess {
  /** Build the form, view registrations, copy the share link. */
  canManage: boolean;
  /** See the event at all. Every authenticated user may view a general event. */
  canView: boolean;
  /** Listed in events.config.incharges for THIS event. */
  isIncharge: boolean;
  isLoading: boolean;
}

export function useEventAccess(event?: Pick<Event, 'config'> | null): EventAccess {
  const { profile } = useAuth();
  const { isSuperAdmin, isLoading: permsLoading } = usePermissions();

  const profileId = profile?.id ?? null;
  const role = (profile as { role?: string } | null)?.role ?? null;

  const isIncharge = useMemo(
    () => (!profileId || !event ? false : getIncharges(event).some((i) => i.member_id === profileId)),
    [event, profileId]
  );

  const hasManagerRole = isSuperAdmin || (!!role && MANAGER_ROLES.includes(role));
  const canManage = hasManagerRole || isIncharge;

  return {
    canManage,
    canView: true,
    isIncharge,
    isLoading: permsLoading,
  };
}
