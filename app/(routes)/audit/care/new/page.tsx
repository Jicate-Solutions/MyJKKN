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

import { Suspense, useState } from 'react';
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
import { AlertCircle, Check, HeartHandshake, Info } from 'lucide-react';
import { useCreateCarreAudit, useSetAuditModule } from '@/hooks/audit';
import {
  SETTING_CODES,
  SETTING_LABELS,
  type SettingCode,
} from '@/lib/services/audit/carre-scoring-service';
import type { CarreRpcDenial } from '@/lib/services/audit/carre-audit-service';
import { CARRE_AUDITABLE_MODULES } from '@/lib/constants/carre-auditable-modules';

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

function defaultReAuditDate(): string {
  // Framework: re-audit after 90 days or one initiative cycle, whichever is shorter.
  const d = new Date();
  d.setDate(d.getDate() + 90);
  return d.toISOString().slice(0, 10);
}

function NewCarreAuditForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createAudit = useCreateCarreAudit();
  const setAuditModule = useSetAuditModule();

  // Prefill the module from ?module=<key> when it names a tracked module.
  const prefillModule = searchParams.get('module') ?? '';
  const prefillIsValid = CARRE_AUDITABLE_MODULES.some((m) => m.key === prefillModule);

  const [name, setName] = useState('');
  const [audience, setAudience] = useState('');
  const [moduleKey, setModuleKey] = useState(prefillIsValid ? prefillModule : '');
  const [settingCode, setSettingCode] = useState<SettingCode>('ACAD');
  const [reAuditDate, setReAuditDate] = useState(defaultReAuditDate());
  const [error, setError] = useState<string | null>(null);

  const submitting = createAudit.isPending || setAuditModule.isPending;

  async function handleCreate() {
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
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <HeartHandshake className="h-4 w-4 text-rose-600" />
              Open a CARRE audit
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs dark:border-blue-900 dark:bg-blue-950">
              <p className="flex items-start gap-2">
                <Info className="h-4 w-4 flex-shrink-0 text-blue-600" />
                <span>
                  <strong>Define the unit of audit: one initiative, one audience.</strong>{' '}
                  You will score 25 items (Clarity · Appreciation · Recognition ·
                  Respect · Empowerment) on a 0–4 scale — score what <em>exists and
                  is verifiable</em>, not what is intended. The 25 items are frozen
                  for this audit the moment you create it. The setting you pick
                  selects the evidence anchors shown against each item.
                </span>
              </p>
            </div>

            <div>
              <Label htmlFor="carre-name">Initiative</Label>
              <Input
                id="carre-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
                placeholder='e.g. "MyJKKN attendance module" or "B.Sc. Microbiology Semester 1"'
              />
            </div>

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

            <div>
              <Label htmlFor="carre-readit">Re-audit date</Label>
              <Input
                id="carre-readit"
                type="date"
                value={reAuditDate}
                onChange={(e) => setReAuditDate(e.target.value)}
                className="mt-1"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Framework cadence: re-audit after 90 days or one initiative cycle,
                whichever is shorter.
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

export default function NewCarreAuditPage() {
  // useSearchParams (module prefill) needs a Suspense boundary for the build.
  return (
    <Suspense fallback={null}>
      <NewCarreAuditForm />
    </Suspense>
  );
}
