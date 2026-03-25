'use client';

// apply-leave-dialog.tsx
// Added: 2026-03-22 - Quick "Apply Leave" sheet triggered from the leave calendar day cell

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { AlertCircle, CalendarPlus, Loader2 } from 'lucide-react';
import { useActiveLeaveTypes } from '@/hooks/academic/use-leave-types';
import { LeaveService } from '@/lib/services/academic/leave-service';
import { LEAVE_KEYS } from '@/hooks/academic/use-leaves';
import { LEAVE_CALENDAR_KEYS } from '@/hooks/academic/use-leave-calendar';
import toast from 'react-hot-toast';
import type { CreateLeaveDto } from '@/types/leaves';

interface ApplyLeaveDialogProps {
  isOpen: boolean;
  onClose: () => void;
  institutionId: string;
  userId: string;
  prefilledDate?: string; // ISO date string from the clicked calendar cell
}

export function ApplyLeaveDialog({
  isOpen,
  onClose,
  institutionId,
  userId,
  prefilledDate
}: ApplyLeaveDialogProps) {
  const queryClient = useQueryClient();
  const { leaveTypes, loading: typesLoading } = useActiveLeaveTypes(institutionId);

  const createMutation = useMutation({
    mutationFn: (data: CreateLeaveDto) => LeaveService.createLeave(data),
    onSuccess: () => {
      // Invalidate both the leaves list and the calendar view
      queryClient.invalidateQueries({ queryKey: LEAVE_KEYS.all });
      queryClient.invalidateQueries({ queryKey: LEAVE_CALENDAR_KEYS.all });
      toast.success('Leave submitted successfully');
      onClose();
    },
    onError: () => {
      setError('Failed to submit leave. Please try again.');
    }
  });

  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [leaveName, setLeaveName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Pre-fill dates when the dialog opens from a calendar cell click
  useEffect(() => {
    if (isOpen) {
      const date = prefilledDate ?? new Date().toISOString().split('T')[0];
      setStartDate(date);
      setEndDate(date);
      setLeaveTypeId('');
      setLeaveName('');
      setDescription('');
      setError(null);
    }
  }, [isOpen, prefilledDate]);

  const handleSubmit = () => {
    if (!leaveTypeId) {
      setError('Please select a leave type.');
      return;
    }
    if (!leaveName.trim()) {
      setError('Leave name is required.');
      return;
    }
    if (!startDate || !endDate) {
      setError('Please set a date range.');
      return;
    }
    if (endDate < startDate) {
      setError('End date cannot be before start date.');
      return;
    }

    setError(null);
    createMutation.mutate({
      institution_id: institutionId,
      leave_type_id: leaveTypeId,
      leave_name: leaveName.trim(),
      description: description.trim() || undefined,
      start_date: startDate,
      end_date: endDate,
      scope_level: 'institution',
      requested_by: userId
    });
  };

  const submitting = createMutation.isPending;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className='sm:max-w-md'>
        <SheetHeader>
          <SheetTitle className='flex items-center gap-2'>
            <CalendarPlus className='h-5 w-5 text-primary' />
            Apply Institution Leave
          </SheetTitle>
          <SheetDescription>
            Apply a leave for the entire institution. Once submitted, it will be
            pending approval.
          </SheetDescription>
        </SheetHeader>

        <div className='space-y-4 py-4'>
          {/* Leave Type */}
          <div className='space-y-1.5'>
            <Label htmlFor='leave-type'>Leave Type <span className='text-destructive'>*</span></Label>
            <Select
              value={leaveTypeId}
              onValueChange={setLeaveTypeId}
              disabled={typesLoading || submitting}
            >
              <SelectTrigger id='leave-type'>
                <SelectValue
                  placeholder={typesLoading ? 'Loading types…' : 'Select leave type'}
                />
              </SelectTrigger>
              <SelectContent>
                {leaveTypes.map((lt) => (
                  <SelectItem key={lt.id} value={lt.id}>
                    <div className='flex items-center gap-2'>
                      <span
                        className='inline-block w-2.5 h-2.5 rounded-full'
                        style={{ backgroundColor: lt.color_code }}
                      />
                      {lt.type_name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Leave Name */}
          <div className='space-y-1.5'>
            <Label htmlFor='leave-name'>Leave Name <span className='text-destructive'>*</span></Label>
            <Input
              id='leave-name'
              placeholder='e.g. Republic Day, Diwali Holiday'
              value={leaveName}
              onChange={(e) => setLeaveName(e.target.value)}
              disabled={submitting}
            />
          </div>

          {/* Date Range */}
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1.5'>
              <Label htmlFor='start-date'>Start Date <span className='text-destructive'>*</span></Label>
              <Input
                id='start-date'
                type='date'
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='end-date'>End Date <span className='text-destructive'>*</span></Label>
              <Input
                id='end-date'
                type='date'
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          {/* Description */}
          <div className='space-y-1.5'>
            <Label htmlFor='description'>Description</Label>
            <Textarea
              id='description'
              placeholder='Optional notes about this leave…'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              disabled={submitting}
            />
          </div>

          {/* Scope note */}
          <p className='text-xs text-muted-foreground bg-muted rounded-md px-3 py-2'>
            This leave will be applied at the <strong>institution</strong> level — it will
            appear on the calendar for all departments, semesters, and sections.
          </p>

          {/* Error */}
          {error && (
            <p className='text-sm text-destructive flex items-center gap-1.5'>
              <AlertCircle className='h-3.5 w-3.5 shrink-0' />
              {error}
            </p>
          )}
        </div>

        <SheetFooter>
          <Button variant='outline' onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || typesLoading}>
            {submitting ? (
              <>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                Submitting…
              </>
            ) : (
              'Submit Leave'
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
