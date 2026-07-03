'use client';

/**
 * Schools Network — Assign JKKN Owner form.
 *
 * Registered in MENU_PERMISSIONS ('/admission/schools-network/[schoolId]/
 * owners/assign' → schools_network.owners.manage) and linked from the detail
 * page's Owners tab, but never built → 404 in prod. This blocked the
 * outreach_coordinator model: there was no UI to put a JKKN person behind a
 * school relationship. Calls POST /api/schools-network/schools/:id/owners per
 * spec §7.7.
 *
 * Staff picker mirrors the debounced 300ms search in
 * app/(routes)/events/induction/[id]/_components/event-coordinators-section.tsx.
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Search, UserCog, X } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { assignOwner, listPartners, searchStaff } from '../../../_lib/api';
import {
  OWNER_ROLE_LABEL,
  type SchoolOwnerRole,
  type StaffSearchRow,
} from '../../../_lib/types';

const ROLES: SchoolOwnerRole[] = ['outreach_coordinator', 'program_lead'];

function AssignOwnerForm({ schoolId }: { schoolId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StaffSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<StaffSearchRow | null>(null);
  const [role, setRole] = useState<SchoolOwnerRole>('outreach_coordinator');
  const [programPartnerId, setProgramPartnerId] = useState('');

  const partnersQuery = useQuery({
    queryKey: ['schools-network', 'partners', 'picker'],
    queryFn: () => listPartners({ limit: 50 }),
    enabled: role === 'program_lead',
  });
  const partners = partnersQuery.data?.rows ?? [];

  // Debounced staff search — only while nothing is selected. The endpoint
  // short-circuits under 2 chars, but we also guard here to skip the round-trip.
  useEffect(() => {
    if (selected) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    let active = true;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchStaff(q);
        if (active) setResults(r.rows);
      } catch {
        if (active) setResults([]);
      } finally {
        if (active) setSearching(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query, selected]);

  const mutation = useMutation({
    mutationFn: () =>
      assignOwner(schoolId, {
        jkknUserId: selected!.id,
        role,
        programPartnerId:
          role === 'program_lead' ? programPartnerId : undefined,
      }),
    onSuccess: () => {
      toast.success('Owner assigned');
      queryClient.invalidateQueries({ queryKey: ['schools-network'] });
      router.push(`/admission/schools-network/${schoolId}`);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to assign owner');
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) {
      toast.error('Pick a staff member');
      return;
    }
    if (role === 'program_lead' && !programPartnerId) {
      toast.error('A program lead must be tied to a program partner');
      return;
    }
    mutation.mutate();
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <Link
          href={`/admission/schools-network/${schoolId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Back to school
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" /> Assign a JKKN owner
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label>Staff member *</Label>
              {selected ? (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="gap-1 pr-1">
                    <span className="font-medium">{selected.fullName}</span>
                    {selected.email && (
                      <span className="text-muted-foreground">
                        · {selected.email}
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label="Clear selected staff member"
                      onClick={() => {
                        setSelected(null);
                        setQuery('');
                      }}
                      className="ml-0.5 rounded hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      placeholder="Search staff by name or email…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <div className="max-h-64 overflow-auto space-y-1">
                    {query.trim().length < 2 ? (
                      <p className="text-sm text-muted-foreground py-2">
                        Type at least 2 characters to search.
                      </p>
                    ) : searching ? (
                      <p className="text-sm text-muted-foreground py-2">
                        Searching…
                      </p>
                    ) : results.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">
                        No staff found.
                      </p>
                    ) : (
                      results.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setSelected(s)}
                          className="w-full flex items-center justify-between gap-2 rounded-md border p-2 text-left hover:border-primary"
                        >
                          <div className="min-w-0">
                            <div className="font-medium truncate">
                              {s.fullName}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {[s.email, s.role].filter(Boolean).join(' · ') ||
                                '—'}
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role *</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as SchoolOwnerRole)}
              >
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {OWNER_ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {role === 'program_lead'
                  ? 'A program lead runs a partner-funded programme at this school — link the partner below.'
                  : 'An outreach coordinator owns JKKN’s day-to-day relationship with this school.'}
              </p>
            </div>

            {role === 'program_lead' && (
              <div className="space-y-2">
                <Label htmlFor="partner">Program partner *</Label>
                <Select
                  value={programPartnerId}
                  onValueChange={setProgramPartnerId}
                >
                  <SelectTrigger id="partner">
                    <SelectValue
                      placeholder={
                        partnersQuery.isLoading
                          ? 'Loading…'
                          : 'Select program partner'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {partners.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Link href={`/admission/schools-network/${schoolId}`}>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Assign owner
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AssignOwnerPage() {
  const params = useParams<{ schoolId: string }>();
  const schoolId = params?.schoolId ?? '';

  return (
    <PermissionGuard module="schools_network.owners" action="manage">
      <ContentLayout title="Assign Owner">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/schools-network">
                Schools Network
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href={`/admission/schools-network/${schoolId}`}>
                Detail
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Assign Owner</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="mt-6">
          <AssignOwnerForm schoolId={schoolId} />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
