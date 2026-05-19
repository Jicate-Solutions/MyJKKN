'use client';

// app/(routes)/bos/compositions/_components/add-member-dialog.tsx
// "Add Member" dialog for a BoS Composition.
//
// Behaviour:
//   - chairman | internal_member  -> Facilitator picker (staff with
//                                    employment_categories = "Facilitator",
//                                    scoped to current institution).
//   - university_nominee | subject_expert | industry_expert | alumni
//                                 -> External Expert picker (BoS experts
//                                    across ALL institutions).
//
// Once a person is selected, display fields auto-fill and lock so the
// caller cannot accidentally edit canonical contact info. Use "Change"
// to clear the selection and pick someone else.

import { useEffect, useMemo, useState } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';

import { useAddBosMember } from '@/hooks/bos/use-bos-members';
import { useInstitutionContextById } from '@/hooks/use-institution-context';
import {
  BosMemberType,
  BOS_MEMBER_TYPE_LABELS,
  BosExternalExpert,
} from '@/types/bos';
import { logger } from '@/lib/utils/enhanced-logger';

// ── Member-type → source mapping ───────────────────────────────────────────────
// Internal types come from staff (Facilitator). External types come from the
// BoS External Expert directory. Keep this in sync with bos_external_experts
// category enum.

const EXTERNAL_EXPERT_TYPES: BosMemberType[] = [
  'university_nominee',
  'subject_expert',
  'industry_expert',
  'alumni',
  'startup',
];

function isExternalExpertType(t: BosMemberType): boolean {
  return EXTERNAL_EXPERT_TYPES.includes(t);
}

// ── Lookup row shapes ─────────────────────────────────────────────────────────
// Matches the JSON returned by /api/bos/lookup/facilitators and /api/bos/experts.

interface FacilitatorRow {
  id: string;
  first_name: string;
  last_name: string;
  staff_id: string | null;
  email: string | null;
  institution_email: string | null;
  phone: string | null;
  designation: string | null;
  institution: { id: string; name: string } | null;
  department: { id: string; department_name: string } | null;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface AddMemberDialogProps {
  open: boolean;
  onClose: () => void;
  compositionId: string;
  /**
   * The composition's own institutions_id. The FacilitatorPicker uses this
   * to resolve the full CAS sibling pair (Aided + Self-Financing) via
   * `useInstitutionContextById`, so the staff search spans both UUIDs
   * automatically — no need to pass siblings in.
   */
  institutionsId: string;
  /**
   * IDs of staff already present on this composition. The FacilitatorPicker
   * filters them out so the same person can't be added twice. The DB also
   * enforces this via uniq_bos_members_composition_staff — this prop is just
   * the UX softener so the user never sees the duplicate option.
   */
  assignedStaffIds?: readonly string[];
  /**
   * IDs of external experts already present on this composition. See
   * `assignedStaffIds` — same rationale, mirrored for the expert picker.
   */
  assignedExpertIds?: readonly string[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AddMemberDialog({
  open,
  onClose,
  compositionId,
  institutionsId,
  assignedStaffIds,
  assignedExpertIds,
}: AddMemberDialogProps) {
  const addMember = useAddBosMember();
  // Stable Set references so the pickers can do O(1) `.has(id)` filtering
  // without rebuilding the set on every keystroke.
  const assignedStaffSet = useMemo(
    () => new Set(assignedStaffIds ?? []),
    [assignedStaffIds],
  );
  const assignedExpertSet = useMemo(
    () => new Set(assignedExpertIds ?? []),
    [assignedExpertIds],
  );

  const [memberType, setMemberType] = useState<BosMemberType>('internal_member');

  // Selected source row + derived display fields. Exactly one of
  // selectedFacilitator / selectedExpert is non-null at a time.
  const [selectedFacilitator, setSelectedFacilitator] =
    useState<FacilitatorRow | null>(null);
  const [selectedExpert, setSelectedExpert] = useState<BosExternalExpert | null>(
    null
  );

  // Display fields. Locked once a person is selected.
  const [displayName, setDisplayName] = useState('');
  const [displayDesignation, setDisplayDesignation] = useState('');
  const [displayDepartment, setDisplayDepartment] = useState('');
  const [displayInstitution, setDisplayInstitution] = useState('');
  const [email, setEmail] = useState('');
  const [contactNo, setContactNo] = useState('');

  const useExpertPicker = isExternalExpertType(memberType);
  const hasSelection = !!selectedFacilitator || !!selectedExpert;

  // Reset to a clean slate.
  const resetAll = () => {
    setMemberType('internal_member');
    setSelectedFacilitator(null);
    setSelectedExpert(null);
    setDisplayName('');
    setDisplayDesignation('');
    setDisplayDepartment('');
    setDisplayInstitution('');
    setEmail('');
    setContactNo('');
  };

  // Switching member type between internal/external buckets clears the
  // currently-selected person, since a facilitator cannot be persisted
  // as an industry_expert and vice versa.
  useEffect(() => {
    if (useExpertPicker && selectedFacilitator) {
      setSelectedFacilitator(null);
      setDisplayName('');
      setDisplayDesignation('');
      setDisplayDepartment('');
      setDisplayInstitution('');
      setEmail('');
      setContactNo('');
    }
    if (!useExpertPicker && selectedExpert) {
      setSelectedExpert(null);
      setDisplayName('');
      setDisplayDesignation('');
      setDisplayDepartment('');
      setDisplayInstitution('');
      setEmail('');
      setContactNo('');
    }
  }, [useExpertPicker, selectedExpert, selectedFacilitator]);

  const handleSelectFacilitator = (row: FacilitatorRow) => {
    setSelectedFacilitator(row);
    setSelectedExpert(null);
    const fullName = `${row.first_name} ${row.last_name}`.trim();
    setDisplayName(fullName);
    setDisplayDesignation(row.designation ?? '');
    // department.department_name on the staff row → denormalised onto
    // bos_members.display_department for the call-letter PDF. Falls back
    // to empty string if the staff record has no department assigned.
    setDisplayDepartment(row.department?.department_name ?? '');
    setDisplayInstitution(row.institution?.name ?? '');
    setEmail(row.institution_email ?? row.email ?? '');
    setContactNo(row.phone ?? '');
  };

  const handleSelectExpert = (row: BosExternalExpert) => {
    setSelectedExpert(row);
    setSelectedFacilitator(null);
    setDisplayName(row.name);
    setDisplayDesignation(row.designation ?? '');
    // External experts store department directly on the expert row.
    setDisplayDepartment(row.department_name ?? '');
    setDisplayInstitution(row.institution_name ?? '');
    setEmail(row.email ?? '');
    setContactNo(row.contact_no ?? '');
  };

  const handleClearSelection = () => {
    setSelectedFacilitator(null);
    setSelectedExpert(null);
    setDisplayName('');
    setDisplayDesignation('');
    setDisplayDepartment('');
    setDisplayInstitution('');
    setEmail('');
    setContactNo('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!hasSelection) {
      toast.error(
        useExpertPicker
          ? 'Please select an external expert'
          : 'Please select a staff member'
      );
      return;
    }

    // Fire-and-forget: `useAddBosMember`'s onMutate has already pushed a
    // placeholder row into the cache by the time `.mutate()` returns, so we
    // can close the dialog immediately. The user then sees the new member
    // appear in the list this tick instead of waiting for the network
    // round-trip. Toast / error rollback are wired via per-call callbacks.
    addMember.mutate(
      {
        institutions_id: institutionsId,
        composition_id: compositionId,
        member_type: memberType,
        // Persist the source link so future edits can re-resolve canonical info.
        staff_id: selectedFacilitator?.id,
        expert_id: selectedExpert?.id,
        display_name: displayName.trim(),
        display_designation: displayDesignation.trim() || undefined,
        display_department: displayDepartment.trim() || undefined,
        display_institution: displayInstitution.trim() || undefined,
        email: email.trim() || undefined,
        contact_no: contactNo.trim() || undefined,
        is_active: true,
        sort_order: 0,
      },
      {
        onSuccess: () => toast.success('Member added'),
        onError: (err) => {
          logger.error('academic/bos', 'Failed to add member', err);
          toast.error((err as Error).message || 'Failed to add member');
        },
      },
    );

    resetAll();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          resetAll();
          onClose();
        }
      }}
    >
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className='space-y-4'>
          {/* ── Member Type ──────────────────────────────────────────────── */}
          <div className='space-y-2'>
            <Label>
              Member Type <span className='text-destructive'>*</span>
            </Label>
            <Select
              value={memberType}
              onValueChange={(v) => setMemberType(v as BosMemberType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(BOS_MEMBER_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Picker (depends on member type) ─────────────────────────── */}
          {useExpertPicker ? (
            <ExpertPicker
              memberType={memberType}
              selected={selectedExpert}
              onSelect={handleSelectExpert}
              onClear={handleClearSelection}
              excludeIds={assignedExpertSet}
            />
          ) : (
            <FacilitatorPicker
              institutionsId={institutionsId}
              selected={selectedFacilitator}
              onSelect={handleSelectFacilitator}
              onClear={handleClearSelection}
              excludeIds={assignedStaffSet}
            />
          )}

          {/* ── Locked display fields (filled from selection) ───────────── */}
          {hasSelection && (
            <div className='rounded-md border bg-muted/30 p-3 space-y-3'>
              <div className='space-y-2'>
                <Label className='text-xs text-muted-foreground'>Full Name</Label>
                <Input value={displayName} readOnly disabled />
              </div>

              <div className='grid grid-cols-2 gap-3'>
                <div className='space-y-2'>
                  <Label className='text-xs text-muted-foreground'>
                    Designation
                  </Label>
                  <Input value={displayDesignation} readOnly disabled />
                </div>
                <div className='space-y-2'>
                  <Label className='text-xs text-muted-foreground'>
                    Institution
                  </Label>
                  <Input value={displayInstitution} readOnly disabled />
                </div>
              </div>

              <div className='grid grid-cols-2 gap-3'>
                <div className='space-y-2'>
                  <Label className='text-xs text-muted-foreground'>Email</Label>
                  <Input value={email} readOnly disabled />
                </div>
                <div className='space-y-2'>
                  <Label className='text-xs text-muted-foreground'>
                    Contact No.
                  </Label>
                  <Input value={contactNo} readOnly disabled />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => {
                resetAll();
                onClose();
              }}
            >
              Cancel
            </Button>
            <Button
              type='submit'
              disabled={addMember.isPending || !hasSelection}
            >
              {addMember.isPending ? 'Adding...' : 'Add Member'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Facilitator picker ────────────────────────────────────────────────────────
// Renders inline (no Popover portal) to avoid Radix Dialog focus-trap conflicts.

function FacilitatorPicker({
  institutionsId,
  selected,
  onSelect,
  onClear,
  excludeIds,
}: {
  institutionsId: string;
  selected: FacilitatorRow | null;
  onSelect: (row: FacilitatorRow) => void;
  onClear: () => void;
  /** Staff IDs already on the composition — hidden from the list. */
  excludeIds?: ReadonlySet<string>;
}) {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<FacilitatorRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Resolve the composition's institution to its full CAS sibling pair via
  // COE API (Arts Aided + Self-Financing share one counselling_code → two
  // MyJKKN UUIDs). React Query caches the result per institution_id, so this
  // is effectively free once any component on the page has fetched the same
  // id (the composition page itself does).
  const institutionCtx = useInstitutionContextById(institutionsId);
  const allInstitutionIds: string[] =
    institutionCtx.data?.myjkkn_institution_ids?.length
      ? institutionCtx.data.myjkkn_institution_ids
      : institutionsId
        ? [institutionsId]
        : [];
  // Send csv when we have the pair, single id otherwise (server expands
  // either way — but the csv form makes the URL self-documenting).
  const idsCsv = allInstitutionIds.length > 1
    ? allInstitutionIds.join(',')
    : null;

  useEffect(() => {
    if (selected) return;
    // Wait for the institution context to resolve before firing the staff
    // query. Without this guard, the first request races and only includes
    // the single institutionsId — defeating the CAS expansion.
    if (institutionCtx.isLoading) return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ limit: '200' });
    if (idsCsv) {
      params.set('institutionsIds', idsCsv);
    } else {
      params.set('institutionsId', institutionsId);
    }
    if (search) params.set('search', search);
    fetch(`/api/bos/lookup/facilitators?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((json) => { if (!cancelled) setRows(json.data ?? []); })
      .catch((err) => { if (!cancelled) logger.error('academic/bos', 'Facilitator fetch failed', err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [search, institutionsId, idsCsv, selected, institutionCtx.isLoading]);

  // Hide staff that are already on this composition. Filtering on the client
  // is sufficient because the lookup endpoint returns a capped page (limit
  // 200) and the assigned set is small (a composition rarely exceeds a
  // dozen members).
  const visibleRows = excludeIds && excludeIds.size > 0
    ? rows.filter((r) => !excludeIds.has(r.id))
    : rows;

  if (selected) {
    return (
      <div className='space-y-2'>
        <Label>Select Member <span className='text-destructive'>*</span></Label>
        <div className='flex items-center justify-between rounded-md border px-3 py-2'>
          <span className='text-sm font-medium'>
            {`${selected.first_name} ${selected.last_name}`.trim()}
          </span>
          <Button type='button' variant='ghost' size='sm' className='h-7 px-2 text-xs' onClick={onClear}>
            <X className='mr-1 h-3 w-3' />Change
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className='space-y-2'>
      <Label>Select Member <span className='text-destructive'>*</span></Label>
      <Command shouldFilter={false} className='rounded-md border'>
        <CommandInput
          placeholder='Search staff…'
          value={search}
          onValueChange={setSearch}
        />
        <CommandList className='max-h-[200px]'>
          {loading ? (
            <div className='flex items-center justify-center py-6 text-xs text-muted-foreground'>
              <Loader2 className='mr-2 h-3 w-3 animate-spin' />
              Loading…
            </div>
          ) : visibleRows.length === 0 ? (
            <CommandEmpty>
              {rows.length === 0
                ? 'No staff found.'
                : 'All matching staff are already members.'}
            </CommandEmpty>
          ) : (
            <CommandGroup>
              {visibleRows.map((row) => {
                const fullName = `${row.first_name} ${row.last_name}`.trim();
                const subline = [row.designation, row.department?.department_name]
                  .filter(Boolean)
                  .join(' • ');
                return (
                  <CommandItem
                    key={row.id}
                    value={row.id}
                    onSelect={() => onSelect(row)}
                    className='flex flex-col items-start gap-0.5'
                  >
                    <span className='font-medium text-sm'>{fullName}</span>
                    {subline && (
                      <span className='text-xs text-muted-foreground'>{subline}</span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </div>
  );
}

// ── Expert picker ─────────────────────────────────────────────────────────────

function ExpertPicker({
  memberType,
  selected,
  onSelect,
  onClear,
  excludeIds,
}: {
  memberType: BosMemberType;
  selected: BosExternalExpert | null;
  onSelect: (row: BosExternalExpert) => void;
  onClear: () => void;
  /** Expert IDs already on the composition — hidden from the list. */
  excludeIds?: ReadonlySet<string>;
}) {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<BosExternalExpert[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selected) return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({
      allInstitutions: 'true',
      limit: '200',
      isActive: 'true',
    });
    if (search) params.set('search', search);
    fetch(`/api/bos/experts?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((json) => { if (!cancelled) setRows(json.data ?? []); })
      .catch((err) => { if (!cancelled) logger.error('academic/bos', 'Expert fetch failed', err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [search, selected]);

  // Hide experts already on this composition. Same approach as
  // FacilitatorPicker — see the comment there.
  const visibleRows = excludeIds && excludeIds.size > 0
    ? rows.filter((r) => !excludeIds.has(r.id))
    : rows;

  if (selected) {
    return (
      <div className='space-y-2'>
        <Label>Select External Expert <span className='text-destructive'>*</span></Label>
        <div className='flex items-center justify-between rounded-md border px-3 py-2'>
          <span className='text-sm font-medium'>{selected.name}</span>
          <Button type='button' variant='ghost' size='sm' className='h-7 px-2 text-xs' onClick={onClear}>
            <X className='mr-1 h-3 w-3' />Change
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className='space-y-2'>
      <Label>Select External Expert <span className='text-destructive'>*</span></Label>
      <Command shouldFilter={false} className='rounded-md border'>
        <CommandInput
          placeholder='Search experts (all institutions)…'
          value={search}
          onValueChange={setSearch}
        />
        <CommandList className='max-h-[200px]'>
          {loading ? (
            <div className='flex items-center justify-center py-6 text-xs text-muted-foreground'>
              <Loader2 className='mr-2 h-3 w-3 animate-spin' />
              Loading…
            </div>
          ) : visibleRows.length === 0 ? (
            <CommandEmpty>
              {rows.length === 0
                ? 'No experts found.'
                : 'All matching experts are already members.'}
            </CommandEmpty>
          ) : (
            <CommandGroup>
              {visibleRows.map((row) => {
                const subline = [row.designation, row.institution_name]
                  .filter(Boolean)
                  .join(' • ');
                return (
                  <CommandItem
                    key={row.id}
                    value={row.id}
                    onSelect={() => onSelect(row)}
                    className='flex flex-col items-start gap-0.5'
                  >
                    <div className='flex w-full items-center justify-between gap-2'>
                      <span className='font-medium text-sm truncate'>{row.name}</span>
                      <Badge variant='outline' className='text-[10px] py-0'>
                        {row.category}
                      </Badge>
                    </div>
                    {subline && (
                      <span className='text-xs text-muted-foreground truncate w-full'>
                        {subline}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </div>
  );
}
