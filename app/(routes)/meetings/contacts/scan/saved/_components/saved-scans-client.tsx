'use client';

/**
 * Scanned Contacts — the one screen that shows where every saved card went.
 *
 * Two jobs, in this order deliberately:
 *   1. NEEDS ATTENTION — cards that could not be filed (a skipped event/site
 *      picker, a missing required field, a write that errored). This is the
 *      module owner's to-do queue and it sits at the TOP, because a parked card
 *      that nobody can see is a card nobody will ever finish.
 *   2. WHERE THINGS WENT — everything successfully routed, grouped by list.
 *      Five of those lists have no screen of their own, so for them this is the
 *      only place the record is visible at all; they are marked as such rather
 *      than pretending a link exists.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  ExternalLink,
  Loader2,
  RefreshCw,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

interface Person {
  job_id: string;
  name: string;
  organization: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  event: string | null;
  routed_to: string | null;
  saved_at: string;
  in_contact_book: boolean;
}

interface AttentionItem extends Person {
  status: string;
  needs: 'event' | 'site' | null;
  table: string | null;
  table_label: string | null;
  missing_fields: string[];
  error: string | null;
  what_to_do: string;
}

interface Group {
  table: string;
  label: string;
  href: string | null;
  only_view_here: boolean;
  count: number;
  people: Person[];
}

interface Payload {
  ok: boolean;
  total?: number;
  attention?: AttentionItem[];
  groups?: Group[];
  contact_book_only?: Person[];
  unavailable?: string;
}

export function SavedScansClient() {
  const { toast } = useToast();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [fixing, setFixing] = useState<string | null>(null);
  const [options, setOptions] = useState<Array<{ id: string; label: string; hint: string | null }> | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/contacts/card-scan/saved', { cache: 'no-store' });
      setData(await res.json());
    } catch {
      setData({ ok: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Load the picker only when someone actually opens a parked card.
  const openFix = async (item: AttentionItem) => {
    setFixing(item.job_id);
    setOptions(null);
    if (!item.needs) return;
    try {
      const res = await fetch(`/api/contacts/card-scan/options?kind=${item.needs}`, {
        cache: 'no-store',
      });
      const json = await res.json();
      setOptions(json.ok ? json.options : []);
    } catch {
      setOptions([]);
    }
  };

  const complete = async (item: AttentionItem, parentId: string) => {
    setBusy(true);
    try {
      const res = await fetch('/api/contacts/card-scan/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: item.job_id,
          [item.needs === 'event' ? 'event_id' : 'site_id']: parentId,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({
          title: 'Not filed',
          description: json.error ?? 'Something went wrong.',
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: json.status === 'routed' ? 'Filed' : 'Still needs work',
        description:
          json.status === 'routed'
            ? `${item.name} added to ${item.table_label ?? 'the list'}.`
            : (json.error ?? 'Could not be filed yet.'),
      });
      setFixing(null);
      void load();
    } finally {
      setBusy(false);
    }
  };

  const match = (p: Person) => {
    if (!q.trim()) return true;
    const n = q.trim().toLowerCase();
    return [p.name, p.organization, p.role, p.email, p.phone, p.event]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(n));
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>;
  }
  if (!data?.ok) {
    return (
      <Card className="mt-4">
        <CardContent className="py-6 text-sm text-muted-foreground">
          Could not load your scans.
        </CardContent>
      </Card>
    );
  }
  if (data.unavailable) {
    return (
      <Card className="mt-4">
        <CardContent className="py-6 text-sm">{data.unavailable}</CardContent>
      </Card>
    );
  }

  const attention = (data.attention ?? []).filter(match);
  const groups = (data.groups ?? [])
    .map((g) => ({ ...g, people: g.people.filter(match) }))
    .filter((g) => g.people.length > 0);
  const bookOnly = (data.contact_book_only ?? []).filter(match);

  return (
    <div className="space-y-4 mt-4">
      <div className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a name, company, phone or event…"
        />
        <Button variant="ghost" size="icon" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* ── Needs attention — first, always ────────────────────────────────── */}
      {attention.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/60 dark:bg-amber-950/20">
          <CardContent className="pt-5 space-y-3">
            <p className="font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Needs attention ({attention.length})
            </p>
            {attention.map((item) => (
              <div key={item.job_id} className="rounded-md border bg-background p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[item.organization, item.routed_to].filter(Boolean).join(' · ') || '—'}
                    </p>
                    <p className="text-xs text-amber-700 mt-0.5">{item.what_to_do}</p>
                  </div>
                  {item.needs && fixing !== item.job_id && (
                    <Button size="sm" variant="outline" onClick={() => void openFix(item)}>
                      Choose
                    </Button>
                  )}
                </div>

                {fixing === item.job_id && item.needs && (
                  <div className="rounded-md border p-2 space-y-2">
                    <p className="text-xs font-medium">Which {item.needs}?</p>
                    {options === null ? (
                      <p className="text-xs text-muted-foreground">Loading…</p>
                    ) : options.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No {item.needs}s are set up yet — one has to be created before this
                        card can be filed.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {options.map((o) => (
                          <Button
                            key={o.id}
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            disabled={busy}
                            onClick={() => void complete(item, o.id)}
                          >
                            {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                            {o.label}
                            {o.hint ? ` · ${o.hint}` : ''}
                          </Button>
                        ))}
                      </div>
                    )}
                    <Button size="sm" variant="ghost" className="text-xs" onClick={() => setFixing(null)}>
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Where things went ──────────────────────────────────────────────── */}
      {groups.map((g) => (
        <Card key={g.table}>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-2">
              <p className="font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                {g.label}
                <Badge variant="secondary">{g.count}</Badge>
              </p>
              {g.href ? (
                <Link
                  href={g.href}
                  className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
                >
                  Open the full list <ExternalLink className="h-3 w-3" />
                </Link>
              ) : (
                <span className="text-xs text-muted-foreground">Only viewable here</span>
              )}
            </div>
            <ul className="divide-y">
              {g.people.map((p) => (
                <li key={p.job_id} className="py-2 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[p.organization, p.role, p.phone].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  {p.event && (
                    <Badge variant="outline" className="text-xs shrink-0">
                      {p.event}
                    </Badge>
                  )}
                  {p.in_contact_book && (
                    <Check className="h-3.5 w-3.5 text-green-600 shrink-0" aria-label="in the contact book" />
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      {/* ── Contact book only ──────────────────────────────────────────────── */}
      {bookOnly.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <p className="font-medium mb-2">
              Contact book only <Badge variant="secondary">{bookOnly.length}</Badge>
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              Saved as &ldquo;just a contact&rdquo; — no module list was chosen.
            </p>
            <ul className="divide-y">
              {bookOnly.map((p) => (
                <li key={p.job_id} className="py-2 text-sm">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-muted-foreground">
                    {p.organization ? ` · ${p.organization}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {attention.length === 0 && groups.length === 0 && bookOnly.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {q.trim() ? 'Nothing matches that search.' : 'No saved cards yet.'}
            <div className="mt-3">
              <Link href="/meetings/contacts/scan" className="text-primary inline-flex items-center gap-1">
                Scan a card <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
