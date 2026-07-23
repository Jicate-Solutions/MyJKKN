'use client';

/**
 * Authenticated parent surface. Wraps pages in the session context (parent
 * identity + children + active-child selection) and the mobile shell (header,
 * bottom nav, drawers). The proxy already guarantees a valid parent_session
 * before these pages render. (This `(authed)` group does not affect the URL.)
 */
import { ParentSessionProvider } from '@/hooks/parent/use-parent-session';
import { ParentShell } from '@/components/parent/parent-shell';

export default function AuthedParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ParentSessionProvider>
      <ParentShell>{children}</ParentShell>
    </ParentSessionProvider>
  );
}
