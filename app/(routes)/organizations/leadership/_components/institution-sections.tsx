'use client';

// Institutions and schools, one section each, in order. Each shows ONLY the posts
// that institution has, as profile cards — a school with a Headmaster and no
// IQAC never gets an empty IQAC slot. Opening a section's "Manage" button opens
// the drawer to assign people or change which posts apply.

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Eye, EyeOff, GraduationCap, School, Search, Settings2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LEADERSHIP_QK } from '@/hooks/use-leadership';
import { vacantCount, type OverviewRow } from '@/lib/organizations/leadership-stats';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { LeaderCard } from './leader-card';

// Accent per entity type so schools and colleges are told apart at a glance.
const ACCENT = {
  school: 'from-emerald-700 to-teal-800 dark:from-emerald-900 dark:to-teal-950',
  institution: 'from-indigo-700 to-blue-800 dark:from-indigo-900 dark:to-blue-950',
} as const;

export function InstitutionSections({
  rows,
  hiddenRows,
  canEdit,
  onOpen,
}: {
  rows: OverviewRow[];
  /** Only ever non-empty for super admins. */
  hiddenRows: OverviewRow[];
  canEdit: boolean;
  onOpen: (institutionId: string) => void;
}) {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [vacantOnly, setVacantOnly] = useState(false);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => !q || r.institution_name.toLowerCase().includes(q))
      .filter((r) => !vacantOnly || vacantCount(r) > 0);
  }, [rows, query, vacantOnly]);

  // Enforced on the server (super admin only); the switch is only rendered for
  // them. Hiding removes the institution from this page for everyone; it does
  // not change anybody's access to it anywhere else.
  async function setHidden(row: OverviewRow, hidden: boolean) {
    setBusyId(row.institution_id);
    const sb = createClientSupabaseClient() as any;
    const { error } = await sb.rpc('fn_set_leadership_institution_hidden', {
      p_institution_id: row.institution_id,
      p_hidden: hidden,
    });
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      hidden ? `${row.institution_name} hidden from this page.` : `${row.institution_name} is shown again.`,
    );
    await qc.invalidateQueries({ queryKey: LEADERSHIP_QK.overview });
  }

  return (
    <section aria-labelledby="institutions-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="institutions-title" className="text-lg font-semibold">
          Institutions and schools{' '}
          <span className="text-sm font-normal text-muted-foreground">({shown.length})</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search institutions…"
              className="h-9 w-56 pl-8"
              aria-label="Search institutions"
            />
          </div>
          <button
            type="button"
            onClick={() => setVacantOnly((v) => !v)}
            aria-pressed={vacantOnly}
            className={`h-9 rounded-md border px-3 text-sm ${
              vacantOnly ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-500' : 'border-border'
            }`}
          >
            Only with vacancies
          </button>
        </div>
      </div>

      {shown.length === 0 && (
        <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          No institutions match.
        </p>
      )}

      {shown.map((r) => {
        const total = r.posts.length;
        const vacant = vacantCount(r);
        const filled = total - vacant;
        const pct = total ? Math.round((filled / total) * 100) : 0;
        const isSchool = r.entity_type === 'school';
        const Icon = isSchool ? School : GraduationCap;
        return (
          <article
            key={r.institution_id}
            className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
          >
            <header
              className={`flex flex-wrap items-center gap-3 bg-gradient-to-r px-5 py-3 text-white ${
                isSchool ? ACCENT.school : ACCENT.institution
              }`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-semibold leading-tight">{r.institution_name}</h3>
                <p className="text-xs text-white/85">
                  {vacant === 0 ? `All ${total} posts filled` : `${filled} of ${total} posts filled`}
                </p>
              </div>
              <div className="hidden w-32 sm:block" role="presentation">
                <div className="h-1.5 overflow-hidden rounded-full bg-white/25">
                  <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="shrink-0"
                onClick={() => onOpen(r.institution_id)}
              >
                {canEdit ? (
                  <Settings2 className="mr-1.5 h-4 w-4" aria-hidden />
                ) : (
                  <Eye className="mr-1.5 h-4 w-4" aria-hidden />
                )}
                {canEdit ? 'Manage' : 'View'}
              </Button>
            </header>

            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
              {r.posts.map((p) => (
                <LeaderCard key={p.code} postLabel={p.label} person={p.holder} />
              ))}
            </div>
          </article>
        );
      })}

      {canEdit && hiddenRows.length > 0 && (
        <details className="rounded-2xl border border-dashed border-border bg-muted/20">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-sm font-medium marker:hidden">
            <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden />
            Hidden institutions ({hiddenRows.length})
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {hiddenRows.map((r) => (
              <li key={r.institution_id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <span className="min-w-0 truncate">{r.institution_name}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === r.institution_id}
                  onClick={() => void setHidden(r, false)}
                >
                  <Eye className="mr-1.5 h-4 w-4" aria-hidden />
                  Show on page
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
