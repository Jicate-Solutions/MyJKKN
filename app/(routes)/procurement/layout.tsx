'use client';

import { ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { usePermissions } from '@/hooks/use-permissions';

/**
 * Procurement module gateway. Blocks users without `procurement.view`.
 * Unlike IMS there is no store picker — procurement is institution-scoped,
 * so the layout only enforces the permission gate.
 */
export default function ProcurementLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { canAccess, isSuperAdmin, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground text-sm">Checking access...</div>
      </div>
    );
  }

  if (!isSuperAdmin && !canAccess('procurement', 'view')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-6">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <ShieldAlert className="h-12 w-12 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-semibold">Access Denied</h2>
            <p className="text-muted-foreground text-sm">
              You do not have permission to access the Procurement module. Please contact
              your administrator if you believe this is a mistake.
            </p>
            <Button variant="outline" size="sm" onClick={() => router.push('/dashboard')}>
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
