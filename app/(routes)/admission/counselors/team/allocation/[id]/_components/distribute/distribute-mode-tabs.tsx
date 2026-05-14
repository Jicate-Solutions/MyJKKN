'use client';

import { UserCheck, Wand2, Repeat } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type DistributeMode = 'bulk-one' | 'auto-route' | 'round-robin';

interface DistributeModeTabsProps {
  value: DistributeMode;
  onChange: (next: DistributeMode) => void;
  disabled?: boolean;
}

export function DistributeModeTabs({ value, onChange, disabled }: DistributeModeTabsProps) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as DistributeMode)}>
      <TabsList className="grid grid-cols-3">
        <TabsTrigger value="bulk-one" disabled={disabled}>
          <UserCheck className="mr-1.5 h-3.5 w-3.5" /> Bulk-one
        </TabsTrigger>
        <TabsTrigger value="auto-route" disabled={disabled}>
          <Wand2 className="mr-1.5 h-3.5 w-3.5" /> Auto-route
        </TabsTrigger>
        <TabsTrigger value="round-robin" disabled={disabled}>
          <Repeat className="mr-1.5 h-3.5 w-3.5" /> Round-robin
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
