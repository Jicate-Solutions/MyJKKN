'use client';

// app/(routes)/bos/compositions/_components/add-member-dialog.tsx
// "Add Member" dialog for a BoS Composition.
//
// Behaviour:
//   - Every member type asks Source first — Staff (internal) | External Expert —
//     same control as the Governing Body / Academic Council Add Member dialogs.
//   - Staff → Facilitator picker (employment_categories = "Facilitator",
//     scoped to current institution / CAS siblings).
//   - External Expert → BoS experts across ALL institutions.
//   - Exception: catalog name "Nominated by the Governing Body" → still asks
//     Source, but the picker lists that institution's Governing Body roster
//     for the composition's academic year (GET /api/bos/governing-body).
//
// Once a person is selected, display fields auto-fill and lock so the
// caller cannot accidentally edit canonical contact info. Use "Change"
// to clear the selection and pick someone else.

import { useEffect, useMemo, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
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
import { useDebounceValue } from '@/hooks/use-debounce-value';
import { useInstitutionContextById } from '@/hooks/use-institution-context';
import {
  BosCommittee,
  BosMemberType,
  BosMemberTypeRecord,
  BOS_MEMBER_TYPE_LABELS,
  BosExternalExpert,
} from '@/types/bos';
import { logger } from '@/lib/utils/enhanced-logger';

/** Catalog name match — "Nominated by the Governing Body" (and close variants). */
function isGoverningBodyNomineeType(name: string | null | undefined): boolean {
  if (!name) return false;
  return /governing\s*body/i.test(name);
}

// base_type values that represent EXTERNAL people (BoS Experts), not internal
// staff. When Source = "External Expert" the Member Type dropdown is filtered to
// these so only expert-appropriate types show; Source = "Staff (internal)" is
// left unfiltered. Mirrors EXTERNAL_BASE_TYPES in the TA/DA rate-settings dialog.
const EXTERNAL_EXPERT_BASE_TYPES: ReadonlySet<BosMemberType> = new Set<BosMemberType>([
  'university_nominee',
  'subject_expert',
  'academic_expert',
  'industry_expert',
  'alumni',
  'startup',
  'student',
  // Faculty / Chairman are usually internal, but can be brought in from the
  // external-expert directory (e.g. a chairman or faculty member from another
  // institution) — so they stay selectable under Source = External Expert.
  'faculty_member',
  'chairman',
]);

type MemberSource = 'staff' | 'expert';

/** Row shape returned by GET /api/bos/governing-body for the nominee picker. */
export interface GbNomineeRow {
  id: string;
  staff_id?: string | null;
  expert_id?: string | null;
  member_type?: string | null;
  display_name: string;
  display_designation?: string | null;
  display_department?: string | null;
  display_institution?: string | null;
  email?: string | null;
  contact_no?: string | null;
}

// ── Lookup row shapes ─────────────────────────────────────────────────────────
// Matches the JSON returned by /api/bos/lookup/facilitators and /api/bos/experts.

export interface FacilitatorRow {
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
   * Committees of this composition's institution. The dialog asks which
   * committee the new member sits on; members are grouped by committee on the
   * detail page. Empty list = the select is hidden and members go to "General".
   */
  committees?: readonly BosCommittee[];
  /**
   * Institution-wise member types (from /bos/member-types). When provided,
   * the Member Type dropdown is table-driven and the insert carries
   * member_type_id; member_type is set to the row's base_type so chairman
   * authorization and the staff/expert picker keep working. Empty list =
   * fall back to the legacy hardcoded enum (old data / unseeded institution).
   */
  memberTypes?: readonly BosMemberTypeRecord[];
  /**
   * Existing members of this composition (staff/expert source + committee).
   * Used to hide people already on the SELECTED committee from the pickers —
   * the same person may legitimately sit on two different committees, so the
   * exclusion is per committee, mirroring the DB's per-(composition,
   * committee) unique indexes (20260610_bos_committees.sql).
   */
  existingMembers?: readonly {
    staff_id?: string | null;
    expert_id?: string | null;
    committee_id?: string | null;
  }[];
  /**
   * Member types to hide from the picker. Used by the Academic Council, which
   * auto-snapshots BoS chairmen and so removes 'chairman' from the manual-add
   * options (the council's presiding officer is added as a 'principal' instead).
   * Applies to both the table-driven and legacy-enum dropdowns.
   */
  excludeMemberTypes?: readonly BosMemberType[];
  /**
   * Composition academic year — required to resolve the Governing Body roster
   * when Member Type is "Nominated by the Governing Body".
   */
  academicYear?: string;
}

/** Sentinel for "no committee" in the Radix Select (empty value is reserved). */
const GENERAL_COMMITTEE = '__general__';

// ── Component ─────────────────────────────────────────────────────────────────

export function AddMemberDialog({
  open,
  onClose,
  compositionId,
  institutionsId,
  committees = [],
  memberTypes = [],
  existingMembers = [],
  excludeMemberTypes = [],
  academicYear,
}: AddMemberDialogProps) {
  const addMember = useAddBosMember();

  // Source mirrors Governing Body / Academic Council: Staff (internal) vs
  // External Expert. Drives the picker for every member type AND (below)
  // filters the Member Type dropdown when External Expert is chosen.
  const [source, setSource] = useState<MemberSource>('staff');
  const [selectedGbMember, setSelectedGbMember] = useState<GbNomineeRow | null>(null);

  // Member type — table-driven when the institution has bos_member_types rows,
  // legacy hardcoded enum otherwise. Defaults are derived (not effect-synced):
  // null state = "user hasn't picked yet" → first row by sort_order.
  // excludeMemberTypes hides types the caller doesn't allow (e.g. AC hides
  // 'chairman'); applied to the table-driven list by base_type.
  const activeMemberTypes = useMemo(
    () =>
      memberTypes.filter(
        (t) => t.is_active && !excludeMemberTypes.includes(t.base_type),
      ),
    [memberTypes, excludeMemberTypes],
  );
  // When Source = External Expert, restrict the Member Type dropdown to
  // external (expert) types only. Staff (internal) leaves the list unfiltered.
  const visibleMemberTypes = useMemo(
    () =>
      source === 'expert'
        ? activeMemberTypes.filter((t) => EXTERNAL_EXPERT_BASE_TYPES.has(t.base_type))
        : activeMemberTypes,
    [activeMemberTypes, source],
  );
  const legacyMemberTypeEntries = useMemo(
    () =>
      (Object.entries(BOS_MEMBER_TYPE_LABELS) as [BosMemberType, string][]).filter(
        ([value]) => !excludeMemberTypes.includes(value),
      ),
    [excludeMemberTypes],
  );
  const [memberTypeId, setMemberTypeId] = useState<string | null>(null);
  const [legacyMemberType, setLegacyMemberType] = useState<BosMemberType>('internal_member');

  // Default to the first VISIBLE type. A stored id that isn't in the current
  // (source-filtered) list is ignored here too — belt-and-suspenders with the
  // source effect below — so the Select never shows a blank/hidden value.
  const effectiveMemberTypeId =
    memberTypeId && visibleMemberTypes.some((t) => t.id === memberTypeId)
      ? memberTypeId
      : visibleMemberTypes[0]?.id ?? null;
  const selectedTypeRow = effectiveMemberTypeId
    ? visibleMemberTypes.find((t) => t.id === effectiveMemberTypeId) ?? null
    : null;
  // Behaviour key used everywhere below (picker choice, payload member_type).
  const memberType: BosMemberType =
    activeMemberTypes.length > 0
      ? (selectedTypeRow?.base_type ?? 'internal_member')
      : legacyMemberType;

  // Catalog display name — drives the "Nominated by the Governing Body" path.
  const memberTypeName =
    activeMemberTypes.length > 0
      ? (selectedTypeRow?.name ?? '')
      : BOS_MEMBER_TYPE_LABELS[legacyMemberType];
  const isGbNominee = isGoverningBodyNomineeType(memberTypeName);

  // null = "user hasn't picked yet" → default to the first (lowest sort_order)
  // active committee; the API returns committees already ordered. Derived
  // rather than synced via effect; resetAll() returns it to null on close.
  const [committeeId, setCommitteeId] = useState<string | null>(null);
  const effectiveCommitteeId =
    committeeId ?? committees.find((c) => c.is_active)?.id ?? GENERAL_COMMITTEE;
  const selectedCommitteeId =
    effectiveCommitteeId === GENERAL_COMMITTEE ? null : effectiveCommitteeId;

  // People already on the SELECTED committee — hidden from the pickers. Stable
  // Set references so the pickers can do O(1) `.has(id)` filtering without
  // rebuilding the set on every keystroke.
  const assignedStaffSet = useMemo(
    () =>
      new Set(
        existingMembers
          .filter((m) => (m.committee_id ?? null) === selectedCommitteeId)
          .map((m) => m.staff_id)
          .filter((id): id is string => !!id),
      ),
    [existingMembers, selectedCommitteeId],
  );
  const assignedExpertSet = useMemo(
    () =>
      new Set(
        existingMembers
          .filter((m) => (m.committee_id ?? null) === selectedCommitteeId)
          .map((m) => m.expert_id)
          .filter((id): id is string => !!id),
      ),
    [existingMembers, selectedCommitteeId],
  );

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

  // Picker driven by Source (like GB), not base_type. GB-nominee types still
  // use Source but load people from the Governing Body roster.
  const useExpertPicker = !isGbNominee && source === 'expert';
  const hasSelection =
    !!selectedFacilitator || !!selectedExpert || !!selectedGbMember;

  // Reset to a clean slate.
  const resetAll = () => {
    setMemberTypeId(null);
    setLegacyMemberType('internal_member');
    setCommitteeId(null);
    setSource('staff');
    setSelectedFacilitator(null);
    setSelectedExpert(null);
    setSelectedGbMember(null);
    setDisplayName('');
    setDisplayDesignation('');
    setDisplayDepartment('');
    setDisplayInstitution('');
    setEmail('');
    setContactNo('');
  };

  // Changing member type clears the current person.
  useEffect(() => {
    setSelectedFacilitator(null);
    setSelectedExpert(null);
    setSelectedGbMember(null);
    setDisplayName('');
    setDisplayDesignation('');
    setDisplayDepartment('');
    setDisplayInstitution('');
    setEmail('');
    setContactNo('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGbNominee, effectiveMemberTypeId, legacyMemberType]);

  // Switching Internal/External clears the current person, but PRESERVES the
  // Member Type selection. Chairman / Faculty Member are valid under both
  // sources, so flipping to External Expert must keep that pick rather than
  // snapping back to the first type. `effectiveMemberTypeId` already ignores a
  // stored id that isn't in the (source-filtered) visible list and falls back
  // to the first visible type, so a now-hidden internal-only type (e.g.
  // Department Autonomous Coordinator) is handled without nulling here — and
  // toggling back to Staff restores it.
  useEffect(() => {
    setSelectedFacilitator(null);
    setSelectedExpert(null);
    setSelectedGbMember(null);
    setDisplayName('');
    setDisplayDesignation('');
    setDisplayDepartment('');
    setDisplayInstitution('');
    setEmail('');
    setContactNo('');
  }, [source]);

  const handleSelectFacilitator = (row: FacilitatorRow) => {
    setSelectedFacilitator(row);
    setSelectedExpert(null);
    setSelectedGbMember(null);
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
    setSelectedGbMember(null);
    setDisplayName(row.title ? `${row.title} ${row.name}` : row.name);
    setDisplayDesignation(row.designation ?? '');
    // External experts store department directly on the expert row.
    setDisplayDepartment(row.department_name ?? '');
    setDisplayInstitution(row.institution_name ?? '');
    setEmail(row.email ?? '');
    setContactNo(row.contact_no ?? '');
  };

  const handleSelectGbMember = (row: GbNomineeRow) => {
    setSelectedGbMember(row);
    setSelectedFacilitator(null);
    setSelectedExpert(null);
    setDisplayName(row.display_name ?? '');
    setDisplayDesignation(row.display_designation ?? '');
    setDisplayDepartment(row.display_department ?? '');
    setDisplayInstitution(row.display_institution ?? '');
    setEmail(row.email ?? '');
    setContactNo(row.contact_no ?? '');
  };

  const handleClearSelection = () => {
    setSelectedFacilitator(null);
    setSelectedExpert(null);
    setSelectedGbMember(null);
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
        isGbNominee
          ? source === 'expert'
            ? 'Please select a Governing Body member (external)'
            : 'Please select a Governing Body member (internal)'
          : source === 'expert'
            ? 'Please select an external expert'
            : 'Please select a staff member',
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
        committee_id: selectedCommitteeId,
        // Catalog-driven: persist the SELECTED type's name verbatim (what the
        // user picked, e.g. 'Nominated by the Governing Body'); behaviour
        // derives from member_type_id → base_type. Legacy enum dropdown keeps
        // writing the enum value.
        member_type:
          activeMemberTypes.length > 0
            ? (selectedTypeRow?.name ?? memberType)
            : legacyMemberType,
        member_type_id: activeMemberTypes.length > 0 ? effectiveMemberTypeId : null,
        // Persist the source link so future edits can re-resolve canonical info.
        // GB nominee: copy staff_id / expert_id from the Governing Body roster.
        staff_id: selectedGbMember
          ? (selectedGbMember.staff_id ?? undefined)
          : selectedFacilitator?.id,
        expert_id: selectedGbMember
          ? (selectedGbMember.expert_id ?? undefined)
          : selectedExpert?.id,
        display_name: displayName.trim(),
        display_designation: displayDesignation.trim() || undefined,
        display_department: displayDepartment.trim() || undefined,
        display_institution: displayInstitution.trim() || undefined,
        email: email.trim() || undefined,
        contact_no: contactNo.trim() || undefined,
        is_active: true,
        // sort_order deliberately omitted — the API appends the member at the
        // end of the roster (count + 1). Sending 0 pinned every new member to
        // the top and left the whole table unordered.
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
      <DialogContent className='max-w-md max-h-[85vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className='space-y-4'>
          {/* ── Committee ────────────────────────────────────────────────── */}
          {committees.length > 0 && (
            <div className='space-y-2'>
              <Label>Committee</Label>
              <Select value={effectiveCommitteeId} onValueChange={setCommitteeId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {committees.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.short_code ? ` (${c.short_code})` : ''}
                    </SelectItem>
                  ))}
                  <SelectItem value={GENERAL_COMMITTEE}>
                    General (no committee)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ── Member Type ──────────────────────────────────────────────── */}
          {/* Table-driven from bos_member_types when the institution has rows;
              legacy hardcoded enum otherwise (old data / unseeded institution). */}
          <div className='space-y-2'>
            <Label>
              Member Type <span className='text-destructive'>*</span>
            </Label>
            {activeMemberTypes.length > 0 ? (
              <Select
                value={effectiveMemberTypeId ?? undefined}
                onValueChange={setMemberTypeId}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {visibleMemberTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Select
                value={legacyMemberType}
                onValueChange={(v) => setLegacyMemberType(v as BosMemberType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {legacyMemberTypeEntries.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* ── Source — always, mirrors Governing Body dialog ───────────── */}
          <div className='space-y-2'>
            <Label>
              Source <span className='text-destructive'>*</span>
            </Label>
            <Select
              value={source}
              onValueChange={(v) => setSource(v as MemberSource)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='staff'>Staff (internal)</SelectItem>
                <SelectItem value='expert'>External Expert</SelectItem>
              </SelectContent>
            </Select>
            {isGbNominee && (
              <p className='text-xs text-muted-foreground'>
                Pick from this institution&apos;s Governing Body roster for{' '}
                {academicYear || 'the composition year'}.
              </p>
            )}
          </div>

          {/* ── Picker: GB roster for nominee type, else staff/experts ───── */}
          {isGbNominee ? (
            <GoverningBodyMemberPicker
              institutionsId={institutionsId}
              academicYear={academicYear}
              source={source}
              selected={selectedGbMember}
              onSelect={handleSelectGbMember}
              onClear={handleClearSelection}
              excludeStaffIds={assignedStaffSet}
              excludeExpertIds={assignedExpertSet}
            />
          ) : useExpertPicker ? (
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

export function FacilitatorPicker({
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
  // The lookup hits COE + Supabase per request, so firing it on every keystroke
  // put ~8 requests on the wire for a 8-letter name and made the list flicker
  // as out-of-order responses landed. 300ms collapses that to one.
  const debouncedSearch = useDebounceValue(search, 300);
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
    if (debouncedSearch) params.set('search', debouncedSearch);
    fetch(`/api/bos/lookup/facilitators?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((json) => { if (!cancelled) setRows(json.data ?? []); })
      .catch((err) => { if (!cancelled) logger.error('academic/bos', 'Facilitator fetch failed', err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedSearch, institutionsId, idsCsv, selected, institutionCtx.isLoading]);

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

export function ExpertPicker({
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
  // Debounced for the same reason as FacilitatorPicker — one request per pause
  // instead of one per keystroke.
  const debouncedSearch = useDebounceValue(search, 300);
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
    if (debouncedSearch) params.set('search', debouncedSearch);
    fetch(`/api/bos/experts?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((json) => { if (!cancelled) setRows(json.data ?? []); })
      .catch((err) => { if (!cancelled) logger.error('academic/bos', 'Expert fetch failed', err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedSearch, selected]);

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
          <span className='text-sm font-medium'>
            {selected.title ? `${selected.title} ` : ''}{selected.name}
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
                      <span className='font-medium text-sm truncate'>
                        {row.title ? `${row.title} ` : ''}{row.name}
                      </span>
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

// ── Governing Body nominee picker ─────────────────────────────────────────────
// Lists active members of the institution's Governing Body for the given
// academic year. Source filters staff_id (internal) vs expert_id (external).

export function GoverningBodyMemberPicker({
  institutionsId,
  academicYear,
  source,
  selected,
  onSelect,
  onClear,
  excludeStaffIds,
  excludeExpertIds,
}: {
  institutionsId: string;
  academicYear?: string;
  source: MemberSource;
  selected: GbNomineeRow | null;
  onSelect: (row: GbNomineeRow) => void;
  onClear: () => void;
  excludeStaffIds?: ReadonlySet<string>;
  excludeExpertIds?: ReadonlySet<string>;
}) {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<GbNomineeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [missingBody, setMissingBody] = useState(false);

  useEffect(() => {
    if (selected) return;
    if (!academicYear?.trim()) {
      setRows([]);
      setMissingBody(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setMissingBody(false);
    const params = new URLSearchParams({
      institutionsId,
      academicYear: academicYear.trim(),
    });
    fetch(`/api/bos/governing-body?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((json) => {
        if (cancelled) return;
        setMissingBody(!json.composition);
        setRows((json.members as GbNomineeRow[]) ?? []);
      })
      .catch((err) => {
        if (!cancelled) {
          logger.error('academic/bos', 'Governing Body roster fetch failed', err);
          setRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [institutionsId, academicYear, selected]);

  const filtered = useMemo(() => {
    const bySource = rows.filter((r) =>
      source === 'expert' ? !!r.expert_id : !!r.staff_id,
    );
    const deduped = bySource.filter((r) => {
      if (source === 'expert' && r.expert_id && excludeExpertIds?.has(r.expert_id)) {
        return false;
      }
      if (source === 'staff' && r.staff_id && excludeStaffIds?.has(r.staff_id)) {
        return false;
      }
      return true;
    });
    const q = search.trim().toLowerCase();
    if (!q) return deduped;
    return deduped.filter((r) => {
      const hay = [
        r.display_name,
        r.display_designation,
        r.display_institution,
        r.member_type,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, source, search, excludeStaffIds, excludeExpertIds]);

  const label =
    source === 'expert'
      ? 'Select Governing Body Member (external)'
      : 'Select Governing Body Member (internal)';

  if (selected) {
    return (
      <div className='space-y-2'>
        <Label>
          {label} <span className='text-destructive'>*</span>
        </Label>
        <div className='flex items-center justify-between rounded-md border px-3 py-2'>
          <span className='text-sm font-medium'>{selected.display_name}</span>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='h-7 px-2 text-xs'
            onClick={onClear}
          >
            <X className='mr-1 h-3 w-3' />
            Change
          </Button>
        </div>
      </div>
    );
  }

  if (!academicYear?.trim()) {
    return (
      <div className='space-y-2'>
        <Label>
          {label} <span className='text-destructive'>*</span>
        </Label>
        <p className='text-xs text-muted-foreground rounded-md border px-3 py-2'>
          This composition has no academic year — cannot load the Governing Body roster.
        </p>
      </div>
    );
  }

  return (
    <div className='space-y-2'>
      <Label>
        {label} <span className='text-destructive'>*</span>
      </Label>
      <Command shouldFilter={false} className='rounded-md border'>
        <CommandInput
          placeholder='Search Governing Body members…'
          value={search}
          onValueChange={setSearch}
        />
        <CommandList className='max-h-[200px]'>
          {loading ? (
            <div className='flex items-center justify-center py-6 text-xs text-muted-foreground'>
              <Loader2 className='mr-2 h-3 w-3 animate-spin' />
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <CommandEmpty>
              {missingBody
                ? 'No Governing Body for this institution / year. Prepare it under Governing Body first.'
                : rows.length === 0
                  ? 'Governing Body has no members yet.'
                  : source === 'expert'
                    ? 'No external Governing Body members match (or all already added).'
                    : 'No internal Governing Body members match (or all already added).'}
            </CommandEmpty>
          ) : (
            <CommandGroup>
              {filtered.map((row) => {
                const subline = [row.display_designation, row.member_type, row.display_institution]
                  .filter(Boolean)
                  .join(' • ');
                return (
                  <CommandItem
                    key={row.id}
                    value={row.id}
                    onSelect={() => onSelect(row)}
                    className='flex flex-col items-start gap-0.5'
                  >
                    <span className='font-medium text-sm'>{row.display_name}</span>
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
