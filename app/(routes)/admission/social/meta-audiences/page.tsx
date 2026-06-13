'use client';

// =====================================================================
// /admission/social/meta-audiences — Agent η (relocated from /admin/integrations/meta-audiences 2026-06-11, wave-2)
// =====================================================================
// CRUD + criteria builder + sync status + per-rule history log for Meta
// Custom Audiences. Single client component that talks to the existing
// `/api/admission/remarketing` route handler (no new API surface).
//
// Permission: admins write, viewers read. Super-admin is implied admin.
// =====================================================================

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, RefreshCw, Trash2, History, AlertCircle } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';

import type {
  AdPlatform,
  AudienceRule,
  AudienceSyncStatus,
  SyncHistoryEntry,
} from '@/lib/services/marketing/remarketing-service';

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

export default function MetaAudiencesPage() {
  return (
    <PermissionGuard
      module="social.meta_audiences"
      action="view"
      fallback={
        <ContentLayout title="Meta Custom Audiences">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            You do not have permission to view this page. Ask an administrator
            to grant the Social Media permissions to your role.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Meta Custom Audiences">
        <PageBreadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Admission', href: '/admission' },
            { label: 'Social' },
            { label: 'Meta Audiences' },
          ]}
        />
        <Content />
      </ContentLayout>
    </PermissionGuard>
  );
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

function Content() {
  const auth = useAuth();
  const institutionId =
    (auth?.profile as { institution_id?: string | null } | null)?.institution_id ??
    null;

  const [rules, setRules] = useState<AudienceRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [historyForRule, setHistoryForRule] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    if (!institutionId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admission/remarketing?institution_id=${encodeURIComponent(institutionId)}`,
        { cache: 'no-store' }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load rules');
      setRules(json.rules ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  }, [institutionId]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const handleSync = useCallback(
    async (ruleId: string) => {
      setError(null);
      const res = await fetch('/api/admission/remarketing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync', rule_id: ruleId }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        setError(json.error || 'Sync failed');
        return;
      }
      await fetchRules();
    },
    [fetchRules]
  );

  const handleDelete = useCallback(
    async (ruleId: string) => {
      if (!window.confirm('Delete this audience rule? This cannot be undone.')) return;
      const res = await fetch(
        `/api/admission/remarketing?id=${encodeURIComponent(ruleId)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || 'Delete failed');
        return;
      }
      await fetchRules();
    },
    [fetchRules]
  );

  return (
    <div className="mt-6 space-y-6">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>How Meta Custom Audiences work</AlertTitle>
        <AlertDescription>
          Each rule below describes one targeted audience that gets pushed
          to Meta Ads Manager. User PII (email, phone, name) is SHA-256
          hashed before leaving MyJKKN — raw values never touch the
          network. Sync runs daily, or on demand via the Sync button.
          Master kill-switch is{' '}
          <code className="mx-1">meta.audiences.is_enabled</code> (policy);
          flip it on after your Meta app has ad scopes approved.
        </AlertDescription>
      </Alert>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Audience rules</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => fetchRules()} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Refresh</span>
          </Button>
          <Button onClick={() => setShowCreate(true)} disabled={!institutionId}>
            <Plus className="h-4 w-4" />
            <span className="ml-2">New rule</span>
          </Button>
        </div>
      </div>

      {!institutionId && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No institution scope</AlertTitle>
          <AlertDescription>
            This page needs an institution_id from your profile. Switch to an
            institution-scoped session to manage audience rules.
          </AlertDescription>
        </Alert>
      )}

      {showCreate && institutionId && (
        <CreateRuleCard
          institutionId={institutionId}
          onCancel={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            fetchRules();
          }}
        />
      )}

      <div className="space-y-3">
        {rules.map((rule) => (
          <RuleRow
            key={rule.id}
            rule={rule}
            onSync={() => handleSync(rule.id)}
            onDelete={() => handleDelete(rule.id)}
            onShowHistory={() => setHistoryForRule(rule.id)}
          />
        ))}
        {!loading && rules.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No audience rules yet. Click <strong>New rule</strong> to add one.
            </CardContent>
          </Card>
        )}
      </div>

      {historyForRule && (
        <HistoryDrawer
          ruleId={historyForRule}
          onClose={() => setHistoryForRule(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: AudienceSyncStatus }) {
  const tone: Record<AudienceSyncStatus, string> = {
    pending: 'bg-gray-100 text-gray-700',
    syncing: 'bg-blue-100 text-blue-700',
    synced: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
  };
  return <Badge className={tone[status]}>{status}</Badge>;
}

function RuleRow({
  rule,
  onSync,
  onDelete,
  onShowHistory,
}: {
  rule: AudienceRule;
  onSync: () => void;
  onDelete: () => void;
  onShowHistory: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">{rule.name}</CardTitle>
            <CardDescription>
              {rule.platform} · audience size {rule.audience_size.toLocaleString()}
            </CardDescription>
          </div>
          <StatusBadge status={rule.sync_status} />
        </div>
      </CardHeader>
      <CardContent>
        <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">
          {JSON.stringify(rule.criteria, null, 2)}
        </pre>
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="default" onClick={onSync}>
            <RefreshCw className="h-3 w-3" />
            <span className="ml-2">Sync now</span>
          </Button>
          <Button size="sm" variant="outline" onClick={onShowHistory}>
            <History className="h-3 w-3" />
            <span className="ml-2">History</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
            <span className="ml-2">Delete</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateRuleCard({
  institutionId,
  onCancel,
  onCreated,
}: {
  institutionId: string;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState<AdPlatform>('facebook');
  const [adAccountId, setAdAccountId] = useState('');
  const [source, setSource] = useState<'admission_leads'>('admission_leads');
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const criteria = {
        source,
        filters: status ? { status } : {},
      };
      const res = await fetch('/api/admission/remarketing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institution_id: institutionId,
          name,
          platform,
          ad_account_id: adAccountId,
          criteria,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Create failed');
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New audience rule</CardTitle>
        <CardDescription>
          Describes who belongs in the audience. Saved to{' '}
          <code>meta_audience_rules</code>; pushed to Meta on next sync.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Audience name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Hot Leads — Q3 BDS"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="platform">Platform</Label>
            <Select
              value={platform}
              onValueChange={(v) => setPlatform(v as AdPlatform)}
            >
              <SelectTrigger id="platform">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ad_account">Ad account id</Label>
            <Input
              id="ad_account"
              value={adAccountId}
              onChange={(e) => setAdAccountId(e.target.value)}
              placeholder="act_1234567890"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="source">Source</Label>
            <Select
              value={source}
              onValueChange={(v) => setSource(v as 'admission_leads')}
            >
              <SelectTrigger id="source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admission_leads">Admission leads</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="status_filter">
              Lifecycle status filter (optional)
            </Label>
            <Input
              id="status_filter"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              placeholder="e.g. hot, contacted, admitted (leave blank for all)"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={submit} disabled={busy || !name || !adAccountId}>
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            <span className={busy ? 'ml-2' : ''}>Create rule</span>
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function HistoryDrawer({
  ruleId,
  onClose,
}: {
  ruleId: string;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<SyncHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/admission/remarketing?view=sync_history&rule_id=${encodeURIComponent(ruleId)}`,
          { cache: 'no-store' }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load history');
        if (!cancelled) setHistory(json.history ?? []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load history');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ruleId]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Sync history</CardTitle>
            <CardDescription>Last 20 runs (most recent first)</CardDescription>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading...
          </div>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!loading && !error && history.length === 0 && (
          <p className="text-sm text-muted-foreground">No sync runs yet.</p>
        )}
        <ul className="space-y-2">
          {history.map((h) => (
            <li
              key={h.id}
              className="rounded border p-2 text-sm"
            >
              <div className="flex items-center justify-between">
                <StatusBadge status={h.status} />
                <span className="text-xs text-muted-foreground">
                  {new Date(h.synced_at).toLocaleString()}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Received: {h.audience_size}
                {h.error_message ? ` · Error: ${h.error_message}` : ''}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// Textarea kept imported for future criteria-builder expansion. Silence
// the lint warning by referencing it once.
void Textarea;
