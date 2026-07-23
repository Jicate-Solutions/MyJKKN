'use client';

// Alert Rules — LIVE-WIRED 2026-06-11 (was an honest PreviewBanner page with
// sample rules; the promised hooks existed all along). Full CRUD against
// hostel_alert_rules via useHostelAlertRules / useCreate / useUpdate /
// useDelete. Super admins see all institutions' rules (hook handles scoping)
// and pick the institution when creating.
// NOTE: rule `conditions` stay an empty object for now — the evaluation
// engine that interprets them (and writes hostel_risk_alerts) has not
// shipped; rules created here are stored and ready for it.

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Bell, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useHostelAlertRules,
  useCreateHostelAlertRule,
  useUpdateHostelAlertRule,
  useDeleteHostelAlertRule,
} from '@/hooks/campus-living/use-hostel-alerts';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { HostelAlertRule, AlertType, AlertSeverity } from '@/types/campus-living';

const ALERT_TYPES: { value: AlertType; label: string }[] = [
  { value: 'dropout_risk', label: 'Dropout Risk' },
  { value: 'mental_health', label: 'Mental Health' },
  { value: 'fee_default', label: 'Fee Default' },
  { value: 'caterer_quality', label: 'Caterer Quality' },
  { value: 'attendance_drop', label: 'Attendance Drop' },
  { value: 'meal_skip', label: 'Meal Skip' },
];

const SEVERITIES: { value: AlertSeverity; label: string; cls: string }[] = [
  { value: 'info', label: 'Info', cls: 'bg-blue-100 text-blue-800 hover:bg-blue-100' },
  { value: 'warning', label: 'Warning', cls: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100' },
  { value: 'critical', label: 'Critical', cls: 'bg-red-100 text-red-800 hover:bg-red-100' },
];

const severityCls = (s: AlertSeverity) => SEVERITIES.find((x) => x.value === s)?.cls ?? '';
const typeLabel = (t: AlertType) => ALERT_TYPES.find((x) => x.value === t)?.label ?? t;

/** Super-admin institution options for the create dialog — institutions
 * table queried directly (the access hook is unreliable for pickers). */
function useInstitutionOptions(enabled: boolean) {
  return useQuery({
    queryKey: ['cl-alert-rules', 'institutions'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('institutions')
        .select('id, name')
        .like('name', 'JKKN%')
        .order('name');
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
}

interface RuleDraft {
  name: string;
  description: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  cooldown_hours: string;
  institution_id: string;
}

const EMPTY_DRAFT: RuleDraft = {
  name: '',
  description: '',
  alert_type: 'attendance_drop',
  severity: 'warning',
  cooldown_hours: '24',
  institution_id: '',
};

export default function AlertRulesPage() {
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const profileInstitutionId = (profile?.institution_id as string | undefined) ?? undefined;

  const { data: rules, isLoading } = useHostelAlertRules(profileInstitutionId);
  const ruleList: HostelAlertRule[] = useMemo(() => rules ?? [], [rules]);

  const { data: institutions } = useInstitutionOptions(isSuperAdmin);
  const createRule = useCreateHostelAlertRule();
  const updateRule = useUpdateHostelAlertRule();
  const deleteRule = useDeleteHostelAlertRule();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<RuleDraft>(EMPTY_DRAFT);
  const [deleteTarget, setDeleteTarget] = useState<HostelAlertRule | null>(null);

  const effectiveInstitution = (d: RuleDraft) =>
    profileInstitutionId ?? (d.institution_id || undefined);

  const canSave =
    draft.name.trim().length >= 3 &&
    !!effectiveInstitution(draft) &&
    !Number.isNaN(parseInt(draft.cooldown_hours, 10));

  const submit = () => {
    const institution_id = effectiveInstitution(draft);
    if (!institution_id || !profile?.id) return;
    createRule.mutate(
      {
        institution_id,
        created_by: profile.id as string,
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        alert_type: draft.alert_type,
        severity: draft.severity,
        conditions: {},
        cooldown_hours: parseInt(draft.cooldown_hours, 10),
        notify_roles: ['warden', 'chief_warden'],
        is_active: true,
      },
      {
        onSuccess: () => {
          setDialogOpen(false);
          setDraft(EMPTY_DRAFT);
        },
      },
    );
  };

  return (
    <ContentLayout title="Alert Rules">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Alert Rule Configuration</h1>
            <p className="text-muted-foreground">
              Configure alert thresholds and notification rules
            </p>
          </div>
          <Button
            onClick={() => {
              setDraft(EMPTY_DRAFT);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Rule
          </Button>
        </div>

        {/* Stat strip — live counts */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total Rules</p>
              <p className="text-2xl font-bold">{ruleList.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-2xl font-bold text-green-600">
                {ruleList.filter((r) => r.is_active).length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Critical Severity</p>
              <p className="text-2xl font-bold text-red-600">
                {ruleList.filter((r) => r.severity === 'critical').length}
              </p>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : ruleList.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
              <Bell className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">No alert rules yet</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Create your first rule to define when the hostel team should be alerted.
              </p>
              <Button
                size="sm"
                className="mt-2"
                onClick={() => {
                  setDraft(EMPTY_DRAFT);
                  setDialogOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Rule
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {ruleList.map((rule) => (
              <Card key={rule.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <Bell className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{rule.name}</p>
                        <Badge className={severityCls(rule.severity)}>
                          {rule.severity.charAt(0).toUpperCase() + rule.severity.slice(1)}
                        </Badge>
                        <Badge variant="outline">{typeLabel(rule.alert_type)}</Badge>
                      </div>
                      {rule.description && (
                        <p className="text-sm text-muted-foreground">{rule.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Cooldown {rule.cooldown_hours ?? 0}h · notifies{' '}
                        {rule.notify_roles.join(', ')}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Switch
                      checked={!!rule.is_active}
                      disabled={updateRule.isPending}
                      onCheckedChange={(checked) =>
                        updateRule.mutate({ id: rule.id, payload: { is_active: checked } })
                      }
                      aria-label={`Toggle ${rule.name}`}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Delete ${rule.name}`}
                      onClick={() => setDeleteTarget(rule)}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>New alert rule</DialogTitle>
              <DialogDescription>
                The rule is stored immediately; alert generation begins when the evaluation
                engine ships.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {isSuperAdmin && !profileInstitutionId && (
                <div className="space-y-1">
                  <Label>Institution</Label>
                  <Select
                    value={draft.institution_id}
                    onValueChange={(v) => setDraft((d) => ({ ...d, institution_id: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select institution" />
                    </SelectTrigger>
                    <SelectContent>
                      {(institutions ?? []).map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="rule-name">Name</Label>
                <Input
                  id="rule-name"
                  placeholder="e.g. Night attendance below 85%"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rule-desc">Description (optional)</Label>
                <Textarea
                  id="rule-desc"
                  rows={2}
                  placeholder="What should the team check when this fires?"
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select
                    value={draft.alert_type}
                    onValueChange={(v) => setDraft((d) => ({ ...d, alert_type: v as AlertType }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALERT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Severity</Label>
                  <Select
                    value={draft.severity}
                    onValueChange={(v) => setDraft((d) => ({ ...d, severity: v as AlertSeverity }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITIES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="rule-cooldown">Cooldown (hours between repeat alerts)</Label>
                <Input
                  id="rule-cooldown"
                  type="number"
                  min={0}
                  value={draft.cooldown_hours}
                  onChange={(e) => setDraft((d) => ({ ...d, cooldown_hours: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button disabled={!canSave || createRule.isPending} onClick={submit}>
                Create Rule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirm */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
              <AlertDialogDescription>
                “{deleteTarget?.name}” will be permanently removed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (deleteTarget) deleteRule.mutate(deleteTarget.id);
                  setDeleteTarget(null);
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ContentLayout>
  );
}
