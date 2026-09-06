// app/(routes)/health/admin/programs/_components/no-access.tsx
// Created: 2026-06-15 — Health → Wellness Programs admin (PR3/3).
// Explicit access-denied panel for the PermissionGuard fallback. Rule #27:
// permission failures must be visible, never a silent blank page / redirect.

import { ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function NoProgramsAccess() {
  return (
    <Alert variant="destructive" className="mt-4">
      <ShieldAlert className="h-4 w-4" />
      <AlertTitle>You don&apos;t have access to manage wellness programs</AlertTitle>
      <AlertDescription>
        This area needs the <code className="font-mono">health.programs.manage</code>{' '}
        permission. Ask a super-admin to grant it on your role, or contact the
        Health module owner.
      </AlertDescription>
    </Alert>
  );
}
