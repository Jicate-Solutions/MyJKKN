'use client';

// config-master-consequence-page.tsx
// ---------------------------------------------------------------------------
// "Director's view" wrapper around MasterTablePage for the CDC config masters.
//
// Standing rule (docs/architecture/config-table-pattern.md): every policy
// decision is a config row, edited in a super-admin UI, read at runtime — zero
// deploys. A plain CRUD table answers "what are the rows"; a Director running
// daily operations also needs "what does changing this DO". This wrapper adds
// that consequence layer on top of the existing MasterTablePage:
//
//   1. A plain-English statement of what the list controls.
//   2. A visual cascade:  [this list] → [the form field it feeds] → [N records].
//   3. A per-row "in use" count (how many records currently reference each row).
//   4. The deactivation contract spelled out (soft-delete keeps existing rows).
//
// Usage counts are read self-contained via the browser client. They are
// resilient: if the consuming FK column does not exist yet (the form-wiring PR
// hasn't merged), the query throws and we show "not yet wired" instead of
// breaking the page — so this admin page is safe to ship before/independent of
// the form wiring.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { MasterTablePage } from './master-table-page';
import type { CdcMasterTable } from '@/types/admin/cdc';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface ConsequenceConfig {
  /** Table whose rows reference this master (e.g. 'industry_mentors'). */
  usageTable: string;
  /** Column on usageTable that points at this master's id. */
  usageColumn: string;
  /** 'fk' = scalar uuid column; 'array' = uuid[] (e.g. expertise_area_ids). */
  usageType?: 'fk' | 'array';
  /** Human label of where it feeds, e.g. "Add Industry Mentor → Engagement Category". */
  formLabel: string;
  /** Plural noun for the consuming records, e.g. "industry mentors". */
  recordNoun: string;
}

interface Props {
  tableName: CdcMasterTable;
  title: string;
  description: string;
  breadcrumbs: { label: string; href: string }[];
  consequence: ConsequenceConfig;
}

export function ConfigMasterConsequencePage({
  tableName,
  title,
  description,
  breadcrumbs,
  consequence,
}: Props) {
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [totalUsed, setTotalUsed] = useState(0);
  const [usageError, setUsageError] = useState(false);
  const [usageLoading, setUsageLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClientSupabaseClient();
    (async () => {
      try {
        const { data, error } = await supabase
          .from(consequence.usageTable)
          .select(consequence.usageColumn);
        if (error) throw error;
        const counts: Record<string, number> = {};
        let total = 0;
        for (const row of data ?? []) {
          const v = (row as Record<string, unknown>)[consequence.usageColumn];
          if (consequence.usageType === 'array') {
            for (const id of (v as string[] | null) ?? []) {
              if (!id) continue;
              counts[id] = (counts[id] ?? 0) + 1;
              total += 1;
            }
          } else if (v) {
            const id = v as string;
            counts[id] = (counts[id] ?? 0) + 1;
            total += 1;
          }
        }
        if (!cancelled) {
          setUsage(counts);
          setTotalUsed(total);
        }
      } catch {
        // Column not present yet (form-wiring PR not merged) — degrade gracefully.
        if (!cancelled) setUsageError(true);
      } finally {
        if (!cancelled) setUsageLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [consequence.usageTable, consequence.usageColumn, consequence.usageType]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">What this list controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            These {title.toLowerCase()} populate the dropdown in{' '}
            <strong className="text-foreground">{consequence.formLabel}</strong>. Editing this
            list changes that dropdown instantly for everyone — no deploy, no developer.
          </p>

          {/* Visual cascade: list → form field → records */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary">{title}</Badge>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <Badge variant="outline">{consequence.formLabel}</Badge>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <Badge variant={usageError ? 'outline' : 'default'}>
              {usageLoading
                ? 'counting…'
                : usageError
                  ? 'not yet wired'
                  : `${totalUsed} ${consequence.recordNoun} tagged`}
            </Badge>
          </div>

          <p className="text-xs text-muted-foreground">
            Removing a row here <strong>deactivates</strong> it (soft): it disappears from new{' '}
            {consequence.recordNoun} but stays on every record that already uses it — nothing
            breaks, and you can re-activate it anytime.
          </p>
        </CardContent>
      </Card>

      <MasterTablePage
        tableName={tableName}
        title={title}
        description={description}
        breadcrumbs={breadcrumbs}
        extraListColumns={[
          {
            key: '__usage',
            label: 'In use',
            render: (row: { id: string }) => {
              if (usageError) {
                return <span className="text-xs text-muted-foreground">—</span>;
              }
              const n = usage[row.id] ?? 0;
              return (
                <span className="text-xs text-muted-foreground">
                  {n} {consequence.recordNoun}
                </span>
              );
            },
          },
        ]}
      />
    </div>
  );
}
