'use client';

// ============================================================================
// WidgetConfigForm — Director-friendly editor for dashboard.role_widgets.
// ============================================================================
// One card per role. Each card shows a checkbox list of widget IDs (with
// plain-English labels + consequences) so the Director can toggle widgets
// on/off without ever touching JSON. A single "Save all" button writes the
// whole map back in one PUT.
//
// The widget catalog (id + label + consequence) is duplicated from
// lib/services/dashboard/widget-config-service.ts WIDGET_IDS — kept in sync
// by hand. Adding a new widget requires:
//   1. Add the slot + persona gate in /dashboard/page.tsx
//   2. Add the id to WIDGET_IDS in widget-config-service.ts
//   3. Add a row to WIDGET_CATALOG below with a Director-readable consequence
//   4. (Optional) Seed it into the role default arrays in the migration
// ============================================================================

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

type RoleWidgetMap = Record<string, string[]>;

// Widget catalog — what each ID means, in plain English. Order = render
// suggestion for new role rows. Editing this file alone does NOT change what
// the dashboard renders — that comes from the saved platform_policies row.
const WIDGET_CATALOG: Array<{ id: string; label: string; consequence: string }> = [
  {
    id: 'todays_focus',
    label: "Today's Focus card",
    consequence: 'The single most-important thing to act on right now. Sits at the very top.',
  },
  {
    id: 'morning_brief',
    label: '8am Morning Brief',
    consequence: 'Dismissible per-day summary of overnight activity + unacked counts.',
  },
  {
    id: 'counselor_staffing_alert',
    label: 'Counselor staffing alert',
    consequence: 'Banner that appears when top counselor load > 3× median or orphan institutions exist.',
  },
  {
    id: 'whatsapp_health',
    label: 'WhatsApp connection health',
    consequence: 'Per-department WhatsApp connection health — visible only if user has in-scope rows.',
  },
  {
    id: 'hero',
    label: 'Hero metrics strip',
    consequence: 'Role-specific 4-tile strip (Director gets cross-institution; others get their scope).',
  },
  {
    id: 'streak',
    label: 'Streak badge',
    consequence: 'Gamification: consecutive days of activity. Useful for counselor / Director.',
  },
  {
    id: 'institution_chips',
    label: 'Institution drill-in chips',
    consequence: 'Quick links to per-institution dashboards. Director-only (cross-institution scope).',
  },
  {
    id: 'decision_queue',
    label: 'Decision queue',
    consequence: 'List of approvals / escalations / rescue items the user needs to act on.',
  },
  {
    id: 'activity_feed',
    label: 'Team activity feed',
    consequence: 'Ambient stream of what the team is doing right now (notes, calls, status changes).',
  },
  {
    id: 'leaderboards',
    label: 'SLA + conversion leaderboards',
    consequence: 'Daily SLA + monthly conversion rankings. Most useful for Director + Counselor.',
  },
  {
    id: 'daily_intel',
    label: 'Daily intel brief',
    consequence:
      'Latest daily-intelligence brief pushed in from outside the platform. Off for every role until you tick it here; shows nothing until a brief has actually been sent.',
  },
];

// Roles surfaced as cards. `_default` is special — it's the catch-all for
// roles not explicitly listed (e.g. new roles added later).
const ROLES: Array<{ key: string; label: string; hint: string }> = [
  { key: 'director', label: 'Director / Super Admin', hint: 'admin, administrator, super_admin' },
  { key: 'cao', label: 'CAO / Chief Academic Officer', hint: 'Strategic operator view' },
  { key: 'hr_officer', label: 'HR Officer', hint: 'Onboarding / leave / payroll focus' },
  { key: 'counselor', label: 'Counselor', hint: 'admission_counselor, admission_staff, expo_counselor' },
  { key: 'hod', label: 'Head of Department (HOD)', hint: 'Department-scoped' },
  { key: 'faculty', label: 'Faculty', hint: 'Attendance + TES + timetable focus' },
  { key: 'principal', label: 'Principal', hint: 'Institution-scoped operator view' },
  { key: 'accounts', label: 'Accounts', hint: 'Collection vs plan + reconciliation' },
  { key: 'student', label: 'Student / Learner', hint: 'Self-scoped — fees, attendance, timetable' },
  { key: '_default', label: 'Fallback (any other role)', hint: 'Used when role has no explicit list above' },
];

export function WidgetConfigForm() {
  const [draft, setDraft] = useState<RoleWidgetMap | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/dashboard-widget-config', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const msg = j?.error ?? `Failed to load (${res.status})`;
        toast.error(msg);
        setLoadError(msg);
        setDraft({});
        return;
      }
      const json = await res.json();
      const value = (json?.data?.value ?? {}) as RoleWidgetMap;
      setDraft(value);
      setUpdatedAt(json?.data?.updated_at ?? null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Network error';
      toast.error(msg);
      setLoadError(msg);
      setDraft({});
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function toggleWidget(roleKey: string, widgetId: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      const current = prev[roleKey] ?? [];
      const next = current.includes(widgetId)
        ? current.filter((w) => w !== widgetId)
        : [...current, widgetId];
      return { ...prev, [roleKey]: next };
    });
  }

  async function saveAll() {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/dashboard-widget-config', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: draft }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j?.error ?? `Save failed (${res.status})`);
        return;
      }
      const json = await res.json();
      setUpdatedAt(json?.data?.updated_at ?? null);
      toast.success('Saved — affects every user the next time they load /dashboard.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Network error';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  if (draft === null) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (loadError) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">
            Could not load widget config: {loadError}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
        <p className="font-medium">How this works</p>
        <p className="mt-1">
          Tick a widget to <em>allow</em> it for that role. Untick to hide it. The
          underlying persona logic still applies — e.g. cross-institution widgets
          only render for users whose role has the data scope to see them. This
          form can only <em>hide</em>, never grant access.
        </p>
      </div>

      {ROLES.map((role) => {
        const enabled = new Set(draft[role.key] ?? []);
        return (
          <Card key={role.key}>
            <CardHeader>
              <CardTitle className="text-base">{role.label}</CardTitle>
              <CardDescription>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                  {role.key}
                </code>{' '}
                — {role.hint}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {WIDGET_CATALOG.map((w) => {
                  const cbId = `${role.key}__${w.id}`;
                  return (
                    <div key={cbId} className="flex items-start gap-3">
                      <Checkbox
                        id={cbId}
                        checked={enabled.has(w.id)}
                        onCheckedChange={() => toggleWidget(role.key, w.id)}
                      />
                      <div className="space-y-0.5">
                        <Label
                          htmlFor={cbId}
                          className="text-sm font-medium leading-none cursor-pointer"
                        >
                          {w.label}
                        </Label>
                        <p className="text-xs text-muted-foreground">{w.consequence}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}

      <div className="sticky bottom-0 -mx-2 sm:-mx-3 lg:-mx-4 px-2 sm:px-3 lg:px-4 py-3 bg-background/95 backdrop-blur-sm border-t border-border flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {updatedAt ? `Last saved ${new Date(updatedAt).toLocaleString()}` : 'Not saved yet'}
        </p>
        <Button onClick={saveAll} disabled={saving} size="sm">
          {saving ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin mr-2" />
              Saving…
            </>
          ) : (
            'Save all roles'
          )}
        </Button>
      </div>
    </div>
  );
}
