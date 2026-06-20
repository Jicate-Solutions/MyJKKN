'use client';

/** Parent Portal — Light / Dark / System theme picker (next-themes). */
import { useTheme } from 'next-themes';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';

const OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export function ThemeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { theme, setTheme } = useTheme();
  const [selected, setSelected] = useState('system');

  useEffect(() => {
    if (open) setSelected(theme ?? 'system');
  }, [open, theme]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Select Theme</DialogTitle>
        </DialogHeader>
        <RadioGroup value={selected} onValueChange={setSelected} className="gap-3 py-2">
          {OPTIONS.map((opt) => (
            <div key={opt.value} className="flex items-center gap-3">
              <RadioGroupItem value={opt.value} id={`theme-${opt.value}`} />
              <Label htmlFor={`theme-${opt.value}`} className="flex-1 cursor-pointer">
                {opt.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
        <DialogFooter className="flex-row justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-[#0b6d41] hover:bg-[#0a5733]"
            onClick={() => {
              setTheme(selected);
              onOpenChange(false);
            }}
          >
            Okay
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
