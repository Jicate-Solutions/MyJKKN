'use client';

import { Fragment, Suspense, use, useEffect, useMemo, useState } from 'react';
import { useTabParam } from '@/hooks/use-tab-param';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Edit,
  Users,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  XCircle,
  Building2,
  Mail,
  Phone,
  Plus,
  Trash2,
  GraduationCap,
  LayoutGrid,
  List,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useBosComposition } from '@/hooks/bos/use-bos-compositions';
import { useBosCommitteesByComposition } from '@/hooks/bos/use-bos-committees';
import { useBosMemberTypes } from '@/hooks/bos/use-bos-member-types';
import {
  useBosMembersByComposition,
  useRefreshBosMembers,
  useRemoveBosMember,
  useReorderBosMembers,
} from '@/hooks/bos/use-bos-members';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useBosBoardScope,
  canEditComposition,
  canManageMembers,
} from '@/hooks/bos/use-bos-board-scope';
import { useAuth } from '@/hooks/use-auth-provider';
import { useInstitutionContextById } from '@/hooks/use-institution-context';
import {
  BosCommittee,
  BosMember,
  BosMemberType,
  BosMemberTypeRecord,
} from '@/types/bos';
import { logger } from '@/lib/utils/enhanced-logger';
import { AddMemberDialog } from '../_components/add-member-dialog';
import { AddCommitteeDialog } from '../_components/add-committee-dialog';
import { BoardProgrammesCard } from '../../_components/board-programmes-card';
import { ProgrammeOutcomesEditor } from '../../taxonomy/_components/programme-outcomes-editor';

interface Regulation {
  id: string;
  title: string;
  regulation_year: string;
  regulation_code: string;
}

// ── Member type display order ─────────────────────────────────────────────────

const MEMBER_GROUPS: { type: BosMemberType; label: string }[] = [
  { type: 'principal',          label: 'Principal' },
  { type: 'chairman',           label: 'Chairman' },
  { type: 'hod',                label: 'Head of Department' },
  { type: 'facilitator',        label: 'Facilitators' },
  { type: 'university_nominee', label: 'University Nominees' },
  { type: 'subject_expert',     label: 'Subject Experts' },
  { type: 'internal_member',    label: 'Internal Members' },
  { type: 'industry_expert',    label: 'Industry Experts' },
  { type: 'alumni',             label: 'Alumni Members' },
  { type: 'startup',            label: 'Startup Members' },
];

// ── Roster model ─────────────────────────────────────────────────────────────
// The roster renders committee → member-type group → member, and that exact
// sequence is what gets written to bos_members.sort_order when the user
// reorders. So the UI and the reorder payload both read ONE precomputed
// structure (buildRoster) — if they grouped independently they could disagree,
// and the saved order wouldn't match what the screen shows.

const GENERAL_ROW = '__general__';
/** Sentinel for "refresh the entire composition", used by the header button. */
const ALL_SECTIONS = '__all__';

interface RosterGroup {
  key: string;
  label: string;
  items: BosMember[];
}

interface RosterSection {
  value: string;
  committee: BosCommittee | null;
  groups: RosterGroup[];
  count: number;
}

/** sort_order asc — 0 means "never ordered", so those sort first — then name. */
function byRosterOrder(a: BosMember, b: BosMember) {
  const ao = a.sort_order ?? 0;
  const bo = b.sort_order ?? 0;
  if (ao !== bo) return ao - bo;
  return (a.display_name ?? '').localeCompare(b.display_name ?? '');
}

function buildRoster(
  committees: BosCommittee[],
  members: BosMember[],
  /** Institution's bos_member_types rows (already ordered by sort_order). */
  memberTypes: BosMemberTypeRecord[]
): RosterSection[] {
  const knownTypeIds = new Set(memberTypes.map((t) => t.id));
  const knownCommitteeIds = new Set(committees.map((c) => c.id));

  const groupsFor = (items: BosMember[]): RosterGroup[] => {
    // Primary grouping: table-driven member types (member_type_id). Rows whose
    // member_type_id is null (or points at a deleted type) fall back to the
    // legacy enum groups, and anything still unmatched lands in "Other Members"
    // rather than silently disappearing from the roster.
    const leftovers = items.filter(
      (m) => !m.member_type_id || !knownTypeIds.has(m.member_type_id)
    );
    const legacyTypes = new Set(MEMBER_GROUPS.map((g) => g.type as string));
    return [
      ...memberTypes.map((t) => ({
        key: t.id,
        label: t.name,
        items: items.filter((m) => m.member_type_id === t.id).sort(byRosterOrder),
      })),
      ...MEMBER_GROUPS.map(({ type, label }) => ({
        key: `legacy:${type}`,
        label,
        items: leftovers.filter((m) => m.member_type === type).sort(byRosterOrder),
      })),
      {
        key: 'legacy:__other__',
        label: 'Other Members',
        items: leftovers
          .filter((m) => !legacyTypes.has(m.member_type))
          .sort(byRosterOrder),
      },
    ].filter((g) => g.items.length > 0);
  };

  const general = members.filter(
    (m) => !m.committee_id || !knownCommitteeIds.has(m.committee_id)
  );

  return [
    ...committees.map((c) => {
      const items = members.filter((m) => m.committee_id === c.id);
      return {
        value: c.id,
        committee: c as BosCommittee | null,
        groups: groupsFor(items),
        count: items.length,
      };
    }),
    ...(general.length > 0
      ? [
          {
            value: GENERAL_ROW,
            committee: null,
            groups: groupsFor(general),
            count: general.length,
          },
        ]
      : []),
  ];
}

/** Flat render order — exactly what POST /api/bos/members/reorder persists. */
function flattenRoster(sections: RosterSection[]): string[] {
  return sections.flatMap((s) => s.groups.flatMap((g) => g.items.map((m) => m.id)));
}

/** "Dr. Ramya B" → "RB". Titles are stripped so initials stay meaningful. */
function initialsOf(name: string | null | undefined): string {
  const cleaned = (name ?? '')
    .replace(/\b(dr|prof|mr|mrs|ms|shri|smt)\.?\s*/gi, '')
    .replace(/[^A-Za-z\s]/g, ' ')
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type MemberView = 'grid' | 'list';

// ── Member type groups (within one committee section) ───────────────────────

function MemberTypeGroups({
  groups,
  view,
  canManage,
  onRemove,
  onMove,
}: {
  groups: RosterGroup[];
  view: MemberView;
  canManage: boolean;
  onRemove: (id: string) => void;
  /** Move a member one slot up/down inside its own group. */
  onMove: (groupKey: string, memberId: string, direction: -1 | 1) => void;
}) {
  return (
    <div className='space-y-5'>
      {groups.map(({ key, label, items }) => (
        <div key={key}>
          <h4 className='mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
            {label}
            <Badge variant='secondary' className='px-1.5 py-0 text-[10px] font-semibold'>
              {items.length}
            </Badge>
          </h4>

          {view === 'grid' ? (
            <div className='grid gap-2 sm:grid-cols-2'>
              {items.map((member, idx) => (
                <MemberCard
                  key={member.id}
                  member={member}
                  position={idx + 1}
                  canMoveUp={canManage && idx > 0}
                  canMoveDown={canManage && idx < items.length - 1}
                  canEdit={canManage}
                  onRemove={onRemove}
                  onMove={(dir) => onMove(key, member.id, dir)}
                />
              ))}
            </div>
          ) : (
            <div className='overflow-x-auto rounded-md border bg-background'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b bg-muted/40 text-left text-xs text-muted-foreground'>
                    <th className='w-12 px-3 py-2 font-medium'>#</th>
                    <th className='px-3 py-2 font-medium'>Member</th>
                    <th className='hidden px-3 py-2 font-medium sm:table-cell'>
                      Designation
                    </th>
                    <th className='hidden px-3 py-2 font-medium lg:table-cell'>
                      Department / Institution
                    </th>
                    <th className='hidden px-3 py-2 font-medium md:table-cell'>Contact</th>
                    {canManage && <th className='w-24 px-3 py-2' />}
                  </tr>
                </thead>
                <tbody>
                  {items.map((member, idx) => (
                    <MemberListRow
                      key={member.id}
                      member={member}
                      position={idx + 1}
                      canMoveUp={canManage && idx > 0}
                      canMoveDown={canManage && idx < items.length - 1}
                      canEdit={canManage}
                      onRemove={onRemove}
                      onMove={(dir) => onMove(key, member.id, dir)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Reorder arrows (shared by both views) ────────────────────────────────────

function ReorderButtons({
  canMoveUp,
  canMoveDown,
  onMove,
}: {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <div className='flex flex-col'>
      <Button
        variant='ghost'
        size='icon'
        className='h-4 w-6 rounded-sm text-muted-foreground hover:text-foreground'
        disabled={!canMoveUp}
        title='Move up'
        onClick={() => onMove(-1)}
      >
        <ChevronUp className='h-3.5 w-3.5' />
      </Button>
      <Button
        variant='ghost'
        size='icon'
        className='h-4 w-6 rounded-sm text-muted-foreground hover:text-foreground'
        disabled={!canMoveDown}
        title='Move down'
        onClick={() => onMove(1)}
      >
        <ChevronDown className='h-3.5 w-3.5' />
      </Button>
    </div>
  );
}

// ── Committee table ─────────────────────────────────────────────────────────
// A composition can hold several committees. They're listed as a table (name,
// code, member count, status) rather than a tab bar, which stays readable as
// the count grows and shows every committee's size at a glance. Expanding a row
// reveals that committee's members grouped by type. A virtual "General" row
// collects members with no committee (or whose committee was deleted).

function CommitteeTable({
  rows,
  view,
  canManage,
  onRemove,
  onMove,
  onAddMember,
  onRefreshCommittee,
  refreshingCommittee,
}: {
  /** Precomputed roster sections — see buildRoster. */
  rows: RosterSection[];
  view: MemberView;
  canManage: boolean;
  onRemove: (id: string) => void;
  onMove: (groupKey: string, memberId: string, direction: -1 | 1) => void;
  onAddMember: () => void;
  /** Re-pull staff / expert details for just this committee's members. */
  onRefreshCommittee: (sectionValue: string, memberIds: string[]) => void;
  /** Section value currently being refreshed, so only its button spins. */
  refreshingCommittee: string | null;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Open the first committee once data arrives, so the card isn't a wall of
  // collapsed rows on load. Keyed on the first row's id: it runs when the list
  // first resolves (and if that committee changes), but not when the user
  // collapses it — a manual collapse stays collapsed.
  const firstValue = rows[0]?.value;
  useEffect(() => {
    if (firstValue) setExpanded(new Set([firstValue]));
  }, [firstValue]);

  const toggle = (value: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });

  if (rows.length === 0) return null;

  return (
    <div className='rounded-lg border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className='w-10' />
            <TableHead>Committee</TableHead>
            <TableHead className='w-28'>Code</TableHead>
            <TableHead className='w-24 text-right'>Members</TableHead>
            <TableHead className='w-28'>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const isOpen = expanded.has(r.value);
            return (
              <Fragment key={r.value}>
                <TableRow
                  className='cursor-pointer'
                  onClick={() => toggle(r.value)}
                >
                  <TableCell>
                    {isOpen ? (
                      <ChevronDown className='h-4 w-4 text-muted-foreground' />
                    ) : (
                      <ChevronRight className='h-4 w-4 text-muted-foreground' />
                    )}
                  </TableCell>
                  <TableCell className='font-medium'>
                    {r.committee ? r.committee.name : 'General'}
                  </TableCell>
                  <TableCell className='text-muted-foreground'>
                    {r.committee?.short_code ?? '—'}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {r.count}
                  </TableCell>
                  <TableCell>
                    {!r.committee ? (
                      <Badge variant='outline' className='text-xs'>
                        Unassigned
                      </Badge>
                    ) : r.committee.is_active ? (
                      <Badge variant='outline' className='text-xs'>
                        Active
                      </Badge>
                    ) : (
                      <Badge variant='secondary' className='text-xs'>
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>

                {isOpen && (
                  <TableRow className='hover:bg-transparent'>
                    <TableCell colSpan={5} className='bg-muted/30 p-4'>
                      {r.count === 0 ? (
                        <div className='flex flex-col items-start gap-2'>
                          <p className='text-xs text-muted-foreground'>
                            No members in this committee yet.
                          </p>
                          {canManage && (
                            <Button
                              size='sm'
                              variant='outline'
                              onClick={(e) => {
                                e.stopPropagation();
                                onAddMember();
                              }}
                            >
                              <Plus className='mr-2 h-4 w-4' />
                              Add Member
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className='space-y-3'>
                          {canManage && (
                            <div className='flex items-center justify-end gap-2'>
                              {/* Committee-wise refresh: pulls the CURRENT staff /
                                  expert details into just these member rows. Kept
                                  per-committee so one board can adopt a promotion
                                  without touching the rest of the composition. */}
                              <Button
                                size='sm'
                                variant='ghost'
                                className='h-7 text-xs'
                                disabled={refreshingCommittee !== null}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRefreshCommittee(
                                    r.value,
                                    r.groups.flatMap((g) => g.items.map((m) => m.id))
                                  );
                                }}
                              >
                                <RefreshCw
                                  className={`mr-1.5 h-3.5 w-3.5 ${
                                    refreshingCommittee === r.value ? 'animate-spin' : ''
                                  }`}
                                />
                                Refresh details
                              </Button>
                              <Button
                                size='sm'
                                variant='outline'
                                className='h-7 text-xs'
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAddMember();
                                }}
                              >
                                <Plus className='mr-1.5 h-3.5 w-3.5' />
                                Add Member
                              </Button>
                            </div>
                          )}
                          <MemberTypeGroups
                            groups={r.groups}
                            view={view}
                            canManage={canManage}
                            onRemove={onRemove}
                            onMove={onMove}
                          />
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Member Card ───────────────────────────────────────────────────────────────

function MemberCard({
  member,
  position,
  canEdit,
  canMoveUp,
  canMoveDown,
  onRemove,
  onMove,
}: {
  member: BosMember;
  /** 1-based rank inside its member-type group — the number reports print. */
  position: number;
  canEdit: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRemove: (id: string) => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const isExternal = !!member.expert_id;
  return (
    <div
      className={`group relative flex items-start gap-3 rounded-lg border bg-background p-3 transition-colors hover:border-primary/40 hover:bg-accent/30 ${
        member.is_active ? '' : 'opacity-60'
      }`}
    >
      {/* Order badge doubles as the avatar ring — the rank is the first thing
          you need when checking a roster against a printed notice. */}
      <div className='relative shrink-0'>
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold ${
            isExternal
              ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
              : 'bg-primary/10 text-primary'
          }`}
          title={isExternal ? 'External expert' : 'Internal (staff)'}
        >
          {initialsOf(member.display_name)}
        </div>
        {/* The badge is bos_members.group_position — the stored per-group serial
            number. It falls back to the rendered index during the optimistic
            window right after an add, before the server's number arrives. */}
        <span
          className='absolute -left-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border bg-background px-1 text-[10px] font-semibold tabular-nums text-muted-foreground'
          title={`group_position ${member.group_position || position} · sort_order ${member.sort_order ?? 0}`}
        >
          {member.group_position || position}
        </span>
      </div>

      <div className='min-w-0 flex-1'>
        <div className='flex items-start gap-2'>
          <p className='min-w-0 flex-1 truncate text-sm font-medium'>
            {member.display_name}
          </p>
          {!member.is_active && (
            <Badge variant='secondary' className='shrink-0 text-[10px]'>
              Inactive
            </Badge>
          )}
        </div>
        {member.display_designation && (
          <p className='truncate text-xs text-muted-foreground'>
            {member.display_designation}
          </p>
        )}
        {(member.display_department || member.display_institution) && (
          <p className='mt-0.5 flex items-center gap-1 text-xs text-muted-foreground'>
            <Building2 className='h-3 w-3 shrink-0' />
            <span className='truncate'>
              {[member.display_department, member.display_institution]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </p>
        )}
        <div className='mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1'>
          {member.email && (
            <a
              href={`mailto:${member.email}`}
              className='flex max-w-full items-center gap-1 truncate text-xs text-primary hover:underline'
            >
              <Mail className='h-3 w-3 shrink-0' />
              <span className='truncate'>{member.email}</span>
            </a>
          )}
          {member.contact_no && (
            <span className='flex items-center gap-1 text-xs text-muted-foreground'>
              <Phone className='h-3 w-3 shrink-0' />
              {member.contact_no}
            </span>
          )}
        </div>
      </div>

      {canEdit && (
        // Controls stay invisible until hover/focus so a read-through of the
        // roster isn't a wall of buttons; focus-within keeps them keyboard-usable.
        <div className='flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100'>
          <ReorderButtons
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            onMove={onMove}
          />
          <Button
            variant='ghost'
            size='icon'
            className='h-7 w-7 text-muted-foreground hover:text-destructive'
            title='Remove member'
            onClick={() => onRemove(member.id)}
          >
            <Trash2 className='h-3.5 w-3.5' />
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Member list row (compact table view) ─────────────────────────────────────
// The list view is the one to read against a printed notice or minutes: one
// line per member, rank first, in exactly the saved order.

function MemberListRow({
  member,
  position,
  canEdit,
  canMoveUp,
  canMoveDown,
  onRemove,
  onMove,
}: {
  member: BosMember;
  position: number;
  canEdit: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRemove: (id: string) => void;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <tr
      className={`border-b last:border-0 hover:bg-accent/30 ${
        member.is_active ? '' : 'opacity-60'
      }`}
    >
      <td
        className='px-3 py-2 text-xs tabular-nums text-muted-foreground'
        title={`group_position ${member.group_position || position} · sort_order ${member.sort_order ?? 0}`}
      >
        {member.group_position || position}
      </td>
      <td className='px-3 py-2'>
        <div className='flex items-center gap-2'>
          <span className='truncate font-medium'>{member.display_name}</span>
          {member.expert_id && (
            <Badge variant='outline' className='shrink-0 text-[10px]'>
              External
            </Badge>
          )}
          {!member.is_active && (
            <Badge variant='secondary' className='shrink-0 text-[10px]'>
              Inactive
            </Badge>
          )}
        </div>
        {/* Everything hidden by the responsive columns collapses under the
            name on small screens, so nothing is unreachable on mobile. */}
        <div className='text-xs text-muted-foreground sm:hidden'>
          {[member.display_designation, member.display_department]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </td>
      <td className='hidden px-3 py-2 text-xs text-muted-foreground sm:table-cell'>
        {member.display_designation ?? '—'}
      </td>
      <td className='hidden px-3 py-2 text-xs text-muted-foreground lg:table-cell'>
        {[member.display_department, member.display_institution]
          .filter(Boolean)
          .join(' · ') || '—'}
      </td>
      <td className='hidden px-3 py-2 text-xs md:table-cell'>
        {member.email && (
          <a
            href={`mailto:${member.email}`}
            className='block truncate text-primary hover:underline'
          >
            {member.email}
          </a>
        )}
        {member.contact_no && (
          <span className='text-muted-foreground'>{member.contact_no}</span>
        )}
        {!member.email && !member.contact_no && (
          <span className='text-muted-foreground'>—</span>
        )}
      </td>
      {canEdit && (
        <td className='px-3 py-2'>
          <div className='flex items-center justify-end gap-0.5'>
            <ReorderButtons
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
              onMove={onMove}
            />
            <Button
              variant='ghost'
              size='icon'
              className='h-7 w-7 text-muted-foreground hover:text-destructive'
              title='Remove member'
              onClick={() => onRemove(member.id)}
            >
              <Trash2 className='h-3.5 w-3.5' />
            </Button>
          </div>
        </td>
      )}
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface CompositionDetailPageProps {
  params: Promise<{ compositionId: string }>;
}

const COMPOSITION_DETAIL_TABS = ['members', 'programmes', 'outcomes'] as const;

function CompositionDetailPageInner({ params }: CompositionDetailPageProps) {
  const { compositionId } = use(params);
  const [activeTab, setActiveTab] = useTabParam('members', COMPOSITION_DETAIL_TABS);
  const router = useRouter();
  const { canAccess, isSuperAdmin } = usePermissions();
  const boardScope = useBosBoardScope();
  const { profile } = useAuth();
  const { data: composition, isLoading: loadingComposition } = useBosComposition(compositionId);
  const { data: members = [], isLoading: loadingMembers } = useBosMembersByComposition(compositionId);
  const removeMember = useRemoveBosMember();
  const refreshMembers = useRefreshBosMembers();
  const reorderMembers = useReorderBosMembers();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addCommitteeOpen, setAddCommitteeOpen] = useState(false);
  const [memberView, setMemberView] = useState<MemberView>('grid');
  /** Which section's Refresh is in flight — ALL_SECTIONS for the whole roster. */
  const [refreshingSection, setRefreshingSection] = useState<string | null>(null);

  // Bootstrap case: the user who created this row keeps edit + member-roster
  // access until a chairman is appointed. Without it the creator can't
  // finish setting up their own composition.
  const createdByMe = !!(composition?.created_by && profile?.id && composition.created_by === profile.id);

  // canEdit drives header "Edit" button + the BoardProgrammesCard.
  // canManage drives the per-member "Add"/"Remove" controls. They differ in
  // intent today (programmes editing vs roster management) but both unlock
  // for: super-admin, chairman of this comp, or creator of this comp.
  const hasRolePermEdit = isSuperAdmin || canAccess('academic.bos-compositions', 'edit');
  const canEdit = hasRolePermEdit && canEditComposition(boardScope, compositionId, createdByMe);
  const canManage = hasRolePermEdit && canManageMembers(boardScope, compositionId, createdByMe);

  // Resolve all sibling institution IDs for the COMPOSITION'S institution
  // (not the logged-in user's). For CAS colleges, this expands a single
  // institutions_id into the pair of Aided + Self-Financing UUIDs via the
  // shared counselling_code. Needed so regulations/taxonomy/programmes
  // lookups don't miss rows stored under the sibling UUID.
  const institutionCtx = useInstitutionContextById(composition?.institutions_id);
  const allInstitutionIds: string[] = institutionCtx.data?.myjkkn_institution_ids?.length
    ? institutionCtx.data.myjkkn_institution_ids
    : composition?.institutions_id ? [composition.institutions_id] : [];

  const isLoading = loadingComposition || loadingMembers;

  const [selectedRegulationId, setSelectedRegulationId] = useState('');

  // CAS-aware: a composition may be tied to one of two sibling institution
  // UUIDs (Aided/Self-Financing), but the regulation + taxonomy rows might
  // live under either. Pass the full sibling list so both are searched.
  const institutionIdsCsv = allInstitutionIds.join(',');

  // Committees of THIS composition (20260706 — committees are composition-owned).
  // Members are grouped by committee below. Inactive committees are included so
  // legacy sections still show their name.
  const { data: committees = [] } = useBosCommitteesByComposition(compositionId);

  // Member types of this institution — drive the Add Member dropdown and the
  // per-type grouping inside each committee section. Inactive types included
  // for display (old rows keep their label); the dialog gets active only.
  const { data: rawMemberTypeRows = [] } = useBosMemberTypes(institutionIdsCsv || null);

  // CAS colleges seed the same 10 member types under BOTH sibling institution
  // UUIDs (20260611 seeds per institutions_id). The CAS-expanded query above
  // then returns each type twice, so the dropdown and the group headers double
  // up (see [[feedback_cas_institution_lookup]]). Collapse by name to a single
  // canonical row (lowest sort_order wins) and remember which raw ids fold into
  // it, so an existing member pointing at the dropped sibling's row still groups
  // under the surviving one instead of falling back to a duplicate legacy group.
  const { memberTypeRows, canonicalTypeId } = useMemo(() => {
    const byName = new Map<string, BosMemberTypeRecord>();
    const idMap = new Map<string, string>();
    const sorted = [...rawMemberTypeRows].sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
    );
    for (const t of sorted) {
      const key = t.name.trim().toLowerCase();
      const existing = byName.get(key);
      if (existing) {
        idMap.set(t.id, existing.id);   // fold this duplicate into the survivor
      } else {
        byName.set(key, t);
        idMap.set(t.id, t.id);
      }
    }
    return {
      memberTypeRows: Array.from(byName.values()),
      canonicalTypeId: idMap,
    };
  }, [rawMemberTypeRows]);

  // Members with their member_type_id re-pointed to the canonical (deduped)
  // type row — used only for the per-type grouping below. The originals (with
  // real ids) are kept for removal + the Add Member dialog's exclusion set.
  const membersForGrouping = useMemo(
    () =>
      members.map((m) => ({
        ...m,
        member_type_id: m.member_type_id
          ? canonicalTypeId.get(m.member_type_id) ?? m.member_type_id
          : m.member_type_id,
      })),
    [members, canonicalTypeId]
  );

  // Regulations + taxonomy assignments feed the Outcomes (PO/PSO) tab ONLY, so
  // they stay unfetched until that tab is opened. They used to fire on every
  // visit to the page — two extra requests (one of them a COE-backed taxonomy
  // lookup) that nobody landing on the default Members tab ever consumed.
  const outcomesTabActive = activeTab === 'outcomes';

  const { data: regulations = [], isLoading: loadingRegs } = useQuery<Regulation[]>({
    queryKey: ['bos', 'regulations', institutionIdsCsv],
    queryFn: async () => {
      const res = await fetch(`/api/bos/regulations?institutionIds=${institutionIdsCsv}`);
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: outcomesTabActive && allInstitutionIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Taxonomy assignments — only regulations with a taxonomy can have PO/PSO
  const { data: taxonomyAssignments = [] } = useQuery<{ regulation_id: string }[]>({
    queryKey: ['bos', 'taxonomy-assignments', institutionIdsCsv],
    queryFn: async () => {
      const res = await fetch(`/api/bos/taxonomy?institutionsIds=${institutionIdsCsv}`);
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: outcomesTabActive && allInstitutionIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const assignedRegIds = new Set(taxonomyAssignments.map((a) => a.regulation_id));
  const regulationsWithTaxonomy = regulations.filter((r) => assignedRegIds.has(r.id));

  // Roster sections drive BOTH the rendering and the reorder payload — see
  // buildRoster. Committees are the outer level, member types the inner one.
  const roster = useMemo(
    () => buildRoster(committees, membersForGrouping, memberTypeRows),
    [committees, membersForGrouping, memberTypeRows]
  );

  /**
   * Move one member up/down inside its own member-type group, then persist the
   * WHOLE composition's order. sort_order is a composition-wide rank, so a
   * local swap still has to be saved as a full 1..n renumbering — otherwise
   * flat consumers (notices, minutes, attendance) would interleave groups.
   */
  const handleMoveMember = (
    groupKey: string,
    memberId: string,
    direction: -1 | 1
  ) => {
    let moved = false;
    const next = roster.map((section) => ({
      ...section,
      groups: section.groups.map((group) => {
        const idx = group.items.findIndex((m) => m.id === memberId);
        // The same group key repeats across committees, so the member's own
        // index is what identifies the right group — not the key alone.
        if (group.key !== groupKey || idx === -1) return group;
        const target = idx + direction;
        if (target < 0 || target >= group.items.length) return group;
        const items = [...group.items];
        [items[idx], items[target]] = [items[target], items[idx]];
        moved = true;
        return { ...group, items };
      }),
    }));
    if (!moved) return;

    reorderMembers.mutate(
      { compositionId, orderedIds: flattenRoster(next) },
      {
        onError: (err) => {
          logger.error('academic/bos', 'Failed to reorder members', err);
          toast.error((err as Error).message || 'Failed to save member order');
        },
      }
    );
  };

  /**
   * Manual pull of the latest staff / external-expert details into the roster
   * snapshot. Manual on purpose: display_designation is what past meeting
   * notices and minutes printed, so an Assistant Professor promoted to
   * Associate Professor should only change on the rosters an operator chooses.
   */
  const handleRefreshDetails = (sectionValue: string, memberIds?: string[]) => {
    if (refreshingSection) return;
    setRefreshingSection(sectionValue);
    refreshMembers.mutate(
      { compositionId, ...(memberIds ? { memberIds } : {}) },
      {
        onSuccess: (result) => {
          if (result.updated === 0) {
            toast.success('All member details are already up to date');
          } else {
            const names = result.changes
              .slice(0, 3)
              .map((c) => c.display_name)
              .filter(Boolean)
              .join(', ');
            toast.success(
              `Updated ${result.updated} member${result.updated === 1 ? '' : 's'}` +
                (names ? ` — ${names}${result.updated > 3 ? '…' : ''}` : '')
            );
          }
          if (result.failed > 0) {
            toast.error(
              `${result.failed} member${result.failed === 1 ? '' : 's'} could not be updated`
            );
          }
        },
        onError: (err) => {
          logger.error('academic/bos', 'Failed to refresh member details', err);
          toast.error((err as Error).message || 'Failed to refresh member details');
        },
        onSettled: () => setRefreshingSection(null),
      }
    );
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      await removeMember.mutateAsync({ id: memberId, compositionId });
      toast.success('Member removed');
    } catch (err) {
      logger.error('academic/bos', 'Failed to remove member', err);
      toast.error('Failed to remove member');
    }
  };

  if (isLoading) {
    return (
      <div className='max-w-4xl space-y-4'>
        <Skeleton className='h-10 w-72' />
        <Skeleton className='h-32 w-full' />
        <Skeleton className='h-64 w-full' />
      </div>
    );
  }

  if (!composition) {
    return <div className='max-w-4xl'><p className='text-muted-foreground'>Composition not found.</p></div>;
  }

  const activeMembers = members.filter((m) => m.is_active);
  const formatDate = (d?: string) => d ? format(new Date(d), 'dd MMM yyyy') : '—';

  return (
    <div className='max-w-4xl space-y-6'>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <PageHeader
        title={composition.composition_title}
        description={
          composition.board
            ? `${composition.board.board_name} (${composition.board.board_code})`
            : 'Board of Studies Composition'
        }
      >
        {canEdit && (
          <Button size='sm' onClick={() => router.push(`/bos/compositions/${compositionId}/edit`)}>
            <Edit className='mr-2 h-4 w-4' />
            Edit
          </Button>
        )}
      </PageHeader>

      {/* ── Info Strip ──────────────────────────────────────────────────── */}
      <Card>
        <CardContent className='p-4'>
          <div className='grid grid-cols-2 gap-4 sm:grid-cols-4'>
            <div>
              <p className='text-xs text-muted-foreground'>Academic Year</p>
              <p className='text-sm font-medium'>{composition.academic_year}</p>
            </div>
            <div>
              <p className='text-xs text-muted-foreground'>Term</p>
              <p className='text-sm font-medium'>
                {formatDate(composition.term_start_date)} – {formatDate(composition.term_end_date)}
              </p>
            </div>
            <div>
              <p className='text-xs text-muted-foreground'>Status</p>
              <div className='flex items-center gap-1 mt-0.5'>
                {composition.is_active ? (
                  <><CheckCircle2 className='h-3.5 w-3.5 text-green-600' /><span className='text-sm font-medium text-green-700'>Active</span></>
                ) : (
                  <><XCircle className='h-3.5 w-3.5 text-muted-foreground' /><span className='text-sm font-medium text-muted-foreground'>Inactive</span></>
                )}
              </div>
            </div>
            <div>
              <p className='text-xs text-muted-foreground'>GC Ratified</p>
              <div className='flex items-center gap-1 mt-0.5'>
                {composition.ratified_by_gc ? (
                  <><CheckCircle2 className='h-3.5 w-3.5 text-green-600' /><span className='text-sm font-medium text-green-700'>{composition.ratified_date ? formatDate(composition.ratified_date) : 'Yes'}</span></>
                ) : (
                  <span className='text-sm text-muted-foreground'>Not yet</span>
                )}
              </div>
            </div>
          </div>
          {composition.constituted_by && (
            <>
              <Separator className='my-3' />
              <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                <CalendarDays className='h-4 w-4 shrink-0' />
                <span>Constituted by: <strong className='text-foreground'>{composition.constituted_by}</strong></span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Tabbed sections ─────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value='members'>
            Members
            {activeMembers.length > 0 && (
              <Badge variant='secondary' className='ml-2 text-xs'>{activeMembers.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value='programmes'>Programmes</TabsTrigger>
          <TabsTrigger value='outcomes'>
            <GraduationCap className='h-3.5 w-3.5 mr-1.5' />
            Outcomes (PO/PSO)
          </TabsTrigger>
        </TabsList>

        {/* Members tab */}
        <TabsContent value='members'>
          <Card>
            <CardHeader className='pb-3'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <CardTitle className='text-base'>
                  Members
                  <span className='ml-2 text-sm font-normal text-muted-foreground'>
                    ({activeMembers.length} active)
                  </span>
                </CardTitle>
                <div className='flex flex-wrap items-center gap-2'>
                  {/* View switch — grid for scanning, list for checking the
                      roster line-by-line against a printed notice. */}
                  <div className='flex items-center rounded-md border p-0.5'>
                    <Button
                      size='icon'
                      variant={memberView === 'grid' ? 'secondary' : 'ghost'}
                      className='h-7 w-7'
                      title='Grid view'
                      onClick={() => setMemberView('grid')}
                    >
                      <LayoutGrid className='h-3.5 w-3.5' />
                    </Button>
                    <Button
                      size='icon'
                      variant={memberView === 'list' ? 'secondary' : 'ghost'}
                      className='h-7 w-7'
                      title='List view'
                      onClick={() => setMemberView('list')}
                    >
                      <List className='h-3.5 w-3.5' />
                    </Button>
                  </div>
                  {canManage && (
                    <>
                      <Button
                        size='sm'
                        variant='ghost'
                        disabled={refreshingSection !== null || members.length === 0}
                        title='Pull the latest designation / department / contact from each member’s staff or expert record'
                        onClick={() => handleRefreshDetails(ALL_SECTIONS)}
                      >
                        <RefreshCw
                          className={`mr-2 h-4 w-4 ${
                            refreshingSection === ALL_SECTIONS ? 'animate-spin' : ''
                          }`}
                        />
                        Refresh Details
                      </Button>
                      <Button size='sm' variant='ghost' onClick={() => setAddCommitteeOpen(true)}>
                        <Plus className='mr-2 h-4 w-4' />
                        Add Committee
                      </Button>
                      <Button size='sm' variant='outline' onClick={() => setAddDialogOpen(true)}>
                        <Plus className='mr-2 h-4 w-4' />
                        Add Member
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className='space-y-6'>
              {members.length === 0 && committees.length === 0 ? (
                <div className='text-center py-8 text-muted-foreground'>
                  <Users className='h-8 w-8 mx-auto mb-2 opacity-40' />
                  <p className='text-sm'>No committees or members yet.</p>
                  {canManage && (
                    <Button variant='link' size='sm' onClick={() => setAddCommitteeOpen(true)}>
                      Add the first committee →
                    </Button>
                  )}
                </div>
              ) : (
                <CommitteeTable
                  rows={roster}
                  view={memberView}
                  canManage={canManage}
                  onRemove={handleRemoveMember}
                  onMove={handleMoveMember}
                  onAddMember={() => setAddDialogOpen(true)}
                  onRefreshCommittee={handleRefreshDetails}
                  refreshingCommittee={refreshingSection}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Programmes tab */}
        <TabsContent value='programmes'>
          {composition.institutions_id ? (
            <BoardProgrammesCard
              boardId={composition.board_id}
              institutionsId={composition.institutions_id}
              allInstitutionIds={allInstitutionIds}
              canEdit={canEdit}
            />
          ) : (
            <p className='text-sm text-muted-foreground text-center py-8'>
              Institution not linked to this composition.
            </p>
          )}
        </TabsContent>

        {/* Outcomes (PO/PSO) tab */}
        <TabsContent value='outcomes' className='space-y-4'>
          {loadingRegs ? (
            <Skeleton className='h-9 w-56' />
          ) : regulationsWithTaxonomy.length === 0 ? (
            <div className='flex flex-col items-center gap-3 py-12 border rounded-md border-dashed text-center'>
              <GraduationCap className='h-8 w-8 text-muted-foreground/40' />
              <p className='text-sm text-muted-foreground'>
                No regulations with taxonomy configured for this institution.
              </p>
              <Button variant='outline' size='sm' onClick={() => router.push('/bos/taxonomy')}>
                Configure in Taxonomy →
              </Button>
            </div>
          ) : (
            <>
              <div className='flex items-center gap-3'>
                <span className='text-sm font-medium shrink-0'>Regulation</span>
                <Select value={selectedRegulationId} onValueChange={setSelectedRegulationId}>
                  <SelectTrigger className='w-full sm:w-[260px]'>
                    <SelectValue placeholder='Select regulation…' />
                  </SelectTrigger>
                  <SelectContent>
                    {regulationsWithTaxonomy.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.regulation_code} — {r.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedRegulationId ? (
                <ProgrammeOutcomesEditor
                  regulationId={selectedRegulationId}
                  boardId={composition.board_id}
                  institutionsId={composition.institutions_id}
                />
              ) : (
                <p className='text-sm text-muted-foreground text-center py-6'>
                  Select a regulation above to view and edit POs/PSOs.
                </p>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {composition.notes && (
        <Card>
          <CardContent className='p-4'>
            <p className='text-xs text-muted-foreground mb-1'>Internal Notes</p>
            <p className='text-sm text-muted-foreground'>{composition.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* ── Add Member Dialog ───────────────────────────────────────────── */}
      {/* AddMemberDialog resolves CAS siblings itself via useInstitutionContextById
          (no need to pass allInstitutionIds — see FacilitatorPicker).
          We pass the existing members (with their committee) so the pickers
          can hide people already on the SELECTED committee — the same person
          may sit on two different committees. The DB enforces the same rule
          via per-(composition, committee) unique indexes (20260610). */}
      {composition.institutions_id && (
        <AddMemberDialog
          open={addDialogOpen}
          onClose={() => setAddDialogOpen(false)}
          compositionId={compositionId}
          institutionsId={composition.institutions_id}
          academicYear={composition.academic_year}
          committees={committees.filter((c) => c.is_active)}
          memberTypes={memberTypeRows.filter((t) => t.is_active)}
          existingMembers={members.map((m) => ({
            staff_id: m.staff_id,
            expert_id: m.expert_id,
            committee_id: m.committee_id,
          }))}
        />
      )}

      {/* ── Add Committee Dialog ────────────────────────────────────────── */}
      {/* Copy flow: pick from the master committees created at /bos/committees
          (the unassigned template pool) and copy them into this composition —
          the master row stays reusable by other compositions. institutionIdsCsv
          is CAS-expanded so the pool spans both sibling UUIDs for CAS colleges,
          while the copies anchor to this composition's own institution. */}
      {composition.institutions_id && (
        <AddCommitteeDialog
          open={addCommitteeOpen}
          onClose={() => setAddCommitteeOpen(false)}
          compositionId={compositionId}
          institutionsId={composition.institutions_id}
          institutionIdsCsv={institutionIdsCsv}
        />
      )}
    </div>
  );
}

export default function CompositionDetailPage(props: CompositionDetailPageProps) {
  // Suspense boundary required: useTabParam() reads useSearchParams().
  return (
    <Suspense fallback={null}>
      <CompositionDetailPageInner {...props} />
    </Suspense>
  );
}
