'use client';

// Usability gate for InstaSolver screens. It hides a screen a person cannot
// use and SAYS why; it is not the security boundary — RLS and the guards in
// the database refuse on their own whatever this lets through.

import type { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useInstaSolverAccess } from '@/hooks/instasolver/use-instasolver';
import type { InstaSolverAccess } from '@/types/instasolver';

export type AccessNeed = 'report' | 'manager' | 'maintenance' | 'analytics' | 'admin';

export function hasNeed(access: InstaSolverAccess | undefined, need: AccessNeed): boolean {
  if (!access) return false;
  switch (need) {
    case 'report':
      return access.can_report;
    case 'manager':
      return access.is_manager;
    case 'maintenance':
      return access.is_maintenance || access.is_admin;
    case 'analytics':
      return access.is_principal || access.is_manager;
    case 'admin':
      return access.is_admin;
  }
}

const REFUSAL: Record<AccessNeed, string> = {
  report: 'Your account cannot raise InstaSolver reports. Parents and guest accounts are not included.',
  manager: 'This screen is for the CAO. Triage and assignment are the CAO’s decisions.',
  maintenance: 'This screen is for maintenance team members. Ask the CAO to add you to a team.',
  analytics: 'Analytics is for Principals (their own institution) and the CAO.',
  admin: 'This screen is for the Super Admin.'
};

export function AccessGate({ need, children }: { need: AccessNeed; children: ReactNode }) {
  const { data: access, isLoading, error } = useInstaSolverAccess();

  if (isLoading) {
    return (
      <div className="space-y-3 py-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !hasNeed(access, need)) {
    return (
      <Card className="mx-auto mt-8 max-w-md">
        <CardContent className="space-y-3 pt-6 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="font-medium">Not available to you</p>
          <p className="text-sm text-muted-foreground">
            {error ? 'Your access could not be checked. Refresh the page to try again.' : REFUSAL[need]}
          </p>
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}
