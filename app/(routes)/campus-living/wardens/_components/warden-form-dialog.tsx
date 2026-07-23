'use client';

import { memo, useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks';
import {
  useCreateHostelWarden,
  useUpdateHostelWarden,
} from '@/hooks/campus-living/use-hostel-wardens';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  WARDEN_DESIGNATIONS,
  WARDEN_SHIFTS,
} from '@/types/campus-living';
import type {
  HostelWarden,
  WardenDesignation,
  WardenShift,
} from '@/types/campus-living';
import { Loader2, Search, User } from 'lucide-react';

type FoundStaff = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  institution_email: string | null;
  phone: string | null;
  profile_id: string | null;
  designation: string | null;
  role_key: string | null;
  institution_id: string | null;
};

interface WardenFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  warden?: HostelWarden;
  /** Pre-selects this block in create mode (e.g. the block-scoped wardens page). */
  defaultBlockId?: string;
}

const designationLabel: Record<WardenDesignation, string> = {
  chief_warden: 'Chief Warden',
  warden: 'Warden',
  deputy_warden: 'Deputy Warden',
  floor_supervisor: 'Floor Supervisor',
  night_watcher: 'Night Watcher',
};

export function WardenFormDialog({
  open,
  onOpenChange,
  mode,
  warden,
  defaultBlockId,
}: WardenFormDialogProps) {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id ?? '';
  const createMut = useCreateHostelWarden();
  const updateMut = useUpdateHostelWarden();
  const { data: blocksResult } = useHostelBlocks(institutionId);
  const blocks = ((blocksResult as { data?: { id: string; name: string; code?: string | null }[] })?.data) ?? [];

  const [staffId, setStaffId] = useState<string>(warden?.staff_id ?? '');
  const [userId, setUserId] = useState<string>(warden?.user_id ?? '');
  // The warden record is scoped to the selected staff member's institution,
  // not the logged-in user's — super-admins have no institution_id of their own.
  const [staffInstitutionId, setStaffInstitutionId] = useState<string>(
    warden?.institution_id ?? ''
  );
  const [selectedStaffName, setSelectedStaffName] = useState<string>('');
  const [designation, setDesignation] = useState<WardenDesignation | ''>(
    warden?.designation ?? ''
  );
  const [shift, setShift] = useState<WardenShift | 'none'>(warden?.shift ?? 'none');
  const [phone, setPhone] = useState<string>(warden?.phone ?? '');
  const [blockId, setBlockId] = useState<string>(warden?.block_id ?? defaultBlockId ?? '');
  const [assignedFloors, setAssignedFloors] = useState<string>(
    warden?.assigned_floors?.join(', ') ?? ''
  );
  const [isResidential, setIsResidential] = useState<boolean>(warden?.is_residential ?? false);
  const [isActive, setIsActive] = useState<boolean>(warden?.is_active ?? true);

  // Stable callback so <StaffPicker> (memoized) doesn't re-render when other
  // fields change. Uses a functional phone update to avoid depending on `phone`.
  const handleStaffSelect = useCallback((s: FoundStaff) => {
    if (!s.profile_id) return;
    const fullName = [s.first_name, s.last_name].filter(Boolean).join(' ').trim();
    setStaffId(s.id);
    setUserId(s.profile_id);
    setStaffInstitutionId(s.institution_id ?? '');
    setSelectedStaffName(fullName || s.institution_email || s.email || s.id);
    if (s.phone) setPhone((prev) => prev || s.phone || '');
  }, []);

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && warden) {
      setStaffId(warden.staff_id);
      setUserId(warden.user_id);
      setStaffInstitutionId(warden.institution_id ?? '');
      setDesignation(warden.designation);
      setShift(warden.shift ?? 'none');
      setPhone(warden.phone);
      setBlockId(warden.block_id ?? '');
      setAssignedFloors(warden.assigned_floors?.join(', ') ?? '');
      setIsResidential(warden.is_residential ?? false);
      setIsActive(warden.is_active ?? true);
    } else {
      setStaffId('');
      setUserId('');
      setStaffInstitutionId('');
      setSelectedStaffName('');
      setDesignation('');
      setShift('none');
      setPhone('');
      setBlockId(defaultBlockId ?? '');
      setAssignedFloors('');
      setIsResidential(false);
      setIsActive(true);
    }
  }, [open, mode, warden, defaultBlockId]);

  const isPending = createMut.isPending || updateMut.isPending;
  // Prefer the selected staff member's institution; fall back to the user's own
  // (institution-scoped admins) so create still works in both setups.
  const effectiveInstitutionId = staffInstitutionId || institutionId;
  const canSubmit =
    mode === 'edit'
      ? !!designation && !!phone && !isPending
      : !!staffId && !!userId && !!designation && !!phone && !!effectiveInstitutionId && !isPending;

  const parseFloors = (s: string): number[] | null => {
    if (!s.trim()) return null;
    const nums = s
      .split(',')
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => Number.isFinite(n));
    return nums.length > 0 ? nums : null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !designation) return;

    const floors = parseFloors(assignedFloors);
    const shiftValue: WardenShift | null = shift === 'none' ? null : shift;

    if (mode === 'create') {
      await createMut.mutateAsync({
        institution_id: effectiveInstitutionId,
        staff_id: staffId,
        user_id: userId,
        designation,
        shift: shiftValue,
        phone,
        block_id: blockId || null,
        assigned_floors: floors,
        is_residential: isResidential,
        is_active: isActive,
        assigned_at: new Date().toISOString(),
      });
    } else if (warden) {
      await updateMut.mutateAsync({
        id: warden.id,
        payload: {
          designation,
          shift: shiftValue,
          phone,
          block_id: blockId || null,
          assigned_floors: floors,
          is_residential: isResidential,
          is_active: isActive,
        },
      });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='w-[95vw] max-w-[560px] max-h-[90vh] overflow-y-auto'>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {mode === 'create' ? 'Assign Warden' : 'Edit Warden'}
            </DialogTitle>
            <DialogDescription>
              {mode === 'create'
                ? 'Assign a staff member as a hostel warden. They will appear in approval chains for the block they manage.'
                : 'Update designation, block, or contact details. Use the Active toggle to relieve.'}
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-4 py-4'>
            {/* Staff picker — create mode only */}
            {mode === 'create' && (
              <div className='space-y-2'>
                <Label htmlFor='staff-search'>
                  Staff Member <span className='text-destructive'>*</span>
                </Label>
                {staffId ? (
                  <div className='flex items-center justify-between gap-2 rounded-md border p-2'>
                    <div className='flex items-center gap-2'>
                      <User className='h-4 w-4 text-muted-foreground' />
                      <div className='flex flex-col'>
                        <span className='text-sm font-medium'>
                          {selectedStaffName || staffId}
                        </span>
                        <span className='text-xs text-muted-foreground font-mono'>
                          {staffId}
                        </span>
                      </div>
                    </div>
                    <Button
                      type='button'
                      size='sm'
                      variant='ghost'
                      onClick={() => {
                        setStaffId('');
                        setUserId('');
                        setStaffInstitutionId('');
                        setSelectedStaffName('');
                      }}
                    >
                      Change
                    </Button>
                  </div>
                ) : (
                  <StaffPicker
                    institutionId={institutionId}
                    onSelect={handleStaffSelect}
                  />
                )}
              </div>
            )}

            {/* Designation */}
            <div className='space-y-2'>
              <Label htmlFor='warden-designation'>
                Designation <span className='text-destructive'>*</span>
              </Label>
              <Select
                value={designation}
                onValueChange={(v) => setDesignation(v as WardenDesignation)}
              >
                <SelectTrigger id='warden-designation'>
                  <SelectValue placeholder='Select designation' />
                </SelectTrigger>
                <SelectContent>
                  {WARDEN_DESIGNATIONS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {designationLabel[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Phone */}
            <div className='space-y-2'>
              <Label htmlFor='warden-phone'>
                Phone <span className='text-destructive'>*</span>
              </Label>
              <Input
                id='warden-phone'
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder='+91 98765 43210'
                className='font-mono'
              />
            </div>

            {/* Block + Shift */}
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-2'>
                <Label htmlFor='warden-block'>Block</Label>
                <Select
                  value={blockId || 'none'}
                  onValueChange={(v) => setBlockId(v === 'none' ? '' : v)}
                >
                  <SelectTrigger id='warden-block'>
                    <SelectValue placeholder='Unassigned' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='none'>Unassigned</SelectItem>
                    {blocks.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                        {b.code ? ` (${b.code})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-2'>
                <Label htmlFor='warden-shift'>Shift</Label>
                <Select
                  value={shift}
                  onValueChange={(v) => setShift(v as WardenShift | 'none')}
                >
                  <SelectTrigger id='warden-shift'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='none'>—</SelectItem>
                    {WARDEN_SHIFTS.map((s) => (
                      <SelectItem key={s} value={s} className='capitalize'>
                        {s.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Floors */}
            <div className='space-y-2'>
              <Label htmlFor='warden-floors'>Assigned Floors</Label>
              <Input
                id='warden-floors'
                value={assignedFloors}
                onChange={(e) => setAssignedFloors(e.target.value)}
                placeholder='Comma-separated, e.g. 1, 2, 3'
              />
              <p className='text-xs text-muted-foreground'>
                Leave empty if the warden covers the whole block.
              </p>
            </div>

            {/* Residential + Active */}
            <div className='flex items-center justify-between rounded-md border p-3'>
              <div>
                <Label htmlFor='warden-residential'>Residential</Label>
                <p className='text-xs text-muted-foreground'>
                  Lives on-site in the block (relevant for after-hours response).
                </p>
              </div>
              <Switch
                id='warden-residential'
                checked={isResidential}
                onCheckedChange={setIsResidential}
              />
            </div>

            <div className='flex items-center justify-between rounded-md border p-3'>
              <div>
                <Label htmlFor='warden-active'>Active</Label>
                <p className='text-xs text-muted-foreground'>
                  Turn off to relieve the warden from duty. History is preserved.
                </p>
              </div>
              <Switch id='warden-active' checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type='submit' disabled={!canSubmit}>
              {isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              {mode === 'create' ? 'Assign Warden' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Isolated staff search box + results list.
 *
 * Owns its own `searchTerm`/`searchResults`/`searching` state so typing only
 * re-renders THIS small component, not the whole warden form (which carries
 * ~15 fields + several data hooks). Memoized + a stable `onSelect` callback
 * keep it from re-rendering when sibling fields (designation, phone, …) change.
 *
 * Only mounted in create mode while no staff is selected, so it needs no
 * `mode` guard — selecting a staff member unmounts it.
 */
const StaffPicker = memo(function StaffPicker({
  institutionId,
  onSelect,
}: {
  institutionId: string;
  onSelect: (staff: FoundStaff) => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<FoundStaff[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const term = searchTerm.trim();
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }
    // Commas/parentheses are PostgREST `.or()` control characters — strip them
    // so a query like "Smith, John" doesn't break the filter and silently
    // return nothing. `%`/`_` stay (harmless inside the ilike pattern here).
    const safe = term.replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!safe) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const supabase = createClientSupabaseClient();
        // Search ALL staff — wardens are appointed from general faculty/staff,
        // not only people who already hold a warden role_key. The warden rank is
        // chosen via the Designation field below; the picker just needs a staff
        // member with a linked profile. (Do NOT re-add a role_key allowlist here —
        // that silently hides eligible staff. See campus-living staff-picker note.)
        let q = supabase
          .from('staff')
          .select('id, first_name, last_name, email, institution_email, phone, profile_id, designation, role_key, institution_id')
          .or(
            `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,institution_email.ilike.%${safe}%,email.ilike.%${safe}%`
          )
          .limit(25);
        if (institutionId) q = q.eq('institution_id', institutionId);
        const { data } = await q;
        if (!cancelled) setSearchResults((data ?? []) as FoundStaff[]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [searchTerm, institutionId]);

  return (
    <>
      <div className='relative'>
        <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
        <Input
          id='staff-search'
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder='Search staff by name or email…'
          className='pl-9'
          autoComplete='off'
        />
      </div>
      {searching && <p className='text-xs text-muted-foreground'>Searching...</p>}
      {!searching && searchTerm.trim().length >= 2 && searchResults.length === 0 && (
        <p className='text-xs text-muted-foreground'>No matching staff found.</p>
      )}
      {searchResults.length > 0 && (
        <div className='max-h-[220px] overflow-y-auto rounded-md border'>
          {searchResults.map((s) => {
            const fullName = [s.first_name, s.last_name]
              .filter(Boolean)
              .join(' ')
              .trim();
            const noProfile = !s.profile_id;
            return (
              <button
                type='button'
                key={s.id}
                disabled={noProfile}
                className='w-full text-left p-2 hover:bg-accent border-b last:border-0 disabled:opacity-50 disabled:cursor-not-allowed'
                onClick={() => onSelect(s)}
              >
                <div className='text-sm font-medium'>
                  {fullName || (
                    <span className='text-muted-foreground italic'>(no name)</span>
                  )}
                </div>
                <div className='text-xs text-muted-foreground'>
                  {s.institution_email || s.email || '—'}
                  {s.role_key && (
                    <span className='ml-1 inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary capitalize'>
                      {s.role_key.replace(/_/g, ' ')}
                    </span>
                  )}
                  {s.designation && <span> · {s.designation}</span>}
                </div>
                {noProfile && (
                  <div className='text-xs text-destructive mt-1'>
                    No linked user profile — cannot assign as warden
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
});
