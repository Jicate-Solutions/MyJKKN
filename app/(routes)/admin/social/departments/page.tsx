'use client';

/**
 * Admin / Social Media / Department Accounts — credential + status directory.
 *
 * One place for every department-level Instagram handle across the JKKN
 * colleges (imported from the "Department-Wise Logins" sheet into
 * social_dept_accounts). Shows handle, login email, masked password
 * (reveal/copy), ContentStudio + Business Suite connection status, and
 * whether the handle is wired into the Graph-API monitoring pipeline
 * (ig_account_id → "Monitored").
 *
 * RLS on social_dept_accounts is admin-only (credential vault), matching
 * the SuperAdminOnly gate below — non-admins get zero rows even if they
 * reach the query.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Eye, EyeOff, Instagram, Check, Link2, Unlink } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { PageBreadcrumb } from '@/components/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface DeptAccountRow {
  id: string;
  platform: string;
  college_label: string;
  department_name_raw: string;
  username: string;
  login_email: string | null;
  login_password: string | null;
  content_studio_connected: boolean | null;
  business_suite_connected: boolean | null;
  ig_account_id: string | null;
  notes: string | null;
  institutions: { name: string } | null;
  departments: { department_name: string } | null;
}

/** Instagram Business Login connection status (token column is not readable
 *  client-side — service_role only via column-level grant). */
interface IgConnectionRow {
  id: string;
  dept_account_id: string | null;
  username: string;
  status: 'active' | 'expired' | 'revoked' | 'error';
  expires_at: string;
  connected_at: string;
  last_polled_at: string | null;
}

/** Pick the connection to display when several map to one dept:
 *  active beats non-active; ties go to the most recent connection. */
function preferConnection(
  a: IgConnectionRow | undefined,
  b: IgConnectionRow
): IgConnectionRow {
  if (!a) return b;
  const aActive = a.status === 'active';
  const bActive = b.status === 'active';
  if (aActive !== bActive) return bActive ? b : a;
  return b.connected_at > a.connected_at ? b : a;
}

const breadcrumbItems = [
  { label: 'Home', href: '/' },
  { label: 'Administration' },
  { label: 'Social Media', href: '/admin/social' },
  { label: 'Department Accounts' },
];

/** Sheet order for the college groups. */
const COLLEGE_ORDER = [
  'Dental College',
  'Allied Health Science',
  'Pharmacy',
  'Nursing',
  'Engineering',
  'Arts',
];

function connChip(value: boolean | null) {
  if (value === true) return <Badge variant="default">Connected</Badge>;
  if (value === false) return <Badge variant="outline">Not connected</Badge>;
  return <span className="text-muted-foreground">—</span>;
}

function PasswordCell({ password }: { password: string | null }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!password) return <span className="text-muted-foreground">—</span>;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable (non-secure context) — reveal instead
      setVisible(true);
    }
  };

  return (
    <div className="flex items-center gap-1 font-mono text-xs">
      <span className="min-w-[7rem]">{visible ? password : '••••••••••'}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={copy}
        aria-label="Copy password"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

/**
 * Per-row Instagram Business Login control. "Connect now" sends THIS browser
 * to the Instagram authorize dialog; "Copy connect link" copies a 24h
 * shareable authorize URL to send to the staffer who is logged into the
 * department account on their own device.
 */
function IgLoginCell({
  dept,
  connection,
  onChanged,
  onActionError,
}: {
  dept: DeptAccountRow;
  connection: IgConnectionRow | undefined;
  onChanged: () => void;
  onActionError: (msg: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const copyLink = async () => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/social/instagram/connect?dept_id=${dept.id}&mode=link`
      );
      const json = await res.json();
      if (!res.ok) {
        onActionError(json.error ?? `Connect link failed (HTTP ${res.status})`);
        return;
      }
      await navigator.clipboard.writeText(json.authorize_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      onActionError(e instanceof Error ? e.message : 'Copy failed');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!connection) return;
    setBusy(true);
    try {
      const res = await fetch('/api/social/instagram/connect', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: connection.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        onActionError(json.error ?? `Disconnect failed (HTTP ${res.status})`);
        return;
      }
      onChanged();
    } catch (e) {
      onActionError(e instanceof Error ? e.message : 'Disconnect failed');
    } finally {
      setBusy(false);
    }
  };

  if (connection?.status === 'active') {
    const daysLeft = Math.max(
      0,
      Math.round(
        (new Date(connection.expires_at).getTime() - Date.now()) / 86400000
      )
    );
    return (
      <div className="flex items-center gap-1">
        <Badge variant="default" title={`Token expires in ~${daysLeft} days`}>
          Connected
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={disconnect}
          disabled={busy}
          aria-label={`Disconnect Instagram Login for @${dept.username}`}
          title="Disconnect"
        >
          <Unlink className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  const needsReconnect =
    connection?.status === 'expired' || connection?.status === 'error';

  return (
    <div className="flex items-center gap-1">
      {needsReconnect && (
        <Badge variant="destructive">
          {connection?.status === 'expired' ? 'Expired' : 'Error'}
        </Badge>
      )}
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs"
        disabled={busy}
        onClick={() => {
          window.location.href = `/api/social/instagram/connect?dept_id=${dept.id}`;
        }}
      >
        <Link2 className="mr-1 h-3.5 w-3.5" />
        {needsReconnect ? 'Reconnect' : 'Connect'}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={copyLink}
        disabled={busy}
        aria-label={`Copy connect link for @${dept.username}`}
        title="Copy connect link (valid 24h — send it to the account owner)"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-600" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}

export default function SocialDepartmentAccountsPage() {
  const [rows, setRows] = useState<DeptAccountRow[]>([]);
  const [connections, setConnections] = useState<IgConnectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    // social_dept_accounts + ig_account_connections are not in the generated
    // Database types (types/supabase.ts) — with the typed client, inference
    // on these two selects blows TS's instantiation depth (TS2589). Untyped
    // client here; results are cast to the explicit row interfaces above.
    const supabase = createClientSupabaseClient() as unknown as SupabaseClient;
    supabase
      .from('social_dept_accounts')
      .select(
        'id, platform, college_label, department_name_raw, username, login_email, login_password, content_studio_connected, business_suite_connected, ig_account_id, notes, institutions(name), departments(department_name)'
      )
      .order('college_label')
      .order('department_name_raw')
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setRows((data as unknown as DeptAccountRow[]) ?? []);
        setLoading(false);
      });
    // Connection status (RLS admin-only; access_token column is not granted
    // to authenticated, so it is deliberately absent from this select).
    supabase
      .from('ig_account_connections')
      .select(
        'id, dept_account_id, username, status, expires_at, connected_at, last_polled_at'
      )
      .then(({ data }) => {
        setConnections((data as unknown as IgConnectionRow[]) ?? []);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const connectionByDept = useMemo(() => {
    const map = new Map<string, IgConnectionRow>();
    for (const c of connections) {
      if (c.dept_account_id) {
        map.set(c.dept_account_id, preferConnection(map.get(c.dept_account_id), c));
      }
    }
    // fallback: match by handle for connections stored without a dept binding
    const byUsername = new Map<string, IgConnectionRow>();
    for (const c of connections) {
      const key = c.username.toLowerCase();
      byUsername.set(key, preferConnection(byUsername.get(key), c));
    }
    for (const r of rows) {
      if (!map.has(r.id)) {
        const c = byUsername.get(r.username.toLowerCase());
        if (c) map.set(r.id, c);
      }
    }
    return map;
  }, [connections, rows]);

  const grouped = useMemo(() => {
    const map = new Map<string, DeptAccountRow[]>();
    for (const r of rows) {
      const list = map.get(r.college_label) ?? [];
      list.push(r);
      map.set(r.college_label, list);
    }
    const known = COLLEGE_ORDER.filter((c) => map.has(c));
    const extra = [...map.keys()].filter((c) => !COLLEGE_ORDER.includes(c)).sort();
    return [...known, ...extra].map((c) => ({ college: c, accounts: map.get(c)! }));
  }, [rows]);

  const totals = useMemo(
    () => ({
      total: rows.length,
      businessSuite: rows.filter((r) => r.business_suite_connected === true).length,
      contentStudio: rows.filter((r) => r.content_studio_connected === true).length,
      monitored: rows.filter((r) => r.ig_account_id !== null).length,
      igLogin: connections.filter((c) => c.status === 'active').length,
    }),
    [rows, connections]
  );

  return (
    <SuperAdminOnly>
      <ContentLayout title="Department Social Accounts">
        <PageBreadcrumb items={breadcrumbItems} />

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Department handles</CardDescription>
              <CardTitle className="text-3xl">{loading ? '…' : totals.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Business Suite connected</CardDescription>
              <CardTitle className="text-3xl">{loading ? '…' : totals.businessSuite}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>ContentStudio connected</CardDescription>
              <CardTitle className="text-3xl">{loading ? '…' : totals.contentStudio}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>API-monitored</CardDescription>
              <CardTitle className="text-3xl">{loading ? '…' : totals.monitored}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>IG Login connected</CardDescription>
              <CardTitle className="text-3xl">{loading ? '…' : totals.igLogin}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {actionError && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>Failed to load department accounts: {error}</AlertDescription>
          </Alert>
        )}

        {loading && (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <Alert className="mt-4">
            <AlertDescription>
              No department accounts in the registry yet.
            </AlertDescription>
          </Alert>
        )}

        {grouped.map(({ college, accounts }) => (
          <Card key={college} className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Instagram className="h-5 w-5" />
                {college}
              </CardTitle>
              <CardDescription>
                {accounts[0]?.institutions?.name ?? college} · {accounts.length} handle
                {accounts.length === 1 ? '' : 's'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Department</TableHead>
                    <TableHead>Handle</TableHead>
                    <TableHead>Login email</TableHead>
                    <TableHead>Password</TableHead>
                    <TableHead>Content Studio</TableHead>
                    <TableHead>Business Suite</TableHead>
                    <TableHead>Monitoring</TableHead>
                    <TableHead>IG Login</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.departments?.department_name ?? r.department_name_raw}
                      </TableCell>
                      <TableCell>
                        <a
                          href={`https://www.instagram.com/${r.username}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          @{r.username}
                        </a>
                      </TableCell>
                      <TableCell className="text-sm">{r.login_email ?? '—'}</TableCell>
                      <TableCell>
                        <PasswordCell password={r.login_password} />
                      </TableCell>
                      <TableCell>{connChip(r.content_studio_connected)}</TableCell>
                      <TableCell>{connChip(r.business_suite_connected)}</TableCell>
                      <TableCell>
                        {r.ig_account_id ? (
                          <Badge variant="default">Monitored</Badge>
                        ) : (
                          <Badge variant="secondary">Not in pipeline</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <IgLoginCell
                          dept={r}
                          connection={connectionByDept.get(r.id)}
                          onChanged={load}
                          onActionError={setActionError}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </ContentLayout>
    </SuperAdminOnly>
  );
}
