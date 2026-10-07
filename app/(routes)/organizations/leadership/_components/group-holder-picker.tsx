'use client';

// Who can hold a group post: ANY profile, found by server-side search.
//
// The old flat list was active staff only (719 people). Profiles is ~8,000 rows
// and mostly learners, so this is a search + filters + pages, not a dropdown:
//   - text: every word must match name, email or staff id
//   - custom role: matches ANY ticked role
//   - institution, active-only, staff-only (ON by default so learners do not
//     drown the default view; switch it off to reach anyone with a profile)
// Admin-only on the server; the appointment itself is re-validated there too
// (profile must exist and be active).

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar } from './leader-card';
import {
  CANDIDATE_PAGE_SIZE,
  useGroupCandidateRoles,
  useGroupCandidateSearch,
  useLeadershipOverview,
  type CandidateFilters,
  type GroupCandidate,
} from '@/hooks/use-leadership';

const DEFAULTS: CandidateFilters = {
  query: '',
  roleIds: [],
  institutionId: '',
  activeOnly: true,
  staffOnly: true,
};

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function GroupHolderPicker({
  open,
  onOpenChange,
  postLabel,
  currentHolderId,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postLabel: string;
  currentHolderId: string | null;
  onPick: (candidate: GroupCandidate) => Promise<boolean>;
}) {
  const [filters, setFilters] = useState<CandidateFilters>(DEFAULTS);
  const [page, setPage] = useState(0);
  const [roleSearch, setRoleSearch] = useState('');
  const [chosen, setChosen] = useState<GroupCandidate | null>(null);
  const [saving, setSaving] = useState(false);

  const debouncedQuery = useDebounced(filters.query, 300);
  const effective = useMemo(() => ({ ...filters, query: debouncedQuery }), [filters, debouncedQuery]);

  const search = useGroupCandidateSearch(effective, page, open);
  const roles = useGroupCandidateRoles(open);
  const institutions = useLeadershipOverview().data ?? [];

  const total = search.data?.total ?? 0;
  const rows = search.data?.rows ?? [];
  const from = total === 0 ? 0 : page * CANDIDATE_PAGE_SIZE + 1;
  const to = Math.min((page + 1) * CANDIDATE_PAGE_SIZE, total);
  const lastPage = Math.max(0, Math.ceil(total / CANDIDATE_PAGE_SIZE) - 1);

  // Any filter change goes back to page 1 and drops a half-made choice.
  const update = (patch: Partial<CandidateFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(0);
    setChosen(null);
  };

  const shownRoles = useMemo(() => {
    const q = roleSearch.trim().toLowerCase();
    return (roles.data ?? []).filter((r) => !q || r.role_name.toLowerCase().includes(q));
  }, [roles.data, roleSearch]);

  const toggleRole = (id: string) =>
    update({
      roleIds: filters.roleIds.includes(id)
        ? filters.roleIds.filter((r) => r !== id)
        : [...filters.roleIds, id],
    });

  async function confirm() {
    if (!chosen) return;
    setSaving(true);
    const ok = await onPick(chosen);
    setSaving(false);
    if (ok) {
      setChosen(null);
      onOpenChange(false);
    }
  }

  const filtersActive =
    filters.roleIds.length > 0 ||
    filters.institutionId !== '' ||
    !filters.activeOnly ||
    !filters.staffOnly ||
    filters.query !== '';

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (saving) return;
        onOpenChange(o);
        if (!o) {
          setFilters(DEFAULTS);
          setPage(0);
          setChosen(null);
          setRoleSearch('');
        }
      }}
    >
      {/* DialogContent has no max-height of its own. */}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Select {postLabel}</DialogTitle>
          <DialogDescription>
            Search everyone with a profile. Narrow by custom role or institution.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input
              value={filters.query}
              onChange={(e) => update({ query: e.target.value })}
              placeholder="Search name, email or staff ID — several words narrow the match"
              className="pl-8"
              aria-label="Search people"
              autoFocus
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  Custom role{filters.roleIds.length > 0 && ` (${filters.roleIds.length})`}
                </p>
                {filters.roleIds.length > 0 && (
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => update({ roleIds: [] })}
                  >
                    Clear
                  </button>
                )}
              </div>
              <Input
                value={roleSearch}
                onChange={(e) => setRoleSearch(e.target.value)}
                placeholder="Find a role…"
                className="h-8"
                aria-label="Find a role"
              />
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {roles.isLoading && <li className="text-xs text-muted-foreground">Loading roles…</li>}
                {shownRoles.map((r) => (
                  <li key={r.id}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={filters.roleIds.includes(r.id)}
                        onChange={() => toggleRole(r.id)}
                      />
                      {r.role_name}
                    </label>
                  </li>
                ))}
                {!roles.isLoading && shownRoles.length === 0 && (
                  <li className="text-xs text-muted-foreground">No roles match.</li>
                )}
              </ul>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor="gp-inst" className="mb-1 block text-sm font-medium">Institution</label>
                <select
                  id="gp-inst"
                  value={filters.institutionId}
                  onChange={(e) => update({ institutionId: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">Any institution</option>
                  {institutions.map((i) => (
                    <option key={i.institution_id} value={i.institution_id}>
                      {i.institution_name}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={filters.activeOnly}
                  onChange={(e) => update({ activeOnly: e.target.checked })}
                />
                Active profiles only
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={filters.staffOnly}
                  onChange={(e) => update({ staffOnly: e.target.checked })}
                />
                <span>
                  Staff only
                  <span className="block text-xs text-muted-foreground">
                    Untick to include learners and other profiles.
                  </span>
                </span>
              </label>
              {filtersActive && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setFilters(DEFAULTS);
                    setPage(0);
                    setChosen(null);
                  }}
                >
                  <X className="h-3 w-3" aria-hidden />
                  Reset all filters
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {search.isLoading ? 'Searching…' : total === 0 ? 'No matches' : `${from}–${to} of ${total}`}
              </span>
              <span className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0"
                  aria-label="Previous page"
                  disabled={page === 0 || search.isFetching}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 p-0"
                  aria-label="Next page"
                  disabled={page >= lastPage || search.isFetching}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </span>
            </div>

            {search.error && (
              <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {(search.error as Error).message}
              </p>
            )}

            {search.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <ul className={`divide-y divide-border rounded-md border border-border ${search.isFetching ? 'opacity-60' : ''}`}>
                {rows.map((c) => {
                  const isChosen = chosen?.id === c.id;
                  const isCurrent = c.id === currentHolderId;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setChosen(c)}
                        className={`flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none ${
                          isChosen ? 'bg-primary/10' : ''
                        }`}
                      >
                        <Avatar
                          size='md'
                          person={{ user_id: c.id, full_name: c.full_name, email: c.email, photo_url: c.photo_url }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {c.full_name?.trim() || c.email || 'Unnamed person'}
                            {isCurrent && (
                              <span className="ml-2 text-xs font-normal text-muted-foreground">current holder</span>
                            )}
                            {!c.is_active && (
                              <span className="ml-2 text-xs font-normal text-amber-700 dark:text-amber-500">inactive</span>
                            )}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[c.designation, c.email, c.staff_id, c.institution_name].filter(Boolean).join(' · ')}
                          </p>
                          {c.roles.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {c.roles.slice(0, 3).map((r) => (
                                <span key={r.id} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                  {r.role_name}
                                </span>
                              ))}
                              {c.roles.length > 3 && (
                                <span className="px-1 text-[11px] text-muted-foreground">+{c.roles.length - 3}</span>
                              )}
                            </div>
                          )}
                        </div>
                        {isChosen && <Check className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
                {rows.length === 0 && (
                  <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No one matches. Try fewer words, another role, or untick Staff only.
                  </li>
                )}
              </ul>
            )}
          </div>

          {chosen && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
              <span>
                Appoint <strong>{chosen.full_name?.trim() || chosen.email}</strong> as {postLabel}?
              </span>
              <span className="flex gap-2">
                <Button size="sm" disabled={saving} onClick={() => void confirm()}>
                  {saving ? 'Saving…' : 'Appoint'}
                </Button>
                <Button size="sm" variant="outline" disabled={saving} onClick={() => setChosen(null)}>
                  Cancel
                </Button>
              </span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
