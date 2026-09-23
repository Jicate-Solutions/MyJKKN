'use client';

import { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { RotateCcw } from 'lucide-react';
import { BlockSelector } from '@/components/campus-living/block-selector';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useAcademicYears } from '@/hooks/use-academic-years';
import {
  useActiveRoomCategories,
  useProgramsForInstitution
} from '@/hooks/campus-living/use-program-eligibility';
import {
  FINDING_LABELS,
  type BillingAuditFilters,
  type BillingAuditFinding,
  type BillingAuditFindingFilter
} from '@/types/campus-living-billing-audit';

const ALL = '__all__';

/** Finding options in the order an auditor works them: coverage gaps first,
 *  then money, then configuration. */
const FINDING_ORDER: BillingAuditFinding[] = [
  'no_room_bill',
  'no_mess_bill',
  'upgrade_unbilled',
  'unpaid',
  'overdue',
  'amount_mismatch',
  'no_band',
  'category_drift'
];

export const DEFAULT_FILTERS: BillingAuditFilters = {
  institution_ids: null,
  academic_year_id: null,
  block_id: null,
  room_category_id: null,
  program_id: null,
  gender: null,
  allocated_only: false,
  finding: 'all'
};

interface BillingAuditFilterBarProps {
  filters: BillingAuditFilters;
  onChange: (patch: Partial<BillingAuditFilters>) => void;
  /** The Learner Audit page adds the Finding control; Analytics does not. */
  variant?: 'analytics' | 'learners';
}

export function BillingAuditFilterBar({
  filters,
  onChange,
  variant = 'analytics'
}: BillingAuditFilterBarProps) {
  // The institutions this user can actually see, passed through explicitly —
  // NOT `isSuperAdmin ? undefined : profile.institution_id`. That branch
  // silently strips access from users whose secondary role grants a wider
  // scope; the RPC's own scope is the wall either way.
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();

  // Only one institution selected at a time. Academic years, blocks and
  // programmes are per-institution, so each of those controls only becomes
  // meaningful once one is picked.
  const selectedInstitutionId = filters.institution_ids?.[0] ?? undefined;

  const { data: academicYears } = useAcademicYears(selectedInstitutionId);
  const { programs, loading: programsLoading } = useProgramsForInstitution(
    selectedInstitutionId ?? null
  );
  const { categories: roomCategories } = useActiveRoomCategories();

  // Room categories are gender-partitioned ("Classic Room" for boys AND
  // girls). Offer one entry per NAME; the RPC filters by the exact id, so a
  // name is expanded to every id that carries it via the gender-specific rows
  // — but the current filter param is a single id, so pick by id and label
  // it with the gender to keep the choice unambiguous.
  const roomCategoryOptions = useMemo(
    () =>
      [...roomCategories]
        .sort((a, b) => a.name.localeCompare(b.name) || a.type.localeCompare(b.type))
        .map((c) => ({ id: c.id, label: `${c.name} · ${c.type}` })),
    [roomCategories]
  );

  const isDirty =
    !!filters.institution_ids?.length ||
    !!filters.academic_year_id ||
    !!filters.block_id ||
    !!filters.room_category_id ||
    !!filters.program_id ||
    !!filters.gender ||
    !!filters.allocated_only ||
    (filters.finding ?? 'all') !== 'all';

  return (
    <div className='rounded-lg border bg-card p-4 space-y-4'>
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        <div className='space-y-1.5'>
          <Label className='text-xs'>Institution</Label>
          <Select
            value={selectedInstitutionId ?? ALL}
            onValueChange={(v) =>
              // Changing the institution invalidates every per-institution
              // choice below it — clear them in the SAME patch so a stale
              // block or programme never rides along into the next scope.
              onChange({
                institution_ids: v === ALL ? null : [v],
                academic_year_id: null,
                block_id: null,
                program_id: null
              })
            }
            disabled={institutionsLoading}
          >
            <SelectTrigger>
              <SelectValue placeholder='All accessible institutions' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All accessible institutions</SelectItem>
              {institutions.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-1.5'>
          <Label className='text-xs'>Academic year</Label>
          <Select
            value={filters.academic_year_id ?? ALL}
            onValueChange={(v) => onChange({ academic_year_id: v === ALL ? null : v })}
            disabled={!selectedInstitutionId}
          >
            <SelectTrigger>
              <SelectValue placeholder="Institution's current year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Current year (per institution)</SelectItem>
              {(academicYears?.data ?? []).map((y) => (
                <SelectItem key={y.id} value={y.id}>
                  {y.academic_year_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-1.5'>
          <Label className='text-xs'>Block</Label>
          {selectedInstitutionId ? (
            // BlockSelector's own "all" sentinel is the literal 'all'.
            <BlockSelector
              institutionId={selectedInstitutionId}
              value={filters.block_id ?? 'all'}
              onValueChange={(v) => onChange({ block_id: v === 'all' ? null : v })}
            />
          ) : (
            <Select value={ALL} disabled>
              <SelectTrigger>
                <SelectValue placeholder='Pick an institution first' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All blocks</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        <div className='space-y-1.5'>
          <Label className='text-xs'>Programme</Label>
          <Select
            value={filters.program_id ?? ALL}
            onValueChange={(v) => onChange({ program_id: v === ALL ? null : v })}
            disabled={!selectedInstitutionId || programsLoading}
          >
            <SelectTrigger>
              <SelectValue placeholder='Any programme' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any programme</SelectItem>
              {programs.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.program_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-1.5'>
          <Label className='text-xs'>Billed room category</Label>
          <Select
            value={filters.room_category_id ?? ALL}
            onValueChange={(v) => onChange({ room_category_id: v === ALL ? null : v })}
          >
            <SelectTrigger>
              <SelectValue placeholder='Any category' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any category</SelectItem>
              {roomCategoryOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-1.5'>
          <Label className='text-xs'>Gender</Label>
          <Select
            value={filters.gender ?? ALL}
            onValueChange={(v) => onChange({ gender: v === ALL ? null : v })}
          >
            <SelectTrigger>
              <SelectValue placeholder='Any' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any</SelectItem>
              <SelectItem value='Male'>Male</SelectItem>
              <SelectItem value='Female'>Female</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {variant === 'learners' && (
          <div className='space-y-1.5'>
            <Label className='text-xs'>Finding</Label>
            <Select
              value={filters.finding ?? 'all'}
              onValueChange={(v) => onChange({ finding: v as BillingAuditFindingFilter })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All learners</SelectItem>
                <SelectItem value='clean'>Clean (no problem findings)</SelectItem>
                {FINDING_ORDER.map((f) => (
                  <SelectItem key={f} value={f}>
                    {FINDING_LABELS[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className='flex items-end gap-3'>
          <div className='flex items-center gap-2 h-10'>
            <Switch
              id='cl-billing-audit-allocated-only'
              checked={!!filters.allocated_only}
              onCheckedChange={(checked) => onChange({ allocated_only: checked })}
            />
            <Label htmlFor='cl-billing-audit-allocated-only' className='text-xs cursor-pointer'>
              Allocated only
            </Label>
          </div>
          {isDirty && (
            <Button
              type='button'
              variant='ghost'
              size='sm'
              className='h-10'
              onClick={() => onChange({ ...DEFAULT_FILTERS })}
            >
              <RotateCcw className='mr-1 h-3.5 w-3.5' />
              Reset
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
