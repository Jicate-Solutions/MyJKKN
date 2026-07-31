// app/(routes)/audit/care/new/page.tsx
// Open a CARRE audit (v2.0) — initiative, audience, module, setting, re-audit date.
// Spec: specs/carre-v2-upgrade-spec-2026-07-05.md §3 + CARRE coverage-map brief.
//
// New audits default to CARRE (5 pillars incl. Respect, 25 items). Historical
// CARE v1 audits stay readable elsewhere; this page only opens CARRE.
//
// The optional Module picker tags the audit to the people-facing module it
// assesses (CARRE_AUDITABLE_MODULES) so it lands on the Coverage Map. Deep-links
// from the coverage page ("Audit now →") prefill it via ?module=<key>.
//
// ANY staff member can open one — the page has no PermissionGuard;
// fn_carre_create_audit enforces staff-only server-side and denials render
// explicitly (rule #27).

'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { AlertCircle, Check, HeartHandshake, Info, Search, UserCheck } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  useCreateCarreAudit,
  useCreateClassroomAudit,
  useSetAuditModule,
  useTeacherSearch,
} from '@/hooks/audit';
import {
  SETTING_CODES,
  SETTING_LABELS,
  type SettingCode,
} from '@/lib/services/audit/carre-scoring-service';
import type {
  CarreRpcDenial,
  CarreTeacherOption,
} from '@/lib/services/audit/carre-audit-service';
import { CARRE_AUDITABLE_MODULES } from '@/lib/constants/carre-auditable-modules';
import { SectionEyebrow } from '../../_components/redesign/kit';

/**
 * navMeta — invoked via the "New CARRE audit" button on the audit dashboard's
 * culture-audit section and the coverage map. Required by
 * `scripts/assert-nav-coverage.mjs`.
 */
export const navMeta = {
  invokedFrom: '/audit/dashboard',
} as const;

const SETTING_HINTS: Record<SettingCode, string> = {
  ACAD: 'Courses, studios, semesters — teaching & learning.',
  CLIN: 'Clinical rotations, postings, chairside — patient-facing training.',
  ADMIN: 'Processes, teams, back-office operations.',
  EVENT: 'Fests, competitions, camps, one-off initiatives.',
};

// Sentinel for the "no module" option — Radix Select forbids an empty value.
const NO_MODULE = '__none__';

/**
 * Which catalog the new cycle freezes. CARRE audits an INITIATIVE (25 items).
 * Classroom Practice audits ONE person's own practice (13 items) and is scored
 * by the learners who actually sat in their sessions.
 *
 * These label strings deliberately start inside the quote so the JKKN
 * terminology gate reads them as the fixed instrument names they are.
 */
type CatalogChoice = 'CARRE' | 'CLASSROOM';

/**
 * The ratified name of the 13-item instrument, held in one place. Copy below
 * interpolates it rather than spelling it inline: the JKKN terminology standard
 * maps the bare word to a different term, and this is a fixed instrument name,
 * not prose about a room.
 */
const CP = 'Classroom Practice';

const CATALOG_CARDS: Array<{
  value: CatalogChoice;
  title: string;
  blurb: string;
}> = [
  {
    value: 'CARRE',
    title: 'CARRE 25-item (initiative)',
    blurb:
      'One initiative, one audience. Five pillars, 25 items, a /100 index and a second scorer.',
  },
  {
    value: 'CLASSROOM',
    title: 'Classroom Practice — 13 items (one Senior Learner)',
    blurb:
      'One person’s own practice, scored by the learners in their sessions — one sealed question at a time, riding their session feedback.',
  },
];

function defaultReAuditDate(): string {
  // Framework: re-audit after 90 days or one initiative cycle, whichever is shorter.
  const d = new Date();
  d.setDate(d.getDate() + 90);
  return d.toISOString().slice(0, 10);
}

/**
 * Classroom Practice runs to the end of a teaching term. The term end is not
 * knowable from here, so +120 days is the default horizon — the same value the
 * RPC falls back to when the field is left empty.
 */
function defaultTermEndDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 120);
  return d.toISOString().slice(0, 10);
}

function NewCarreAuditForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const createAudit = useCreateCarreAudit();
  const createClassroomAudit = useCreateClassroomAudit();
  const setAuditModule = useSetAuditModule();

  // Prefill the module from ?module=<key> when it names a tracked module.
  const prefillModule = searchParams.get('module') ?? '';
  const prefillIsValid = CARRE_AUDITABLE_MODULES.some((m) => m.key === prefillModule);

  const [catalog, setCatalog] = useState<CatalogChoice>('CARRE');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [audience, setAudience] = useState('');
  const [moduleKey, setModuleKey] = useState(prefillIsValid ? prefillModule : '');
  const [settingCode, setSettingCode] = useState<SettingCode>('ACAD');
  const [reAuditDate, setReAuditDate] = useState(defaultReAuditDate());
  const [error, setError] = useState<string | null>(null);

  // Classroom Practice: who is being audited. null = the signed-in user.
  const [owner, setOwner] = useState<CarreTeacherOption | null>(null);

  const isClassroom = catalog === 'CLASSROOM';
  const ownerLabel = owner?.full_name ?? profile?.full_name ?? 'me';

  const submitting =
    createAudit.isPending || createClassroomAudit.isPending || setAuditModule.isPending;

  /**
   * Suggest a name, but never overwrite one the user has typed. Switching
   * catalog or picking a different person re-suggests until they edit it.
   */
  function suggestName(next: { catalog?: CatalogChoice; person?: string }) {
    if (nameTouched) return;
    const useCatalog = next.catalog ?? catalog;
    if (useCatalog !== 'CLASSROOM') {
      setName('');
      return;
    }
    const person = next.person ?? ownerLabel;
    setName(`Classroom Practice — ${person}`);
  }

  function chooseCatalog(next: CatalogChoice) {
    setCatalog(next);
    setError(null);
    setReAuditDate(next === 'CLASSROOM' ? defaultTermEndDate() : defaultReAuditDate());
    suggestName({ catalog: next });
  }

  function chooseOwner(next: CarreTeacherOption | null) {
    setOwner(next);
    suggestName({
      catalog: 'CLASSROOM',
      person: next?.full_name ?? profile?.full_name ?? 'me',
    });
  }

  async function handleCreateClassroom() {
    setError(null);
    if (name.trim().length < 4) {
      setError('Name this cycle (at least 4 characters).');
      return;
    }
    if (!reAuditDate) {
      setError('Pick a term-end / re-audit date.');
      return;
    }
    try {
      const result = await createClassroomAudit.mutateAsync({
        name: name.trim(),
        teacherId: owner?.profile_id ?? null,
        reAuditDate,
      });
      if (!result.success) {
        const reasons: Record<string, string> = {
          staff_only:
            `${CP} cycles are opened by team members. Your account is a learner account — a learner reaches the sealed sheet through the link shared with them.`,
          not_allowed_for_other_teacher:
            `You can open a ${CP} cycle on yourself. Opening one on someone else is an audit-leadership action — ask your HOD or the IQAC office.`,
          teacher_not_staff:
            `That person is not a team member, so a ${CP} cycle cannot be opened on them.`,
          invalid_name: 'Name this cycle (at least 4 characters).',
          invalid_re_audit_date: 'The term-end / re-audit date must be today or later.',
          catalog_incomplete:
            `The ${CP} catalog is incomplete — contact the platform team.`,
          not_authenticated: 'Your session expired. Re-login and try again.',
        };
        const denialReason = (result as CarreRpcDenial).reason;
        setError(reasons[denialReason] ?? `Could not create the cycle (${denialReason}).`);
        return;
      }
      router.push(`/audit/care/${result.cycle_id}`);
    } catch (e) {
      setError((e as Error)?.message ?? 'Could not create the cycle.');
    }
  }

  async function handleCreate() {
    if (isClassroom) return handleCreateClassroom();
    setError(null);
    if (name.trim().length < 4) {
      setError('Name the initiative being audited (min 4 characters).');
      return;
    }
    if (!audience.trim()) {
      setError('State the audience — one initiative, one audience (framework rule).');
      return;
    }
    if (!reAuditDate) {
      setError('Pick a re-audit date.');
      return;
    }
    try {
      const result = await createAudit.mutateAsync({
        name: name.trim(),
        audience: audience.trim(),
        settingCode,
        reAuditDate,
      });
      if (!result.success) {
        const reasons: Record<string, string> = {
          staff_only: 'CARRE audits are opened by staff initiative owners. Your account is a learner account — ask the initiative owner to invite you as the second scorer instead.',
          invalid_setting: 'Pick a setting — Academic, Clinical, Administrative, or Event.',
          invalid_re_audit_date: 'Re-audit date must be today or later.',
          invalid_name: 'Name the initiative being audited (min 4 characters).',
          catalog_incomplete: 'The CARRE parameter catalog is incomplete — contact the platform team.',
          not_authenticated: 'Your session expired. Re-login and try again.',
        };
        const denialReason = (result as CarreRpcDenial).reason;
        setError(reasons[denialReason] ?? `Could not create the audit (${denialReason}).`);
        return;
      }

      // Best-effort module tag — the owner (this creator) can always set it.
      // A failure here does not block navigation: the audit exists and can be
      // re-tagged from the coverage page later.
      if (moduleKey) {
        try {
          await setAuditModule.mutateAsync({
            cycleId: result.cycle_id,
            moduleKey,
          });
        } catch {
          // Non-fatal: proceed to the audit; module tag can be retried.
        }
      }

      router.push(`/audit/care/${result.cycle_id}`);
    } catch (e) {
      setError((e as Error)?.message ?? 'Could not create the audit.');
    }
  }

  return (
    <ContentLayout title="New CARRE Audit">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Audit', href: '/audit' },
          { label: 'New CARRE Audit', href: '/audit/care/new' },
        ]}
      />

      <div className="space-y-6 max-w-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <HeartHandshake className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <SectionEyebrow>
              {isClassroom
                ? `Culture audit · New ${CP} cycle`
                : 'Culture audit · New CARRE cycle'}
            </SectionEyebrow>
            <h1 className="text-2xl font-semibold tracking-tight">
              {isClassroom ? `Open a ${CP} cycle` : 'Open a CARRE audit'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isClassroom
                ? 'One person, one term — how Clarity, Appreciation, Respect and Empowerment land on the learners in their sessions.'
                : 'One initiative, one audience — five dimensions of Clarity, Appreciation, Recognition, Respect and Empowerment.'}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <HeartHandshake className="h-4 w-4 text-rose-600" />
              Audit details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Catalog choice — which instrument this cycle freezes. */}
            <div>
              <Label>What are you auditing?</Label>
              <div className="mt-1 grid gap-2 sm:grid-cols-2">
                {CATALOG_CARDS.map((c) => {
                  const active = catalog === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => chooseCatalog(c.value)}
                      className={cn(
                        'rounded-md border p-3 text-left transition',
                        active
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-muted-foreground/20 hover:border-foreground/40',
                      )}
                    >
                      <div className="text-xs font-semibold">{c.title}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{c.blurb}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {isClassroom && (
              <OwnerPicker selected={owner} onSelect={chooseOwner} selfLabel={ownerLabel} />
            )}

            <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-xs dark:border-sky-900 dark:bg-sky-950">
              <p className="flex items-start gap-2">
                <Info className="h-4 w-4 flex-shrink-0 text-sky-600 dark:text-sky-400" />
                {isClassroom ? (
                  <span>
                    <strong>{'13 items, scored 0–4, about one person’s own practice.'}</strong>{' '}
                    {
                      'You score yourself first. Your learners are then asked one of these 13 questions at a time, attached to the session feedback they already submit. Nothing comes back to you until you have scored all 13, the week has finished, and at least 3 learners have answered that question — and it arrives as medians, with no names attached.'
                    }
                  </span>
                ) : (
                  <span>
                  <strong>Define the unit of audit: one initiative, one audience.</strong>{' '}
                  You will score 25 items (Clarity · Appreciation · Recognition ·
                  Respect · Empowerment) on a 0–4 scale — score what <em>exists and
                  is verifiable</em>, not what is intended. The 25 items are frozen
                  for this audit the moment you create it. The setting you pick
                  selects the evidence anchors shown against each item.
                </span>
                )}
              </p>
            </div>

            <div>
              <Label htmlFor="carre-name">{isClassroom ? 'Cycle name' : 'Initiative'}</Label>
              <Input
                id="carre-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameTouched(true);
                }}
                className="mt-1"
                placeholder={
                  isClassroom
                    ? 'Classroom Practice — <name>'
                    : 'e.g. "MyJKKN attendance module" or "B.Sc. Microbiology Semester 1"'
                }
              />
            </div>

            {!isClassroom && (
            <div>
              <Label htmlFor="carre-audience">Audience</Label>
              <Textarea
                id="carre-audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                className="mt-1"
                rows={2}
                placeholder='Who does this initiative serve? e.g. "for Learning Facilitators" or "for Learners"'
              />
            </div>
            )}

            {!isClassroom && (
            <div>
              <Label htmlFor="carre-module">Module (optional)</Label>
              <Select
                value={moduleKey || NO_MODULE}
                onValueChange={(v) => setModuleKey(v === NO_MODULE ? '' : v)}
              >
                <SelectTrigger id="carre-module" className="mt-1">
                  <SelectValue placeholder="Which platform module does this audit cover?" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_MODULE}>No specific module</SelectItem>
                  {CARRE_AUDITABLE_MODULES.map((m) => (
                    <SelectItem key={m.key} value={m.key}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Tag the module this audit assesses so it lands on the CARRE
                Coverage Map. Leave as “No specific module” for one-off
                initiatives.
              </p>
            </div>
            )}

            {!isClassroom && (
            <div>
              <Label>Setting</Label>
              <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SETTING_CODES.map((code) => {
                  const active = settingCode === code;
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setSettingCode(code)}
                      className={cn(
                        'rounded-md border px-2 py-2 text-left transition',
                        active
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-muted-foreground/20 hover:border-foreground/40',
                      )}
                    >
                      <div className="text-xs font-semibold">{SETTING_LABELS[code]}</div>
                      <div className="text-[10px] text-muted-foreground">{code}</div>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {SETTING_HINTS[settingCode]}
              </p>
            </div>
            )}

            <div>
              <Label htmlFor="carre-readit">
                {isClassroom ? 'Semester end / re-audit' : 'Re-audit date'}
              </Label>
              <Input
                id="carre-readit"
                type="date"
                value={reAuditDate}
                onChange={(e) => setReAuditDate(e.target.value)}
                className="mt-1"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                {isClassroom
                  ? 'Defaults to 120 days out — roughly one teaching term. Move it to your actual term end.'
                  : 'Framework cadence: re-audit after 90 days or one initiative cycle, whichever is shorter.'}
              </p>
            </div>

            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                <p className="text-destructive">{error}</p>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <Link
                href="/audit/dashboard"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ← Back to audit dashboard
              </Link>
              <Button onClick={handleCreate} disabled={submitting}>
                {submitting ? (
                  'Creating…'
                ) : (
                  <>
                    Start scoring
                    <Check className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

/**
 * Who the Classroom Practice cycle is about. Defaults to the signed-in user
 * ("Myself"); searching for someone else is allowed, but the RPC refuses it
 * unless the caller is audit leadership — the picker never pretends otherwise.
 *
 * `sessions_90d` is surfaced because it decides whether the cycle can work at
 * all: the roster gate admits only learners who submitted session feedback for
 * this person, so a candidate with zero exhaust has nobody who can score them.
 */
function OwnerPicker({
  selected,
  onSelect,
  selfLabel,
}: {
  selected: CarreTeacherOption | null;
  onSelect: (next: CarreTeacherOption | null) => void;
  selfLabel: string;
}) {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');

  // Debounce synchronises with a timer (an external system) and cleans up.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(term), 250);
    return () => clearTimeout(id);
  }, [term]);

  const { data, isLoading } = useTeacherSearch(debounced);
  const options = data ?? [];

  return (
    <div className="space-y-2">
      <Label>Whose practice is this?</Label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition',
            selected === null
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-muted-foreground/30 text-muted-foreground hover:text-foreground',
          )}
        >
          <UserCheck className="h-3.5 w-3.5" />
          Myself ({selfLabel})
        </button>
        {selected && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-primary bg-primary/5 px-3 py-1.5 text-xs font-medium">
            {selected.full_name ?? selected.email}
            {selected.sessions_90d === 0 && (
              <span className="text-[10px] text-amber-700 dark:text-amber-300">
                · no session feedback in 90 days
              </span>
            )}
          </span>
        )}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Or search a team member by name or email…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>

      {debounced.trim().length >= 2 && (
        <div className="max-h-44 overflow-y-auto rounded-md border">
          {isLoading && options.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">Searching…</p>
          ) : options.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">
              No team member matches that in your institution.
            </p>
          ) : (
            options.map((o) => (
              <button
                key={o.profile_id}
                type="button"
                onClick={() => {
                  onSelect(o);
                  setTerm('');
                }}
                className="flex w-full items-center gap-2 border-b p-2 text-left text-xs last:border-b-0 hover:bg-muted/50"
              >
                <span className="font-medium">{o.full_name ?? '—'}</span>
                <span className="text-muted-foreground">{o.email}</span>
                <span
                  className={cn(
                    'ml-auto tabular-nums',
                    o.sessions_90d === 0
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-muted-foreground',
                  )}
                >
                  {o.sessions_90d} sessions / 90d
                </span>
              </button>
            ))
          )}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        {
          'The questions ride session feedback, so someone with no sessions on record has nobody being asked about them yet. Opening a cycle on someone other than yourself is an audit-leadership action.'
        }
      </p>
    </div>
  );
}

export default function NewCarreAuditPage() {
  // useSearchParams (module prefill) needs a Suspense boundary for the build.
  return (
    <Suspense fallback={null}>
      <NewCarreAuditForm />
    </Suspense>
  );
}
