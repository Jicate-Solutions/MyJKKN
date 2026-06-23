'use client';

// "Your voice this term" — the learner's private feedback receipt (C3).
// First-person ledger of the learner's OWN participation: how many classes they
// confirmed, how many they flagged as hard to follow, and — the loop-close — how
// many of those flagged classes the cohort understood better next time.
//
// PRIVACY: reads fn_scf_my_impact, which returns only the learner's own ratings +
// a derived `improved` boolean (gated to a k>=3 responses floor). No other
// learner's rating or identity is ever shown. Renders nothing until the learner
// has given at least one piece of feedback (no empty-receipt clutter).

import { useMemo } from 'react';
import { Heart, CheckCircle2, Flag, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useMyImpact } from '@/hooks/use-session-feedback';

const BRAND = '#0b6d41';

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function StatTile({
  icon,
  value,
  label,
  tone,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  tone: 'brand' | 'amber' | 'green';
}) {
  const valueColor =
    tone === 'amber'
      ? 'text-amber-600'
      : tone === 'green'
        ? 'text-green-600'
        : '';
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border bg-background/60 px-3 py-3 text-center">
      <div className="flex items-center gap-1.5 text-muted-foreground">{icon}</div>
      <span
        className={`text-2xl font-bold tabular-nums ${valueColor}`}
        style={tone === 'brand' ? { color: BRAND } : undefined}
      >
        {value}
      </span>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

export function MyVoiceReceipt() {
  // "This term" — the last 120 days.
  const { from, to } = useMemo(() => {
    const today = new Date();
    const start = new Date(today.getTime() - 120 * 24 * 60 * 60 * 1000);
    return {
      from: start.toISOString().slice(0, 10),
      to: today.toISOString().slice(0, 10),
    };
  }, []);

  const { data, isLoading } = useMyImpact(from, to);
  const rows = data ?? [];

  const { confirmed, flagged, improved, flaggedRows } = useMemo(() => {
    const flaggedRows = rows.filter((r) => r.flagged);
    return {
      confirmed: rows.length,
      flagged: flaggedRows.length,
      improved: flaggedRows.filter((r) => r.improved === true).length,
      flaggedRows,
    };
  }, [rows]);

  // No receipt until there's history. Stay invisible while loading or empty so the
  // page's primary job (pending feedback) is never pushed down for nothing.
  if (isLoading || confirmed === 0) return null;

  return (
    <Card className="bg-[#fbfbee]/40 dark:bg-card">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <Heart className="h-5 w-5" style={{ color: BRAND }} />
          <h2 className="text-lg font-semibold" style={{ color: BRAND }}>
            Your voice this term
          </h2>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <StatTile
            icon={<CheckCircle2 className="h-4 w-4" />}
            value={confirmed}
            label="Confirmed"
            tone="brand"
          />
          <StatTile
            icon={<Flag className="h-4 w-4" />}
            value={flagged}
            label="Flagged"
            tone="amber"
          />
          <StatTile
            icon={<TrendingUp className="h-4 w-4" />}
            value={improved}
            label="Improved next time"
            tone="green"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Every class you confirm marks your attendance and gives your teachers an honest
          signal.{' '}
          {flagged > 0
            ? improved > 0
              ? `You flagged ${flagged} ${flagged === 1 ? 'class' : 'classes'} as hard to follow — and ${improved} got clearer the next time. Your feedback moved the needle.`
              : `You flagged ${flagged} ${flagged === 1 ? 'class' : 'classes'} as hard to follow. Watch this space — we’ll show when one improves next time.`
            : 'When you flag a class as hard to follow, we’ll show here whether it got clearer next time.'}
        </p>

        {flaggedRows.length > 0 ? (
          <ul className="divide-y rounded-md border bg-background/40">
            {flaggedRows.slice(0, 5).map((r, i) => {
              const status =
                r.improved === true
                  ? { label: 'Improved next time', cls: 'border-green-200 bg-green-100 text-green-800' }
                  : r.improved === false
                    ? { label: 'About the same', cls: 'border-border bg-muted text-muted-foreground' }
                    : { label: 'Awaiting next class', cls: 'border-border bg-muted text-muted-foreground' };
              return (
                <li
                  key={`${r.attendance_date}-${r.course_code ?? 'na'}-${i}`}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-medium">
                      {r.course_name || r.course_code || 'Class session'}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {formatDate(r.attendance_date)}
                    </span>
                  </div>
                  <Badge variant="outline" className={status.cls}>
                    {status.label}
                  </Badge>
                </li>
              );
            })}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
