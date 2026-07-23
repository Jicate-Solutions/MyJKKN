// app/(routes)/admission/social/meta-pixel/page.tsx
//
// Per-institution Meta Pixel + CAPI configuration page + recent events
// audit log. Server-rendered (no client islands required).
//
// Sections:
//   1. Current configuration — pixel_id, access_token_ref (env-var name),
//      kill switch state. Editable via small server actions below.
//   2. Recent CAPI events — last 50 rows from meta_capi_events for the
//      caller's institution (or all institutions for super_admin).
//
// Access: super_admin OR admin OR institution_admin. Anyone else gets a
// 403 page with a clear "contact super_admin" message (rule #27 — no
// silent redirect).

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const breadcrumbItems = [
  { label: 'Home', href: '/' },
  { label: 'Admission', href: '/admission' },
  { label: 'Social' },
  { label: 'Meta Pixel & CAPI' },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PolicyValues {
  pixelId: string;
  tokenRef: string;
  enabled: boolean;
  tokenEnvPresent: boolean;
}

interface CapiEventRow {
  id: string;
  institution_id: string | null;
  event_name: string;
  event_id: string | null;
  response_status: number | null;
  error: string | null;
  sent_at: string;
}

// ---------------------------------------------------------------------------
// Server actions (form-driven config updates)
// ---------------------------------------------------------------------------

async function upsertPolicy(args: {
  key: 'meta.capi.pixel_id' | 'meta.capi.access_token_ref' | 'meta.capi.is_enabled';
  institutionId: string | null;
  value: string | boolean;
  dataType: 'string' | 'boolean';
  description: string;
}) {
  'use server';
  const supabase = createServiceRoleClient();
  const scopeType = args.institutionId ? 'institution' : 'global';
  const jsonbValue =
    args.dataType === 'boolean' ? Boolean(args.value) : String(args.value);

  // Upsert respecting the unique (policy_key, scope_type, COALESCE(scope_id, sentinel)).
  const { error } = await supabase.from('platform_policies').upsert(
    {
      policy_key: args.key,
      scope_type: scopeType,
      scope_id: args.institutionId,
      value: jsonbValue,
      description: args.description,
      data_type: args.dataType,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'policy_key,scope_type,scope_id' }
  );

  if (error) {
    console.error('[meta-pixel-admin] policy upsert failed:', error);
  }
  revalidatePath('/admission/social/meta-pixel');
}

async function savePixelIdAction(formData: FormData) {
  'use server';
  const institutionId = (formData.get('institutionId') as string) || null;
  const pixelId = ((formData.get('pixelId') as string) || '').trim();
  await upsertPolicy({
    key: 'meta.capi.pixel_id',
    institutionId,
    value: pixelId,
    dataType: 'string',
    description:
      'Meta Pixel id (numeric string). Empty string = CAPI disabled for this scope. Set per-institution via /admission/social/meta-pixel.',
  });
}

async function saveTokenRefAction(formData: FormData) {
  'use server';
  const institutionId = (formData.get('institutionId') as string) || null;
  const tokenRef = ((formData.get('tokenRef') as string) || '').trim();
  await upsertPolicy({
    key: 'meta.capi.access_token_ref',
    institutionId,
    value: tokenRef,
    dataType: 'string',
    description:
      'NAME of the env var (NOT the token itself) holding the Meta CAPI access token. Token stays in Vercel env, never in DB.',
  });
}

async function toggleEnabledAction(formData: FormData) {
  'use server';
  const institutionId = (formData.get('institutionId') as string) || null;
  const next = formData.get('next') === 'true';
  await upsertPolicy({
    key: 'meta.capi.is_enabled',
    institutionId,
    value: next,
    dataType: 'boolean',
    description:
      'Master kill switch for Meta CAPI. When false, server-side CAPI calls short-circuit and only the local audit row is written.',
  });
}

// ---------------------------------------------------------------------------
// Data fetch
// ---------------------------------------------------------------------------

async function loadPolicies(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  institutionId: string | null
): Promise<PolicyValues> {
  const [pixelRes, tokenRefRes, enabledRes] = await Promise.all([
    supabase.rpc('fn_get_policy', {
      p_key: 'meta.capi.pixel_id',
      p_scope_id: institutionId,
    }),
    supabase.rpc('fn_get_policy', {
      p_key: 'meta.capi.access_token_ref',
      p_scope_id: institutionId,
    }),
    supabase.rpc('fn_get_policy', {
      p_key: 'meta.capi.is_enabled',
      p_scope_id: institutionId,
    }),
  ]);

  const pixelId =
    typeof pixelRes.data === 'string' ? pixelRes.data.trim() : '';
  const tokenRef =
    typeof tokenRefRes.data === 'string' ? tokenRefRes.data.trim() : '';
  const enabled = enabledRes.data === true;
  const tokenEnvPresent =
    tokenRef.length > 0 &&
    typeof process.env[tokenRef] === 'string' &&
    (process.env[tokenRef] as string).trim().length > 0;

  return { pixelId, tokenRef, enabled, tokenEnvPresent };
}

async function loadRecentEvents(
  institutionId: string | null,
  isSuperAdmin: boolean
): Promise<CapiEventRow[]> {
  const supabase = createServiceRoleClient();
  let q = supabase
    .from('meta_capi_events')
    .select('id, institution_id, event_name, event_id, response_status, error, sent_at')
    .order('sent_at', { ascending: false })
    .limit(50);

  if (!isSuperAdmin && institutionId) {
    q = q.eq('institution_id', institutionId);
  }

  const { data, error } = await q;
  if (error) {
    console.error('[meta-pixel-admin] events fetch failed:', error);
    return [];
  }
  return (data ?? []) as CapiEventRow[];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function MetaPixelAdminPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Anonymous → punt to login; the redirect chain after login lands here again.
    redirect('/auth/login?next=/admission/social/meta-pixel');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, institution_id')
    .eq('id', user.id)
    .maybeSingle();

  const role = (profile?.role as string | null) ?? null;
  const isSuperAdmin = role === 'super_admin';
  const isAdminish =
    isSuperAdmin || role === 'admin' || role === 'institution_admin';

  // 2026-06-11 granular-permission retrofit: roles granted
  // social.meta_pixel.view via Role Management get in alongside the
  // legacy admin role allowlist.
  let canViewPixel = isAdminish;
  if (!canViewPixel) {
    const { data: hasPerm } = await supabase.rpc('user_has_permission', {
      permission_name: 'social.meta_pixel.view',
    });
    canViewPixel = !!hasPerm;
  }

  if (!canViewPixel) {
    // Rule #27 — explicit 403 page, NOT a silent redirect.
    return (
      <ContentLayout title="Meta Pixel & CAPI">
        <PageBreadcrumb items={breadcrumbItems} />
        <div className="mt-6">
          <Alert variant="destructive">
            <AlertTitle>You don&apos;t have access</AlertTitle>
            <AlertDescription>
              The Meta Pixel &amp; CAPI configuration page requires the{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                social.meta_pixel.view
              </code>{' '}
              permission (or an admin role). Your role is{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                {role ?? 'none'}
              </code>
              . Contact a super_admin to request access.
            </AlertDescription>
          </Alert>
        </div>
      </ContentLayout>
    );
  }

  const institutionId =
    (profile?.institution_id as string | null) ?? null;
  // Super-admin without an institution_id sees + edits the global default
  // row; everyone else edits their institution-scoped row.
  const scopeId = isSuperAdmin ? institutionId : institutionId;

  const policies = await loadPolicies(supabase, scopeId);
  const events = await loadRecentEvents(scopeId, isSuperAdmin);

  const configComplete =
    policies.pixelId.length > 0 &&
    policies.tokenRef.length > 0 &&
    policies.tokenEnvPresent;

  return (
    <ContentLayout title="Meta Pixel & CAPI">
      <PageBreadcrumb items={breadcrumbItems} />

      <div className="mt-6 space-y-6">
        {/* ---- Scope summary ---- */}
        <Card>
          <CardHeader>
            <CardTitle>Configuration scope</CardTitle>
            <CardDescription>
              Policies on this page are scoped to{' '}
              {scopeId ? (
                <>
                  institution{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">
                    {scopeId}
                  </code>
                </>
              ) : (
                'the global default (no institution selected)'
              )}
              . Per-institution rows override the global default.
            </CardDescription>
          </CardHeader>
        </Card>

        {/* ---- Kill switch + state ---- */}
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
            <CardDescription>
              Master enable / disable for server-side CAPI posting.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={policies.enabled ? 'default' : 'secondary'}>
                {policies.enabled ? 'ENABLED' : 'DISABLED'}
              </Badge>
              <Badge
                variant={
                  policies.pixelId.length > 0 ? 'default' : 'destructive'
                }
              >
                Pixel ID: {policies.pixelId.length > 0 ? 'set' : 'missing'}
              </Badge>
              <Badge
                variant={policies.tokenRef.length > 0 ? 'default' : 'destructive'}
              >
                Token ref: {policies.tokenRef.length > 0 ? 'set' : 'missing'}
              </Badge>
              <Badge
                variant={policies.tokenEnvPresent ? 'default' : 'destructive'}
              >
                Token env: {policies.tokenEnvPresent ? 'present' : 'unset'}
              </Badge>
            </div>

            {!configComplete && (
              <Alert>
                <AlertTitle>Configuration incomplete</AlertTitle>
                <AlertDescription>
                  CAPI will short-circuit until all three are set: Pixel ID,
                  Access token env-var NAME, and the matching env-var present
                  on the deployment.
                </AlertDescription>
              </Alert>
            )}

            <form action={toggleEnabledAction} className="flex items-center gap-3">
              <input type="hidden" name="institutionId" value={scopeId ?? ''} />
              <input
                type="hidden"
                name="next"
                value={(!policies.enabled).toString()}
              />
              <Button type="submit" variant={policies.enabled ? 'destructive' : 'default'}>
                {policies.enabled ? 'Disable CAPI' : 'Enable CAPI'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* ---- Pixel ID ---- */}
        <Card>
          <CardHeader>
            <CardTitle>Pixel ID</CardTitle>
            <CardDescription>
              Numeric Meta Pixel id from Events Manager. Find it at{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                business.facebook.com → Events Manager → Data Sources
              </code>
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={savePixelIdAction} className="space-y-3">
              <input type="hidden" name="institutionId" value={scopeId ?? ''} />
              <Label htmlFor="pixelId">Pixel ID</Label>
              <Input
                id="pixelId"
                name="pixelId"
                defaultValue={policies.pixelId}
                placeholder="e.g. 1234567890123456"
                inputMode="numeric"
              />
              <Button type="submit">Save Pixel ID</Button>
            </form>
          </CardContent>
        </Card>

        {/* ---- Access token ref ---- */}
        <Card>
          <CardHeader>
            <CardTitle>Access token (env-var reference)</CardTitle>
            <CardDescription>
              The NAME of the Vercel env var that holds the long-lived Meta
              CAPI access token. The token itself NEVER lives in the database
              — only the env-var name does. Required Meta scope:{' '}
              <code>ads_management</code> (or <code>ads_read</code> if the
              Pixel is in our own Business Manager).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={saveTokenRefAction} className="space-y-3">
              <input type="hidden" name="institutionId" value={scopeId ?? ''} />
              <Label htmlFor="tokenRef">Env-var name</Label>
              <Input
                id="tokenRef"
                name="tokenRef"
                defaultValue={policies.tokenRef}
                placeholder="e.g. META_CAPI_ACCESS_TOKEN_JKKN_DENTAL"
              />
              <Button type="submit">Save env-var name</Button>
              {policies.tokenRef.length > 0 && !policies.tokenEnvPresent && (
                <Alert variant="destructive">
                  <AlertTitle>Env var not found</AlertTitle>
                  <AlertDescription>
                    <code>{policies.tokenRef}</code> is not set on this
                    deployment. Add it to Vercel → Project Settings →
                    Environment Variables for Production, then redeploy.
                  </AlertDescription>
                </Alert>
              )}
            </form>
          </CardContent>
        </Card>

        {/* ---- Recent CAPI events ---- */}
        <Card>
          <CardHeader>
            <CardTitle>Recent CAPI events</CardTitle>
            <CardDescription>
              Last 50 events posted (or short-circuited) for{' '}
              {isSuperAdmin
                ? 'all institutions'
                : 'your institution scope'}
              . PII is never stored — only SHA-256 hashes leave the server.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No CAPI events yet. Once a lead/purchase fires a hook (or the
                track API is called), rows will appear here.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Event ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {new Date(e.sent_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-medium">
                          {e.event_name}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {e.event_id ?? '—'}
                        </TableCell>
                        <TableCell>
                          {e.response_status === null ? (
                            <Badge variant="secondary">skipped</Badge>
                          ) : e.response_status >= 200 &&
                            e.response_status < 300 ? (
                            <Badge>{e.response_status}</Badge>
                          ) : (
                            <Badge variant="destructive">
                              {e.response_status}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="max-w-md truncate text-xs text-muted-foreground">
                          {e.error ?? ''}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ---- Help ---- */}
        <Card>
          <CardHeader>
            <CardTitle>Wiring checklist</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              1. Create the Pixel in Meta Events Manager. Note the numeric
              ID.
            </p>
            <p>
              2. Generate a long-lived access token in Meta Business
              Settings → System Users. Grant <code>ads_management</code> (or{' '}
              <code>ads_read</code>) on the Pixel&apos;s ad account.
            </p>
            <p>
              3. Add the token to Vercel as e.g.{' '}
              <code>META_CAPI_ACCESS_TOKEN_JKKN_DENTAL</code> (production).
            </p>
            <p>
              4. On this page, set the Pixel ID and env-var name. Then flip
              the kill switch on.
            </p>
            <p>
              5. Wire <code>fireLeadCreatedCapi</code> /{' '}
              <code>fireLeadConvertedCapi</code> into the relevant
              admission flows — see{' '}
              <code>lib/services/admission/lead-capi-hooks.USAGE.md</code>.
            </p>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
