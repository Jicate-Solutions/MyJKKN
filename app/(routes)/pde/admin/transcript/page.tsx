'use client';

// =====================================================================
// /pde/admin/transcript — learner picker for the admin transcript view
// =====================================================================
// Previously this index redirected to /pde/admin (a dead end): the real
// transcript lives at /pde/admin/transcript/[learnerId] and admins had no
// way to find a learner's id. This page adds an in-lane search so an admin
// can find a learner by name or email and open their PDE transcript.
//
// The transcript route keys on profiles.id (see PDETranscriptService.
// buildTranscriptData → profiles.eq('id', learnerId) + pde_demonstrations.
// learner_id), so the picker searches the profiles table (role 'student')
// and navigates with profiles.id — NOT learners_profiles.id.
//
// RLS on profiles applies to the browser client, so results are already
// scoped to what the signed-in admin may see. Gated with SuperAdminOnly to
// match the [learnerId] route's privileged-role posture.
// =====================================================================

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FileText, Loader2, Search, Users } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';

interface LearnerHit {
  id: string;
  full_name: string | null;
  email: string | null;
}

export default function AdminPdeTranscriptIndex() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LearnerHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) {
      setError('Type at least 2 characters to search.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const sb = createClientSupabaseClient() as any;
      // ilike on name OR email; profiles RLS scopes to the admin's reach.
      const pattern = `%${q}%`;
      const { data, error: qErr } = await sb
        .from('profiles')
        .select('id, full_name, email')
        .eq('role', 'student')
        .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
        .order('full_name', { ascending: true })
        .limit(25);
      if (qErr) throw qErr;
      setResults((data || []) as LearnerHit[]);
      setSearched(true);
    } catch (e: any) {
      setError(e?.message || 'Search failed.');
      setResults([]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const openTranscript = useCallback(
    (id: string) => {
      router.push(`/pde/admin/transcript/${id}`);
    },
    [router],
  );

  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="PDE Transcript">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. PDE transcripts
            contain a learner&apos;s full development record.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="PDE Transcript">
        <div className="space-y-6">
          <PageBreadcrumb
            items={[
              { label: 'Dashboard', href: '/' },
              { label: 'Administration' },
              { label: 'PDE' },
              { label: 'Transcript' },
            ]}
          />

          <header>
            <div className="flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-semibold">PDE Transcript</h1>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Find a learner to open their Personal Development Engine
              transcript — their demonstrations, capabilities, and agency
              index. Search by name or email.
            </p>
          </header>

          <Card>
            <CardContent className="pt-6">
              <form
                className="flex flex-col gap-2 sm:flex-row sm:items-center"
                onSubmit={(e) => {
                  e.preventDefault();
                  runSearch();
                }}
              >
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search learners by name or email…"
                    className="pl-9"
                    aria-label="Search learners by name or email"
                  />
                </div>
                <Button type="submit" disabled={loading}>
                  {loading ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-1 h-4 w-4" />
                  )}
                  Search
                </Button>
              </form>
              {error && (
                <p className="mt-2 text-sm text-destructive">{error}</p>
              )}
            </CardContent>
          </Card>

          {searched && !loading && results.length === 0 && !error && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Users className="mb-4 h-12 w-12 text-muted-foreground/40" />
                <p className="text-muted-foreground">
                  No learners matched &ldquo;{query.trim()}&rdquo;.
                </p>
              </CardContent>
            </Card>
          )}

          {results.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((r) => (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => openTranscript(r.id)}
                      >
                        <TableCell className="font-medium">
                          {r.full_name || 'Unknown'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {r.email || '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              openTranscript(r.id);
                            }}
                          >
                            <FileText className="mr-1 h-4 w-4" />
                            Open transcript
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </ContentLayout>
    </SuperAdminOnly>
  );
}
