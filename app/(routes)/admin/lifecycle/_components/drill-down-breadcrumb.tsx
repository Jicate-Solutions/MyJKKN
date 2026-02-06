'use client';

import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MODULE_LABELS } from '@/types/usage-analytics';

interface DrillDownBreadcrumbProps {
  selectedModule: string | null;
  onClear: () => void;
}

export function DrillDownBreadcrumb({
  selectedModule,
  onClear,
}: DrillDownBreadcrumbProps) {
  if (!selectedModule) return null;

  return (
    <div className="flex items-center gap-1.5 text-sm mb-4">
      <Button
        variant="link"
        className="p-0 h-auto text-sm"
        onClick={onClear}
      >
        All Modules
      </Button>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="font-medium">
        {MODULE_LABELS[selectedModule] || selectedModule}
      </span>
    </div>
  );
}
