'use client';

/**
 * Tab 7 — Test Sandbox  {/* TAB-7:SANDBOX */}
 *
 * Resolver tester: pick role + page + mock state JSON → POST to resolve API
 * (as GET with override params) → render resolution trace + live AttentionBar preview.
 *
 * Request shape: GET /api/attention-bar/resolve?page=X&role=Y
 * Override params are supported for super_admin (see resolve/route.ts).
 *
 * Resolution trace: vertical timeline, one row per layer (0 → 2 → 3 → 1 → 4).
 * Each row shows: layer number, verdict badge, reason text.
 * Color cues: matched=emerald, no-match=slate, skipped=muted, error=red.
 *
 * Preview: renders the resolved action in a visual facsimile of the actual
 * AttentionBar component (same Tailwind classes, same icon map, same tone styles).
 * The real <AttentionBar/> can't be used directly here because it reads
 * usePathname() and calls the hook internally — instead we render the inner
 * layout inline so the visual fidelity is identical.
 *
 * Spec: specs/attention-bar-5-layer-system.md §6 Tab 7
 * Permission: attention_bar.test_sandbox.use
 *
 * Q2 twin-check: no existing file matches this shape. Bespoke justified.
 */

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { ResolvedAction, TraceEntry, Layer, Tone } from '@/lib/attention-bar/types';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BarChart,
  BarChart3,
  Bell,
  BookOpen,
  Calendar,
  CalendarCheck,
  CalendarRange,
  CheckCircle2,
  CheckSquare,
  ClipboardList,
  Clock,
  FileCheck2,
  FilePlus2,
  GraduationCap,
  Home,
  Inbox,
  IndianRupee,
  LayoutDashboard,
  Megaphone,
  PlayCircle,
  Receipt,
  ReceiptIndianRupee,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

// ─── Icon resolver (must match attention-bar.tsx exactly) ─────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  Activity, AlertCircle, AlertTriangle, BarChart, BarChart3, Bell, BookOpen,
  Calendar, CalendarCheck, CalendarRange, CheckCircle2, CheckSquare, ClipboardList,
  Clock, FileCheck2, FilePlus2, GraduationCap, Home, Inbox, IndianRupee,
  LayoutDashboard, Megaphone, PlayCircle, Receipt, ReceiptIndianRupee, Search, Send,
  Settings2, ShieldAlert, TrendingUp, Trophy, UserCheck, UserPlus, Users, UsersRound,
};

function resolveIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? Sparkles;
}

// ─── Tone styles (mirror attention-bar.tsx TONE_STYLES exactly) ───────────────

interface ToneStyle {
  bg: string;
  shadow: string;
  iconBg: string;
  ctaBg: string;
  ring: string;
  shimmer: boolean;
  pulse: boolean;
}

const TONE_STYLES: Record<Tone, ToneStyle> = {
  urgent: {
    bg: 'bg-gradient-to-br from-red-500 via-rose-500 to-red-700',
    shadow: 'shadow-[0_12px_32px_-6px_rgba(239,68,68,0.55),0_3px_10px_-2px_rgba(0,0,0,0.18),inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-1px_0_rgba(0,0,0,0.12)]',
    iconBg: 'bg-white/25 text-white backdrop-blur-sm',
    ctaBg: 'bg-white text-red-700 hover:bg-white/95',
    ring: 'ring-white/30',
    shimmer: true,
    pulse: true,
  },
  amber: {
    bg: 'bg-gradient-to-br from-amber-400 via-orange-500 to-amber-700',
    shadow: 'shadow-[0_10px_28px_-6px_rgba(245,158,11,0.45),0_2px_8px_-2px_rgba(0,0,0,0.15),inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-1px_0_rgba(0,0,0,0.1)]',
    iconBg: 'bg-white/25 text-white backdrop-blur-sm',
    ctaBg: 'bg-white text-amber-800 hover:bg-white/95',
    ring: 'ring-white/30',
    shimmer: false,
    pulse: false,
  },
  green: {
    bg: 'bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-700',
    shadow: 'shadow-[0_10px_28px_-6px_rgba(16,185,129,0.45),0_2px_8px_-2px_rgba(0,0,0,0.15),inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-1px_0_rgba(0,0,0,0.1)]',
    iconBg: 'bg-white/25 text-white backdrop-blur-sm',
    ctaBg: 'bg-white text-emerald-800 hover:bg-white/95',
    ring: 'ring-white/30',
    shimmer: false,
    pulse: false,
  },
  blue: {
    bg: 'bg-gradient-to-br from-sky-500 via-blue-500 to-indigo-600',
    shadow: 'shadow-[0_10px_28px_-6px_rgba(59,130,246,0.45),0_2px_8px_-2px_rgba(0,0,0,0.15),inset_0_2px_0_rgba(255,255,255,0.45),inset_0_-1px_0_rgba(0,0,0,0.1)]',
    iconBg: 'bg-white/25 text-white backdrop-blur-sm',
    ctaBg: 'bg-white text-blue-800 hover:bg-white/95',
    ring: 'ring-white/30',
    shimmer: false,
    pulse: false,
  },
  neutral: {
    bg: 'bg-gradient-to-br from-slate-600 via-slate-700 to-slate-800',
    shadow: 'shadow-[0_10px_28px_-6px_rgba(15,23,42,0.45),0_2px_8px_-2px_rgba(0,0,0,0.18),inset_0_2px_0_rgba(255,255,255,0.35),inset_0_-1px_0_rgba(0,0,0,0.12)]',
    iconBg: 'bg-white/15 text-white backdrop-blur-sm',
    ctaBg: 'bg-white text-slate-900 hover:bg-white/95',
    ring: 'ring-white/20',
    shimmer: false,
    pulse: false,
  },
};

// ─── Trace layer metadata ──────────────────────────────────────────────────────

const LAYER_META: Record<Layer, { label: string; short: string; colorClass: string }> = {
  0: { label: 'Layer 0 — Urgent Notifications', short: 'L0', colorClass: 'text-red-600 dark:text-red-400' },
  2: { label: 'Layer 2 — State-Aware Rules',    short: 'L2', colorClass: 'text-amber-600 dark:text-amber-400' },
  3: { label: 'Layer 3 — Behavioral Learning',  short: 'L3', colorClass: 'text-teal-600 dark:text-teal-400' },
  1: { label: 'Layer 1 — Static Defaults',      short: 'L1', colorClass: 'text-blue-600 dark:text-blue-400' },
  4: { label: 'Layer 4 — AI Fallback',          short: 'L4', colorClass: 'text-purple-600 dark:text-purple-400' },
};

const VERDICT_STYLE: Record<TraceEntry['result'], { badge: string; icon: React.ReactNode }> = {
  matched: {
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    icon: <CheckCircle2 className='h-3.5 w-3.5 text-emerald-500' />,
  },
  'no-match': {
    badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    icon: <AlertCircle className='h-3.5 w-3.5 text-slate-400' />,
  },
  skipped: {
    badge: 'bg-muted text-muted-foreground border-border',
    icon: <Clock className='h-3.5 w-3.5 text-muted-foreground' />,
  },
  error: {
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800',
    icon: <AlertTriangle className='h-3.5 w-3.5 text-red-500' />,
  },
};

// Layer priority display order matches resolver.ts PRIORITY_ORDER
const TRACE_ORDER: Layer[] = [0, 2, 3, 1, 4];

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLES = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin',       label: 'Admin' },
  { value: 'counselor',   label: 'Counselor' },
  { value: 'faculty',     label: 'Faculty' },
  { value: 'hod',         label: 'HoD' },
] as const;

const PRESET_PAGES = [
  '/dashboard',
  '/admission/leads',
  '/admission/counselors',
  '/academic/attendance/dashboard',
  '/academic/timetables',
  '/billing/invoices',
  '/billing/receipts',
  '/staff',
  '/learners',
  '/system/notifications',
];

const DEFAULT_STATE_JSON = '{}';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ResolveResponse {
  page: string;
  role: string;
  resolved: ResolvedAction | null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * Visual facsimile of the AttentionBar pill.
 *
 * We reproduce the inner layout (not the fixed positioning) so it renders
 * naturally inside the sandbox card. The component structure mirrors
 * components/attention-bar/attention-bar.tsx exactly.
 */
function AttentionBarPreview({ action }: { action: ResolvedAction }) {
  const styles = TONE_STYLES[action.tone] ?? TONE_STYLES.neutral;
  const Icon = resolveIcon(action.icon);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl',
        'min-h-[48px] px-3 py-2.5',
        'ring-1 ring-inset',
        styles.bg,
        styles.shadow,
        styles.ring,
        styles.pulse && 'animate-pulse',
      )}
      role='img'
      aria-label={`Preview: ${action.label}. ${action.cta}.`}
    >
      {/* Holo shimmer (urgent only) */}
      {styles.shimmer && (
        <span
          aria-hidden='true'
          className='pointer-events-none absolute inset-0 animate-holo-spin'
          style={{
            background:
              'conic-gradient(from 45deg at 50% 50%, rgba(255,255,255,0) 0deg, rgba(255,255,255,0.28) 60deg, rgba(255,255,255,0) 120deg, rgba(255,200,255,0.22) 180deg, rgba(255,255,255,0) 240deg, rgba(200,255,255,0.22) 300deg, rgba(255,255,255,0) 360deg)',
          }}
        />
      )}
      <span
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/25 via-white/0 to-transparent'
      />

      <div className='relative z-10 flex items-center gap-3'>
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-white/30',
            styles.iconBg,
          )}
          aria-hidden='true'
        >
          <Icon className='h-5 w-5' />
        </div>

        <div className='min-w-0 flex-1'>
          <p className='truncate text-[15px] font-semibold leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]'>
            {action.label}
          </p>
          {action.context && (
            <p className='truncate text-[12px] leading-tight text-white/80'>
              {action.context}
            </p>
          )}
        </div>

        <span
          className={cn(
            'shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold shadow-sm ring-1 ring-inset ring-white/40',
            styles.ctaBg,
          )}
        >
          {action.cta}
        </span>
      </div>
    </div>
  );
}

function TraceTimeline({ trace }: { trace: TraceEntry[] }) {
  // Build a map from layer → entry for quick lookup
  const byLayer = new Map<Layer, TraceEntry>();
  for (const entry of trace) {
    byLayer.set(entry.layer, entry);
  }

  return (
    <div className='relative space-y-0'>
      {/* Vertical connector line behind the circles */}
      <div className='absolute left-[15px] top-3 bottom-3 w-px bg-border' aria-hidden='true' />

      {TRACE_ORDER.map((layer, idx) => {
        const entry = byLayer.get(layer);
        const meta = LAYER_META[layer];
        const isLast = idx === TRACE_ORDER.length - 1;
        const verdict = entry?.result ?? 'skipped';
        const style = VERDICT_STYLE[verdict];

        return (
          <div
            key={layer}
            className={cn('relative flex items-start gap-3', !isLast && 'pb-4')}
          >
            {/* Circle indicator */}
            <div
              className={cn(
                'relative z-10 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border-2 bg-background',
                verdict === 'matched'
                  ? 'border-emerald-400'
                  : verdict === 'error'
                  ? 'border-red-400'
                  : verdict === 'skipped'
                  ? 'border-muted-foreground/30'
                  : 'border-slate-300 dark:border-slate-600',
              )}
              aria-hidden='true'
            >
              {style.icon}
            </div>

            {/* Content */}
            <div className='flex-1 min-w-0 pt-1'>
              <div className='flex flex-wrap items-center gap-2'>
                <span className={cn('text-sm font-medium', meta.colorClass)}>
                  {meta.label}
                </span>
                <Badge
                  className={cn('text-[11px] border', style.badge)}
                  variant='outline'
                >
                  {verdict}
                </Badge>
                {entry?.ruleId && (
                  <Badge variant='secondary' className='text-[11px] font-mono'>
                    rule: {entry.ruleId}
                  </Badge>
                )}
              </div>
              {entry?.reason && (
                <p className='mt-0.5 text-xs text-muted-foreground leading-relaxed'>
                  {entry.reason}
                </p>
              )}
              {!entry && (
                <p className='mt-0.5 text-xs text-muted-foreground italic'>
                  Not included in trace response
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TabSandbox() {
  const [role, setRole]           = useState<string>('counselor');
  const [page, setPage]           = useState<string>('/admission/leads');
  const [stateJson, setStateJson] = useState<string>(DEFAULT_STATE_JSON);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const [isResolving, setIsResolving] = useState(false);
  const [result, setResult]           = useState<ResolveResponse | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // Validate JSON as user types
  const handleStateChange = useCallback((val: string) => {
    setStateJson(val);
    try {
      JSON.parse(val);
      setJsonError(null);
    } catch {
      setJsonError('Invalid JSON');
    }
  }, []);

  async function handleResolve() {
    if (jsonError) return;
    setIsResolving(true);
    setResolveError(null);
    setResult(null);

    try {
      // Build URL — super_admin override params are accepted by the resolve route
      const params = new URLSearchParams({ page, role });
      const url = `/api/attention-bar/resolve?${params.toString()}`;

      const res = await fetch(url, { credentials: 'include' });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }

      const data: ResolveResponse = await res.json();
      setResult(data);
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsResolving(false);
    }
  }

  return (
    <div className='space-y-6 py-4'>

      {/* Header */}
      <div className='space-y-1'>
        <h3 className='text-lg font-semibold flex items-center gap-2'>
          <Sparkles className='h-5 w-5 text-indigo-500' />
          Test Sandbox
        </h3>
        <p className='text-sm text-muted-foreground'>
          Simulate a resolve call for any role + page combination. The full priority
          cascade runs server-side and the trace shows which layer fired and why.
        </p>
      </div>

      {/* Form */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-sm font-medium text-muted-foreground'>
            Resolver inputs
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
            {/* Role selector */}
            <div className='space-y-1.5'>
              <Label htmlFor='sandbox-role' className='text-sm'>
                Role
              </Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger id='sandbox-role' className='w-full'>
                  <SelectValue placeholder='Select a role' />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Page input */}
            <div className='space-y-1.5'>
              <Label htmlFor='sandbox-page' className='text-sm'>
                Page (pathname)
              </Label>
              <Input
                id='sandbox-page'
                list='sandbox-page-datalist'
                value={page}
                onChange={e => setPage(e.target.value)}
                placeholder='/admission/leads'
                className='font-mono text-sm'
              />
              <datalist id='sandbox-page-datalist'>
                {PRESET_PAGES.map(p => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
          </div>

          {/* State JSON */}
          <div className='space-y-1.5'>
            <Label htmlFor='sandbox-state' className='text-sm'>
              Mock context.state (JSON)
            </Label>
            <Textarea
              id='sandbox-state'
              value={stateJson}
              onChange={e => handleStateChange(e.target.value)}
              rows={4}
              className={cn(
                'font-mono text-xs resize-none',
                jsonError && 'border-destructive focus-visible:ring-destructive',
              )}
              placeholder='{ "pending_leads": 15 }'
              aria-describedby={jsonError ? 'sandbox-state-error' : undefined}
            />
            {jsonError && (
              <p id='sandbox-state-error' className='text-xs text-destructive'>
                {jsonError}
              </p>
            )}
            <p className='text-[11px] text-muted-foreground'>
              Passed as the resolver context state. Layer 2 rules read named state
              queries — this field lets you mock those values for testing rule logic.
            </p>
          </div>

          {/* Resolve button */}
          <Button
            onClick={handleResolve}
            disabled={isResolving || !!jsonError || !page.trim()}
            className='w-full sm:w-auto'
          >
            {isResolving ? (
              <>
                <RefreshCw className='h-4 w-4 mr-2 animate-spin' />
                Resolving…
              </>
            ) : (
              <>
                <Sparkles className='h-4 w-4 mr-2' />
                Resolve
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Error state */}
      {resolveError && (
        <Card className='border-destructive'>
          <CardContent className='py-4 flex items-start gap-2'>
            <AlertTriangle className='h-4 w-4 text-destructive mt-0.5 shrink-0' />
            <div>
              <p className='text-sm font-medium text-destructive'>Resolve failed</p>
              <p className='text-xs text-muted-foreground mt-0.5'>{resolveError}</p>
              <p className='text-xs text-muted-foreground mt-1'>
                Override params (role, layer3, layers) require super_admin. If you see a
                403, your session role is insufficient for test sandbox use.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && (
        <div className='space-y-4'>

          {/* Resolution trace */}
          <Card>
            <CardHeader className='pb-3'>
              <CardTitle className='text-sm font-medium flex items-center gap-2'>
                Resolution Trace
                <Badge variant='outline' className='text-[11px] font-mono'>
                  {result.role} on {result.page}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {result.resolved?.trace ? (
                <TraceTimeline trace={result.resolved.trace} />
              ) : (
                <p className='text-sm text-muted-foreground'>
                  No trace data — resolver returned null (complete cascade miss).
                </p>
              )}
            </CardContent>
          </Card>

          {/* Fired layer summary */}
          {result.resolved && (
            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-sm font-medium'>
                  Fired at
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='flex flex-wrap items-center gap-2 text-sm'>
                  <Badge
                    className={cn(
                      'text-[12px] font-mono',
                      LAYER_META[result.resolved.firedLayer].colorClass,
                      'bg-transparent border',
                    )}
                    variant='outline'
                  >
                    {LAYER_META[result.resolved.firedLayer].short}
                  </Badge>
                  <span className='text-muted-foreground'>
                    {LAYER_META[result.resolved.firedLayer].label}
                  </span>
                  {result.resolved.ruleId && (
                    <span className='text-xs text-muted-foreground font-mono'>
                      (rule: {result.resolved.ruleId})
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Rendered preview */}
          {result.resolved ? (
            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-sm font-medium text-muted-foreground'>
                  Visual Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='max-w-sm mx-auto'>
                  <AttentionBarPreview action={result.resolved} />
                </div>
                <p className='mt-3 text-[11px] text-center text-muted-foreground'>
                  This is how the pill renders on a mobile device for a{' '}
                  <strong>{result.role}</strong> visiting{' '}
                  <code className='font-mono'>{result.page}</code>.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className='border-amber-300 dark:border-amber-800'>
              <CardContent className='py-4 flex items-start gap-2'>
                <AlertTriangle className='h-4 w-4 text-amber-500 mt-0.5 shrink-0' />
                <div>
                  <p className='text-sm font-medium text-amber-700 dark:text-amber-400'>
                    Cascade returned null
                  </p>
                  <p className='text-xs text-muted-foreground mt-0.5'>
                    Every layer including the catch-all returned no match. This should
                    not happen in production — the */* entry in{' '}
                    <code className='font-mono text-[11px]'>static-defaults.ts</code>{' '}
                    is the last-resort safety net. Check if the catch-all entry is present.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Raw JSON toggle */}
          <RawJson data={result} />
        </div>
      )}
    </div>
  );
}

function RawJson({ data }: { data: unknown }) {
  const [show, setShow] = useState(false);
  return (
    <div className='space-y-2'>
      <Button variant='ghost' size='sm' onClick={() => setShow(v => !v)}>
        {show ? 'Hide' : 'Show'} raw JSON
      </Button>
      {show && (
        <pre className='overflow-x-auto rounded-lg bg-muted p-4 text-[11px] font-mono leading-relaxed'>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
