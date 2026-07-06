// Shared explicit-denial fallback for the module's PermissionGuards.
// Rule: permission failures must be explicit, never a silent blank page —
// a denied user needs to see WHY and who to ask (CLAUDE.md rule 27 class).
import { ShieldAlert } from 'lucide-react';

export function NoAccess({ what = 'this page' }: { what?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <ShieldAlert className="h-10 w-10 text-muted-foreground/60 mb-3" />
      <h3 className="text-lg font-medium mb-1">You don&apos;t have access to {what}</h3>
      <p className="text-sm text-muted-foreground max-w-md">
        Your role doesn&apos;t include the Schools Network permission required
        here. Contact a super admin or the admissions team to request access.
      </p>
    </div>
  );
}
