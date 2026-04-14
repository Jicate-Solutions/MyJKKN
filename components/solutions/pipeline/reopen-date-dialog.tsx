'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CalendarClock, Loader2 } from 'lucide-react';

interface ReopenDateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage: 'dormant' | 'lost';
  onConfirm: (reopenDate: string | null) => void;
  isLoading?: boolean;
}

const QUICK_OPTIONS = [
  { label: '30 days', days: 30 },
  { label: '60 days', days: 60 },
  { label: '90 days', days: 90 },
  { label: '6 months', days: 180 },
];

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function ReopenDateDialog({
  open,
  onOpenChange,
  stage,
  onConfirm,
  isLoading = false,
}: ReopenDateDialogProps) {
  const [customDate, setCustomDate] = useState('');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  const handleQuickSelect = (days: number) => {
    const date = addDays(days);
    setCustomDate(date);
    setSelectedOption(date);
  };

  const handleConfirm = () => {
    onConfirm(selectedOption || customDate || null);
  };

  const handleSkip = () => {
    onConfirm(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      // Reset state when closing
      setCustomDate('');
      setSelectedOption(null);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-amber-600" />
            Schedule Re-engagement
          </DialogTitle>
          <DialogDescription>
            {stage === 'dormant'
              ? 'When should we revisit this prospect?'
              : 'Want to schedule a future follow-up attempt?'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Quick Options */}
          <div className="grid grid-cols-2 gap-2">
            {QUICK_OPTIONS.map((opt) => {
              const optDate = addDays(opt.days);
              return (
                <Button
                  key={opt.days}
                  variant={selectedOption === optDate ? 'default' : 'outline'}
                  size="sm"
                  className="justify-start"
                  onClick={() => handleQuickSelect(opt.days)}
                >
                  {opt.label}
                </Button>
              );
            })}
          </div>

          {/* Custom Date */}
          <div className="space-y-2">
            <Label htmlFor="custom-reopen-date">Or choose a specific date</Label>
            <Input
              id="custom-reopen-date"
              type="date"
              value={customDate}
              min={new Date().toISOString().split('T')[0]}
              onChange={(e) => {
                setCustomDate(e.target.value);
                setSelectedOption(e.target.value);
              }}
            />
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:justify-between">
          <Button variant="ghost" onClick={handleSkip} disabled={isLoading}>
            Skip
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading || !selectedOption}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLoading ? 'Saving...' : 'Set Reminder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
