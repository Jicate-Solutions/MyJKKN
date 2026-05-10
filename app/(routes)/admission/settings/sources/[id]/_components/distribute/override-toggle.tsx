'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AlertTriangle } from 'lucide-react';

interface OverrideToggleProps {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

export function OverrideToggle({ value, onChange, disabled }: OverrideToggleProps) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-orange-200 bg-orange-50/50 p-3">
      <Checkbox
        id="bulk-override"
        checked={value}
        onCheckedChange={(c) => onChange(c === true)}
        disabled={disabled}
        className="mt-0.5"
      />
      <div className="flex-1">
        <Label htmlFor="bulk-override" className="cursor-pointer text-sm font-medium">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-orange-600" />
          Override pause / daily cap
        </Label>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Assign even to paused counselors and exceed daily caps. Audit-logged with required reason.
        </p>
      </div>
    </div>
  );
}
