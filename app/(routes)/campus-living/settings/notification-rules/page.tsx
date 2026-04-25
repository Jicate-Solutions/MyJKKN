'use client';

/**
 * Notification Rules — /campus-living/settings/notification-rules
 *
 * Wired 2026-04-24 (Agent G — settings real-save). Previous page (Agent D,
 * PR #449) was display-only with a `PreviewBanner` because the
 * `hostel_notification_rules` table didn't exist yet. Agent F ships the
 * table in a parallel PR; this page now reads + writes against it.
 *
 * Matrix UX (copied from Agent D's maintenance-sla pattern):
 *   - dirty cells get an amber ring
 *   - Save button counter shows N changes
 *   - batch upsert on Save with Promise.allSettled in the service layer
 *
 * Permission gate: `campus_living.settings.edit` or super_admin.
 */

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Save,
  Bell,
  Mail,
  MessageSquare,
  Smartphone,
  Loader2,
  Info,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useHostelNotificationRules,
  useUpsertHostelNotificationRules,
} from '@/hooks/campus-living/use-hostel-notification-rules';

/**
 * Stable schema for the page — every event_key is what lands in the DB.
 * Category labels here are presentational; the DB stores lowercase keys
 * ('leave' | 'maintenance' | 'safety' | 'mess' | 'fees').
 */
type Channel = 'email' | 'sms' | 'push';
type EventDef = {
  category: string; // DB key (lowercase)
  categoryLabel: string; // UI label
  event_key: string; // UNIQUE across the table (per institution)
  event_label: string; // UI label
  defaults: Record<Channel, boolean>;
};

const CATALOG: EventDef[] = [
  // ——— Leave
  {
    category: 'leave',
    categoryLabel: 'Leave Management',
    event_key: 'leave_submitted',
    event_label: 'Leave request submitted',
    defaults: { email: true, sms: false, push: true },
  },
  {
    category: 'leave',
    categoryLabel: 'Leave Management',
    event_key: 'leave_decision',
    event_label: 'Leave approved/rejected',
    defaults: { email: true, sms: true, push: true },
  },
  {
    category: 'leave',
    categoryLabel: 'Leave Management',
    event_key: 'leave_return_reminder',
    event_label: 'Leave returning reminder',
    defaults: { email: false, sms: true, push: true },
  },
  // ——— Maintenance
  {
    category: 'maintenance',
    categoryLabel: 'Maintenance',
    event_key: 'maintenance_request_created',
    event_label: 'New request created',
    defaults: { email: true, sms: false, push: true },
  },
  {
    category: 'maintenance',
    categoryLabel: 'Maintenance',
    event_key: 'maintenance_request_assigned',
    event_label: 'Request assigned',
    defaults: { email: true, sms: false, push: true },
  },
  {
    category: 'maintenance',
    categoryLabel: 'Maintenance',
    event_key: 'maintenance_request_resolved',
    event_label: 'Request resolved',
    defaults: { email: true, sms: false, push: true },
  },
  {
    category: 'maintenance',
    categoryLabel: 'Maintenance',
    event_key: 'maintenance_sla_breach_warning',
    event_label: 'SLA breach warning',
    defaults: { email: true, sms: true, push: true },
  },
  // ——— Safety
  {
    category: 'safety',
    categoryLabel: 'Safety',
    event_key: 'safety_incident_reported',
    event_label: 'Incident reported',
    defaults: { email: true, sms: true, push: true },
  },
  {
    category: 'safety',
    categoryLabel: 'Safety',
    event_key: 'safety_curfew_violation',
    event_label: 'Curfew violation',
    defaults: { email: true, sms: true, push: true },
  },
  {
    category: 'safety',
    categoryLabel: 'Safety',
    event_key: 'safety_unauthorized_entry',
    event_label: 'Unauthorized entry',
    defaults: { email: true, sms: true, push: true },
  },
  // ——— Mess
  {
    category: 'mess',
    categoryLabel: 'Mess',
    event_key: 'mess_menu_published',
    event_label: 'Menu published',
    defaults: { email: false, sms: false, push: true },
  },
  {
    category: 'mess',
    categoryLabel: 'Mess',
    event_key: 'mess_opt_out_approved',
    event_label: 'Meal opt-out approved',
    defaults: { email: true, sms: false, push: true },
  },
  {
    category: 'mess',
    categoryLabel: 'Mess',
    event_key: 'mess_low_rating_alert',
    event_label: 'Low rating alert',
    defaults: { email: true, sms: false, push: false },
  },
  // ——— Fees
  {
    category: 'fees',
    categoryLabel: 'Fees',
    event_key: 'fees_payment_reminder',
    event_label: 'Payment reminder',
    defaults: { email: true, sms: true, push: true },
  },
  {
    category: 'fees',
    categoryLabel: 'Fees',
    event_key: 'fees_payment_received',
    event_label: 'Payment received',
    defaults: { email: true, sms: true, push: true },
  },
  {
    category: 'fees',
    categoryLabel: 'Fees',
    event_key: 'fees_overdue_notice',
    event_label: 'Overdue notice',
    defaults: { email: true, sms: true, push: true },
  },
];

type RuleCell = {
  id?: string;
  channel_email: boolean;
  channel_sms: boolean;
  channel_push: boolean;
};

/** Group CATALOG by category for rendering, preserving declared order. */
function groupByCategory(catalog: EventDef[]): Array<{
  category: string;
  categoryLabel: string;
  events: EventDef[];
}> {
  const out: Array<{
    category: string;
    categoryLabel: string;
    events: EventDef[];
  }> = [];
  const seen = new Map<string, number>();
  for (const ev of catalog) {
    const idx = seen.get(ev.category);
    if (idx === undefined) {
      seen.set(ev.category, out.length);
      out.push({
        category: ev.category,
        categoryLabel: ev.categoryLabel,
        events: [ev],
      });
    } else {
      out[idx].events.push(ev);
    }
  }
  return out;
}

const GROUPED = groupByCategory(CATALOG);

export default function NotificationRulesPage() {
  // NEVER destructure `user` from useAuth — use `profile` (memory: PR #407 pattern).
  const { profile } = useAuth();
  const { permissions, isSuperAdmin } = usePermissions();
  const institutionId = profile?.institution_id ?? undefined;
  const canEdit =
    isSuperAdmin || permissions?.['campus_living.settings.edit'] === true;

  const {
    data: dbRules,
    isLoading,
    isError,
    error,
  } = useHostelNotificationRules(institutionId);
  const upsertMut = useUpsertHostelNotificationRules();

  /**
   * Seed the grid from DB rows, keyed by event_key. For any event defined in
   * the catalog but not yet in the DB, we fall back to the catalog defaults
   * so the UI renders predictably on first-ever load.
   */
  const initialGrid = useMemo<Record<string, RuleCell>>(() => {
    const g: Record<string, RuleCell> = {};
    for (const ev of CATALOG) {
      g[ev.event_key] = {
        channel_email: ev.defaults.email,
        channel_sms: ev.defaults.sms,
        channel_push: ev.defaults.push,
      };
    }
    for (const row of dbRules ?? []) {
      g[row.event_key] = {
        id: row.id,
        channel_email: row.channel_email,
        channel_sms: row.channel_sms,
        channel_push: row.channel_push,
      };
    }
    return g;
  }, [dbRules]);

  const [grid, setGrid] = useState<Record<string, RuleCell>>(initialGrid);
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  // Re-sync grid when DB payload refreshes and nothing is pending. Mirrors
  // Agent D's maintenance-sla pattern so freshly-saved rows land in the UI
  // without blowing away unsaved edits.
  useEffect(() => {
    if (dirty.size === 0) setGrid(initialGrid);
  }, [initialGrid, dirty.size]);

  const handleToggle = (eventKey: string, channel: Channel, next: boolean) => {
    setGrid((g) => ({
      ...g,
      [eventKey]: {
        ...g[eventKey],
        [`channel_${channel}` as keyof RuleCell]: next,
      },
    }));
    setDirty((d) => new Set(d).add(eventKey));
  };

  const isDirty = dirty.size > 0;

  const handleSave = async () => {
    if (!institutionId) {
      toast.error(
        'No institution context — select an institution before saving.',
      );
      return;
    }
    if (!isDirty) return;

    const rows = Array.from(dirty).map((eventKey) => {
      const cat = CATALOG.find((c) => c.event_key === eventKey);
      if (!cat) {
        // Should be unreachable — dirty keys come from the CATALOG.
        throw new Error(`Unknown event_key: ${eventKey}`);
      }
      const cell = grid[eventKey];
      return {
        id: cell.id,
        category: cat.category,
        event_key: cat.event_key,
        event_label: cat.event_label,
        channel_email: cell.channel_email,
        channel_sms: cell.channel_sms,
        channel_push: cell.channel_push,
      };
    });

    try {
      await upsertMut.mutateAsync({
        institutionId,
        rows,
        updatedBy: profile?.id ?? null,
      });
      setDirty(new Set());
    } catch {
      // onError toast is handled in the hook.
    }
  };

  return (
    <ContentLayout title="Notification Rules">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Notification Preferences</h1>
            <p className="text-muted-foreground">
              Configure which events trigger notifications and through which
              channels. Saves to{' '}
              <code>hostel_notification_rules</code>.
            </p>
          </div>
          <Button
            onClick={handleSave}
            disabled={!canEdit || !isDirty || upsertMut.isPending}
          >
            {upsertMut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {isDirty
              ? `Save ${dirty.size} change${dirty.size === 1 ? '' : 's'}`
              : 'Save Changes'}
          </Button>
        </div>

        {!canEdit ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Read-only</AlertTitle>
            <AlertDescription>
              You can view notification rules but editing requires the{' '}
              <code>campus_living.settings.edit</code> permission.
            </AlertDescription>
          </Alert>
        ) : null}

        {isError ? (
          <Alert variant="destructive">
            <AlertTitle>Failed to load notification rules</AlertTitle>
            <AlertDescription>
              {(error as Error)?.message ?? 'Unknown error'}
            </AlertDescription>
          </Alert>
        ) : null}

        {isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading notification rules...
            </CardContent>
          </Card>
        ) : (
          GROUPED.map((group) => (
            <Card key={group.category}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  {group.categoryLabel}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-4 text-sm font-medium text-muted-foreground border-b pb-2">
                    <div>Event</div>
                    <div className="flex items-center gap-1 justify-center">
                      <Mail className="h-3 w-3" />
                      Email
                    </div>
                    <div className="flex items-center gap-1 justify-center">
                      <MessageSquare className="h-3 w-3" />
                      SMS
                    </div>
                    <div className="flex items-center gap-1 justify-center">
                      <Smartphone className="h-3 w-3" />
                      Push
                    </div>
                  </div>
                  {group.events.map((ev) => {
                    const cell = grid[ev.event_key];
                    const isRowDirty = dirty.has(ev.event_key);
                    return (
                      <div
                        key={ev.event_key}
                        className={`grid grid-cols-4 gap-4 items-center rounded-md px-2 py-1 transition ${
                          isRowDirty ? 'ring-2 ring-amber-400 bg-amber-50/40' : ''
                        }`}
                      >
                        <Label className="text-sm">{ev.event_label}</Label>
                        <div className="flex justify-center">
                          <Switch
                            checked={cell?.channel_email ?? ev.defaults.email}
                            disabled={!canEdit}
                            onCheckedChange={(next) =>
                              handleToggle(ev.event_key, 'email', next)
                            }
                            aria-label={`${ev.event_label} email`}
                          />
                        </div>
                        <div className="flex justify-center">
                          <Switch
                            checked={cell?.channel_sms ?? ev.defaults.sms}
                            disabled={!canEdit}
                            onCheckedChange={(next) =>
                              handleToggle(ev.event_key, 'sms', next)
                            }
                            aria-label={`${ev.event_label} SMS`}
                          />
                        </div>
                        <div className="flex justify-center">
                          <Switch
                            checked={cell?.channel_push ?? ev.defaults.push}
                            disabled={!canEdit}
                            onCheckedChange={(next) =>
                              handleToggle(ev.event_key, 'push', next)
                            }
                            aria-label={`${ev.event_label} push`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </ContentLayout>
  );
}
