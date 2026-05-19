'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Megaphone, Loader2 } from 'lucide-react';

interface Row {
  learner_id: string;
  institution_id: string | null;
  category_count: number;
  categories: string[];
  last_scored_at: string | null;
  full_name?: string | null;
  email?: string | null;
}

interface TriggerResult {
  policy_decision: string;
  dashboard_surfaced: boolean;
  email_sent: boolean;
  email_recipient_count: number;
  reason?: string;
}

export function PlacementSignalsTable() {
  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, TriggerResult>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/pde/placement-signals', { cache: 'no-store' });
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) {
          setError(json.error || 'Failed to load placement signals');
        } else {
          setRows(json.data || []);
        }
      } catch (e: unknown) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setIsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function trigger(learnerId: string) {
    setBusyId(learnerId);
    try {
      const res = await fetch('/api/pde/placement-signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ learnerId }),
      });
      const json = await res.json();
      if (res.ok) {
        setResults((r) => ({ ...r, [learnerId]: json.data }));
      } else {
        setResults((r) => ({
          ...r,
          [learnerId]: {
            policy_decision: 'error',
            dashboard_surfaced: false,
            email_sent: false,
            email_recipient_count: 0,
            reason: json.error || 'Trigger failed',
          },
        }));
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-purple-500" />
          Learners Ready for Briefing
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : error ? (
          <div className="py-8 text-center text-sm text-destructive">{error}</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No learners currently crossing the 3-category threshold.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Learner</TableHead>
                <TableHead>Categories</TableHead>
                <TableHead>Last scored</TableHead>
                <TableHead>Last result</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const result = results[r.learner_id];
                return (
                  <TableRow key={r.learner_id}>
                    <TableCell className="font-medium">
                      {r.full_name || r.email || r.learner_id}
                      <div className="text-xs text-muted-foreground">{r.email || '—'}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.category_count}</Badge>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {r.categories.join(', ')}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.last_scored_at
                        ? new Date(r.last_scored_at).toLocaleDateString()
                        : '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {result ? (
                        <span>
                          {result.policy_decision} ·{' '}
                          {result.email_sent
                            ? `sent to ${result.email_recipient_count}`
                            : result.dashboard_surfaced
                            ? 'dashboard-only'
                            : 'suppressed'}
                          {result.reason ? (
                            <div className="text-muted-foreground">{result.reason}</div>
                          ) : null}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === r.learner_id}
                        onClick={() => trigger(r.learner_id)}
                      >
                        {busyId === r.learner_id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          'Trigger briefing'
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
