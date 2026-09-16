// app/(routes)/instasolver/track/[token]/page.tsx
//
// Insta Solver — follow an anonymously filed complaint with its private code
// (decision I7, Director 2026-09-14).
//
// The lookup is fn_track_issue_by_token(), a SECURITY DEFINER function that
// returns progress and nothing else: the number, the title the person wrote,
// where it has got to, the four timestamps, and the resolution message written
// for her. Never the handler's identity, never committee notes, never any
// raised_by_* column. It is granted to service_role and REVOKED from anon, so
// it is called here with the elevated client and never from the browser.
//
// ── WHO CAN OPEN THIS URL ───────────────────────────────────────────────────
// Behind the proxy.ts login gate; tokens are 192-bit; the per-IP rate-limit
// contract in fn_track_issue_by_token's COMMENT applies to unauthenticated-
// public callers, which this route is not. Verified rather than assumed:
// proxy.ts (Next 16's middleware) lists no public path for /instasolver/track,
// and a live probe of the deployed URL answers 307 to /auth/login. So there is
// no anonymous code-guessing surface here to rate-limit; whoever reaches this
// page has already authenticated as somebody.
//
// ── THE FUNCTION IS NOT IN THE DATABASE YET ─────────────────────────────────
// The two ticket columns an anonymous filing writes — grievance_tickets
// .is_anonymous and .anonymous_token — are ALREADY LIVE, added by
// supabase/migrations/20260417000001_compliance_unification_substrate.sql
// (lines 282-314), which has applied. Only two objects are still PENDING:
// grievance_categories.allow_anonymous and fn_track_issue_by_token(), both
// written by supabase/migrations/20261213100000_instasolver_substrate_v2.sql —
// PR #3751's migration, not yet merged. types/supabase.ts, generated from the
// live database, contains no fn_track_issue_by_token.
//
// So a complaint CAN be filed anonymously today and its code CANNOT yet be
// looked up. The missing-function case is therefore a real state this page will
// be opened in, not a theoretical one, and it gets its own sentence on screen
// rather than a blank page or a redirect (rule #27) — and, critically, a
// sentence DIFFERENT from the one shown for any other failure, because
// "tracking is not switched on yet" and "the lookup just failed" are different
// facts and only one of them is worth waiting for.

import { AlertCircle, CheckCircle2, Clock, SearchX } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** PostgREST / Postgres codes for "that function is not there". */
const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883']);

interface TrackedIssue {
  ticket_number: string | null;
  subject: string | null;
  status: string | null;
  created_at: string | null;
  assigned_at: string | null;
  resolved_at: string | null;
  withdrawn_at: string | null;
  resolution: string | null;
}

type LookupOutcome =
  | { kind: 'found'; issue: TrackedIssue }
  | { kind: 'not-found' }
  /** The lookup function is not in the database yet — a state worth waiting for. */
  | { kind: 'not-ready' }
  /** Anything else went wrong. Retryable, and not a claim about the migration. */
  | { kind: 'error' };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ContentLayout title="Check progress">
      <PageBreadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Check progress' }]} />
      <div className="mt-4">
        <PageHeader
          title="Check progress"
          description="Where your complaint has got to."
        />
      </div>
      {children}
    </ContentLayout>
  );
}

function Notice({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail?: React.ReactNode;
}) {
  return (
    <Card className="mt-4">
      <CardContent className="flex items-start gap-3 py-6">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div>
          <p className="font-medium">{title}</p>
          {detail ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function formatWhen(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function readableStatus(status: string | null): string {
  if (!status) return 'Received';
  return status.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

async function lookup(token: string): Promise<LookupOutcome> {
  const admin = createServiceRoleClient();

  // fn_track_issue_by_token is absent from types/supabase.ts because it is
  // absent from the live database, so the generated rpc overloads cannot name
  // it. The call is made through a narrowed shape rather than by widening the
  // client, and its result is validated below before anything is rendered.
  const rpc = admin.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;

  let result: { data: unknown; error: { message: string; code?: string } | null };
  try {
    result = await rpc('fn_track_issue_by_token', { p_token: token });
  } catch (err) {
    console.error('[instasolver/track] lookup threw:', err);
    return { kind: 'error' };
  }

  if (result.error) {
    // ONLY the two missing-function codes may claim the migration is pending.
    // Every other failure — a network blip, a permission change, a timeout —
    // used to borrow that sentence and tell the person to wait for a database
    // update that had in fact already landed.
    if (MISSING_FUNCTION_CODES.has(result.error.code ?? '')) {
      return { kind: 'not-ready' };
    }
    console.error('[instasolver/track] lookup failed:', result.error.message);
    return { kind: 'error' };
  }

  const rows = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
  if (rows.length === 0) return { kind: 'not-found' };

  return { kind: 'found', issue: rows[0] as TrackedIssue };
}

export default async function TrackIssuePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // NO decodeURIComponent. Next.js has already decoded the dynamic segment, so
  // a second decode is both wrong (a literal % in a code would be eaten) and
  // dangerous: `/instasolver/track/%` is not a valid escape sequence, so
  // decodeURIComponent threw a URIError outside the try below and the framework
  // answered 500 on a URL a person can reach by mistyping.
  const outcome = token ? await lookup(token) : ({ kind: 'not-found' } as const);

  if (outcome.kind === 'error') {
    return (
      <Shell>
        <Notice
          icon={<AlertCircle className="h-5 w-5 text-amber-600" />}
          title="We couldn't check right now — try again in a minute. Your complaint is safe"
          detail="Nothing has happened to your complaint. This page could not reach the record just now; the code stays valid."
        />
      </Shell>
    );
  }

  if (outcome.kind === 'not-ready') {
    return (
      <Shell>
        <Notice
          icon={<AlertCircle className="h-5 w-5 text-amber-600" />}
          title="Tracking opens once the database update lands — your complaint is safe"
          detail="It has been filed and it is in the queue. Keep your code — this page will show its progress as soon as the update is applied."
        />
      </Shell>
    );
  }

  if (outcome.kind === 'not-found') {
    return (
      <Shell>
        <Notice
          icon={<SearchX className="h-5 w-5 text-muted-foreground" />}
          title="No complaint matches this code"
          detail="Check the code and try again. Codes are case-sensitive."
        />
      </Shell>
    );
  }

  const { issue } = outcome;
  const lastUpdate =
    formatWhen(issue.withdrawn_at) ??
    formatWhen(issue.resolved_at) ??
    formatWhen(issue.assigned_at) ??
    formatWhen(issue.created_at);
  const resolved = Boolean(issue.resolved_at);

  return (
    <Shell>
      <Card className="mt-4">
        <CardContent className="space-y-5 py-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0">
              {resolved ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <Clock className="h-5 w-5 text-sky-600" />
              )}
            </span>
            <div>
              <p className="text-lg font-semibold">{readableStatus(issue.status)}</p>
              {issue.ticket_number ? (
                <p className="text-sm text-muted-foreground">
                  Complaint <span className="font-mono">{issue.ticket_number}</span>
                </p>
              ) : null}
            </div>
          </div>

          {issue.subject ? (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Your title</p>
              <p className="text-sm">{issue.subject}</p>
            </div>
          ) : null}

          {lastUpdate ? (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Last update</p>
              <p className="text-sm">{lastUpdate}</p>
            </div>
          ) : null}

          {issue.resolution ? (
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                What was done
              </p>
              <p className="mt-1 whitespace-pre-line text-sm">{issue.resolution}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </Shell>
  );
}
