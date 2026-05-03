'use client';

import { useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { usePermissions } from '@/hooks/use-permissions';

interface ImsPageGuardProps {
  module: string;
  action: string;
  children: React.ReactNode;
}

export function ImsPageGuard({ module, action, children }: ImsPageGuardProps) {
  const router = useRouter();
  const { canAccess, isSuperAdmin, isLoading: permissionsLoading } =
    usePermissions();

  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground text-sm">
          Checking access...
        </div>
      </div>
    );
  }

  if (!isSuperAdmin && !canAccess(module, action)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-6">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <ShieldAlert className="h-12 w-12 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-semibold">Access Denied</h2>
            <p className="text-muted-foreground text-sm">
              You do not have permission to view this page.
              Please contact your administrator if you believe this is a mistake.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/ims/dashboard')}
            >
              Back to IMS Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
