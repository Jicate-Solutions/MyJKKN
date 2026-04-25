'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save } from 'lucide-react';
import type { AdmissionYearRow } from './seat-config-columns';

interface EditSeatDialogProps {
  row: AdmissionYearRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (row: AdmissionYearRow, newValue: number) => Promise<void>;
}

export function EditSeatDialog({
  row,
  open,
  onOpenChange,
  onSave
}: EditSeatDialogProps) {
  const [value, setValue] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (row) setValue(row.sanctioned_intake);
  }, [row]);

  const handleSave = async () => {
    if (!row) return;
    setSaving(true);
    try {
      await onSave(row, value);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-sm'>
        <DialogHeader>
          <DialogTitle className='text-base'>Edit Seat Count</DialogTitle>
          <DialogDescription className='text-xs'>
            {row?.admission_year_name}
            {row?.program_name ? ` › ${row.program_name}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4 py-2'>
          <div className='space-y-1 text-xs text-muted-foreground'>
            <div>
              Cohort: {row?.program_start_year} → {row?.program_end_year}
            </div>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='seat-input'>Sanctioned Seats (this cohort)</Label>
            <Input
              id='seat-input'
              type='number'
              min={0}
              max={9999}
              value={value}
              onChange={(e) => setValue(Number(e.target.value) || 0)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
              }}
              className='text-lg font-semibold text-center'
              autoFocus
            />
            <p className='text-xs text-muted-foreground'>
              Seat count for this specific admission year and program cohort.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className='h-4 w-4 mr-1 animate-spin' /> Saving…
              </>
            ) : (
              <>
                <Save className='h-4 w-4 mr-1' /> Save
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
