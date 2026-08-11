'use client';

/*
 * JKKN ID — permanent identity lookup.
 *
 * Search-only, on purpose. There is no issue button and no backfill button on
 * this page: a JKKN ID is issued at confirmed admission or at hire, as a
 * deliberate act, and a screen that offers a bulk button invites exactly the
 * accident the design is meant to prevent — numbers spent on people who never
 * arrive. 21,976 enquiries produced 2,477 admissions.
 */

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Loader2, Search, AlertTriangle, PowerOff, Info } from 'lucide-react';
import { toast } from 'sonner';
import {
  JkknIdentityService,
  looksLikeJkknId,
  isValidJkknId,
  type ResolveResult,
  type ResolvedPerson,
} from '@/lib/services/users/jkkn-identity-service';

const MATCH_LABEL: Record<string, string> = {
  jkkn_id: 'JKKN ID',
  roll_number: 'Roll Number',
  team_code: 'Team Code',
  register_number: 'Register Number',
  application_number: 'Application Number',
  neet_roll: 'NEET Roll',
  alias: 'Former identifier',
  phone: 'Phone',
  email: 'Email',
  name: 'Name',
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function PersonRow({ person }: { person: ResolvedPerson }) {
  return (
    <div className="flex items-start gap-4 rounded-lg border p-4">
      <Avatar className="h-12 w-12 shrink-0">
        {person.photo_url ? <AvatarImage src={person.photo_url} alt="" /> : null}
        <AvatarFallback>{initials(person.full_name)}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{person.full_name}</span>
          <Badge variant={person.person_kind === 'learner' ? 'secondary' : 'outline'}>
            {person.person_kind === 'learner' ? 'Learner' : 'Team member'}
          </Badge>
          {person.status ? (
            <Badge variant="outline" className="capitalize">{person.status}</Badge>
          ) : null}
          <Badge variant="outline" className="text-xs">
            matched on {MATCH_LABEL[person.matched_on] ?? person.matched_on}
          </Badge>
        </div>

        <div className="text-sm text-muted-foreground">
          {person.institution_name ?? 'No institution recorded'}
          {person.programme ? ` · ${person.programme}` : ''}
          {person.admission_year ? ` · admitted ${person.admission_year}` : ''}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {person.roll_number ? <span>Roll Number {person.roll_number}</span> : null}
          {person.team_code ? <span>Team Code {person.team_code}</span> : null}
          {person.register_number ? <span>Register Number {person.register_number}</span> : null}
          {person.application_number ? <span>Application {person.application_number}</span> : null}
        </div>
      </div>

      <div className="shrink-0 text-right">
        {person.jkkn_id ? (
          <>
            <div className="font-mono text-lg tracking-wide">{person.jkkn_id}</div>
            <div className="text-xs text-muted-foreground">JKKN ID</div>
          </>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">not yet issued</Badge>
        )}
      </div>
    </div>
  );
}

export default function JkknIdPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResolveResult | null>(null);

  const runSearch = async () => {
    const q = query.trim();
    if (q.length < 2) {
      toast.error('Type at least two characters.');
      return;
    }

    // A mistyped JKKN ID is caught here as well as in the database, so the
    // person is told it is a typo instead of being shown an empty list — an
    // empty list reads as "this person does not exist", which is the wrong
    // answer to a wrong digit.
    if (looksLikeJkknId(q) && !isValidJkknId(q)) {
      setResult({
        query: q,
        ok: false,
        results: [],
        error: 'invalid_check_digit',
        message:
          'That is not a valid JKKN ID — the check digit does not match, so at least one digit is wrong. Read it again from the card rather than searching for it.',
      });
      return;
    }

    setLoading(true);
    try {
      setResult(await JkknIdentityService.resolvePerson(q));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lookup failed');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ContentLayout title="JKKN ID">
      <PermissionGuard module="users.jkkn_id" action="view">
        <div className="space-y-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-tight">JKKN ID</h1>
            <p className="text-sm text-muted-foreground">
              One permanent number per person, for life — six digits and a check digit, written
              348295-7. Learners and team members draw from the same pool, so someone who studies
              here and later joins the team keeps the number they already have.
            </p>
          </div>

          {/* Dormancy notice. Deliberately the first thing on the page. */}
          <Card className="border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/20">
            <CardHeader className="flex flex-row items-start gap-3 space-y-0">
              <PowerOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <CardTitle className="text-base">This system is switched off</CardTitle>
                <CardDescription className="text-foreground/80">
                  No JKKN ID has been issued to anyone, and the backfill has not run. The tables,
                  the check-digit rules and this lookup exist, but nothing issues a number yet —
                  numbers are given out one at a time, at confirmed admission or at hire, never at
                  enquiry. Search below works today and will show &ldquo;not yet issued&rdquo; for
                  everyone until issuance is switched on deliberately.
                </CardDescription>
              </div>
            </CardHeader>
          </Card>

          {/* Search */}
          <Card>
            <CardHeader>
              <CardTitle>Find a person</CardTitle>
              <CardDescription>
                Search by JKKN ID, Roll Number, Team Code, university register number, application
                number, name, phone or email. A university register number such as 731325106030 is
                the awarding body&rsquo;s, not ours — it keeps working here as an alias and is never
                replaced.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
                  placeholder="348295-7 · 24UBAC12 · 731325106030 · Kavya · 9876543210"
                  className="font-mono"
                  aria-label="Search for a person by any identifier"
                />
                <Button onClick={runSearch} disabled={loading}>
                  {loading
                    ? <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    : <Search className="mr-1 h-4 w-4" />}
                  Search
                </Button>
              </div>

              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : null}

              {!loading && result && result.error === 'invalid_check_digit' ? (
                <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                  <div className="text-sm">
                    <p className="font-medium">Mistyped JKKN ID</p>
                    <p className="text-muted-foreground">{result.message}</p>
                  </div>
                </div>
              ) : null}

              {!loading && result && result.ok && result.results.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nobody matched &ldquo;{result.query}&rdquo;.
                  {result.scope_note ? ` ${result.scope_note}` : ''}
                </p>
              ) : null}

              {!loading && result && result.results.length > 0 ? (
                <div className="space-y-3">
                  {result.results.map((p) => (
                    <PersonRow key={`${p.person_kind}-${p.person_id}-${p.matched_on}`} person={p} />
                  ))}
                  {result.scope_note ? (
                    <p className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                      <Info className="h-3.5 w-3.5" />
                      {result.scope_note}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </PermissionGuard>
    </ContentLayout>
  );
}
