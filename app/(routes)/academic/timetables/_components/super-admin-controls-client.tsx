/**
 * Super Admin Controls - Client Component
 *
 * Interactive controls for super admin timetable management
 */

'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Settings } from 'lucide-react';

export function SuperAdminControlsClient() {
  const router = useRouter();

  return (
    <div className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-lg">
      <div className="flex items-center gap-2">
        <Badge variant="destructive" className="gap-1">
          <Settings className="h-3 w-3" />
          Super Admin
        </Badge>
        <span className="text-sm text-red-700">
          Advanced timetable management tools available
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="gap-1 border-red-300 text-red-700 hover:bg-red-100"
        onClick={() => router.push('/academic/timetables/conflicts')}
      >
        <AlertTriangle className="h-3 w-3" />
        View Conflicts
      </Button>
    </div>
  );
}
