'use client';

import { useState } from 'react';
import {
  useSearchHosteliteCandidates,
  useAddLearnerToHostel,
} from '@/hooks/campus-living/use-learner-hostelites';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Search, UserPlus } from 'lucide-react';
import type { LearnerHostelite, LearnerHostelType } from '@/types/campus-living';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId: string | undefined;
}

type HostelTypeSelection = 'AC HOSTEL' | 'NON-AC HOSTEL' | 'unset';

export function AddLearnerToHostelDialog({ open, onOpenChange, institutionId }: Props) {
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<LearnerHostelite | null>(null);
  const [hostelType, setHostelType] = useState<HostelTypeSelection>('unset');

  const { data: candidates = [], isLoading } = useSearchHosteliteCandidates(institutionId, search);
  const addMut = useAddLearnerToHostel();

  function reset() {
    setSearch('');
    setPicked(null);
    setHostelType('unset');
  }

  function close() {
    if (addMut.isPending) return;
    reset();
    onOpenChange(false);
  }

  async function handleConfirm() {
    if (!picked) return;
    const ht: LearnerHostelType | undefined =
      hostelType === 'unset' ? undefined : hostelType;
    try {
      await addMut.mutateAsync({ learnerId: picked.id, hostelType: ht });
      reset();
      onOpenChange(false);
    } catch {
      // toast surfaced by hook
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className='max-w-[560px]'>
        <DialogHeader>
          <DialogTitle>Add Learner to Hostel</DialogTitle>
          <DialogDescription>
            Search existing MyJKKN learners and mark one as a hostelite. This flips their
            admission classification to <strong>Hostel</strong>. You can allocate a bed
            separately from the Allocations page.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4 py-2'>
          {/* Search input */}
          <div className='space-y-1'>
            <Label htmlFor='add-learner-search'>Search</Label>
            <div className='relative'>
              <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
              <Input
                id='add-learner-search'
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPicked(null);
                }}
                placeholder='Roll number, name, or email…'
                className='pl-9'
                autoFocus
              />
            </div>
            {search.trim().length > 0 && search.trim().length < 2 && (
              <p className='text-xs text-muted-foreground'>Type at least 2 characters</p>
            )}
          </div>

          {/* Candidate list */}
          {search.trim().length >= 2 && (
            <div className='border rounded-md max-h-[220px] overflow-y-auto'>
              {isLoading ? (
                <div className='p-4 text-center text-sm text-muted-foreground'>
                  <Loader2 className='inline h-4 w-4 animate-spin mr-2' />
                  Searching…
                </div>
              ) : candidates.length === 0 ? (
                <div className='p-4 text-center text-sm text-muted-foreground'>
                  No non-hostelite learners match.
                </div>
              ) : (
                <ul className='divide-y'>
                  {candidates.map((c) => {
                    const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || '(unnamed)';
                    const selected = picked?.id === c.id;
                    return (
                      <li key={c.id}>
                        <button
                          type='button'
                          onClick={() => setPicked(c)}
                          className={`w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors ${
                            selected ? 'bg-muted' : ''
                          }`}
                        >
                          <div className='flex items-center justify-between gap-3'>
                            <div className='min-w-0'>
                              <div className='font-medium truncate'>{name}</div>
                              <div className='text-xs text-muted-foreground truncate'>
                                {c.roll_number ?? '—'} · {c.student_email ?? c.college_email ?? '—'}
                              </div>
                            </div>
                            <div className='text-xs text-muted-foreground shrink-0 capitalize'>
                              {c.accommodation_type?.toLowerCase() || 'not set'}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* Hostel type */}
          {picked && (
            <div className='space-y-1'>
              <Label htmlFor='add-hostel-type'>Hostel type (optional)</Label>
              <Select
                value={hostelType}
                onValueChange={(v) => setHostelType(v as HostelTypeSelection)}
              >
                <SelectTrigger id='add-hostel-type'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='unset'>Not set yet</SelectItem>
                  <SelectItem value='AC HOSTEL'>AC Hostel</SelectItem>
                  <SelectItem value='NON-AC HOSTEL'>Non-AC Hostel</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={close} disabled={addMut.isPending}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!picked || addMut.isPending}>
            {addMut.isPending ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : (
              <UserPlus className='mr-2 h-4 w-4' />
            )}
            Add to Hostel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
