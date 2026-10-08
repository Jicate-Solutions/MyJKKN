'use client';

import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Copy, KeyRound, ShieldAlert } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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

const DOOR_URL = 'https://www.jkkn.ai/api/mcp/mcp';
const MAX_WORKING_KEYS = 3;
const DAY_CHOICES = [30, 60, 90] as const;

interface PersonalKey {
  id: string;
  name: string;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  status: 'working' | 'expired' | 'turned_off';
}

interface NewKey {
  id: string;
  name: string;
  key: string;
  expires_at: string;
}

// The fn_ai_personal_key_* RPCs are newer than the generated database types.
type RpcCaller = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_LABEL: Record<PersonalKey['status'], { text: string; className: string }> = {
  working: { text: 'Working', className: 'text-green-700 dark:text-emerald-400' },
  expired: { text: 'Expired', className: 'text-amber-700 dark:text-amber-400' },
  turned_off: { text: 'Turned off', className: 'text-muted-foreground' },
};

const STEPS: { title: string; steps: string[] }[] = [
  {
    title: 'Claude',
    steps: [
      'Claude Code: run  claude mcp add --transport http myjkkn ' + DOOR_URL + ' --header "Authorization: Bearer YOUR_KEY"',
      `Claude Desktop: in its settings file, add a server named myjkkn that uses the mcp-remote helper with the address ${DOOR_URL} and the header "Authorization: Bearer YOUR_KEY". The MyJKKN connection guide shows the exact lines.`,
      'claude.ai in the browser cannot use this key yet: its custom connectors sign in with OAuth, and a fixed key there is set by an organisation administrator for everyone in the organisation. Never put your own key there.',
    ],
  },
  {
    title: 'ChatGPT',
    steps: [
      'ChatGPT cannot use this key yet: its connectors sign in with OAuth or with no sign-in at all, and this connection needs your key.',
      'Use Claude Code, Claude Desktop or Gemini CLI instead.',
    ],
  },
  {
    title: 'Gemini',
    steps: [
      'Gemini CLI: open your settings.json and add a server named myjkkn.',
      `Set its httpUrl to ${DOOR_URL} and add a header "Authorization" with the value "Bearer YOUR_KEY".`,
      'Other Gemini apps: use their "add MCP server" option if your plan offers it, with the same address and key.',
    ],
  },
  {
    title: 'Zoho Zia',
    steps: [
      'In Zoho, open the place where Zia connects to outside tools (MCP servers), if your Zoho plan offers it.',
      `Add a server with this address: ${DOOR_URL}`,
      'Add an "Authorization" header with the value "Bearer YOUR_KEY".',
    ],
  },
];

export function ConnectOutsideAi() {
  const [name, setName] = useState('');
  const [days, setDays] = useState<number>(90);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<NewKey | null>(null);
  const [turningOff, setTurningOff] = useState<PersonalKey | null>(null);
  const [allowingBooking, setAllowingBooking] = useState<PersonalKey | null>(null);
  const [savingBooking, setSavingBooking] = useState(false);

  const rpc = useCallback(
    (fn: string, args?: Record<string, unknown>) =>
      (createClientSupabaseClient() as unknown as RpcCaller).rpc(fn, args),
    []
  );

  const {
    data: keys = [],
    isLoading: loading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['ai-personal-keys'],
    queryFn: async (): Promise<PersonalKey[]> => {
      const { data, error } = await rpc('fn_ai_personal_key_list');
      if (error) throw new Error(error.message);
      return Array.isArray(data) ? (data as PersonalKey[]) : [];
    },
  });
  const {
    data: bookingIds = [],
    isError: bookingUnknown,
    isLoading: bookingLoading,
    refetch: refetchBooking,
  } = useQuery({
    queryKey: ['ai-personal-key-booking'],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await rpc('fn_ai_personal_key_booking_ids');
      if (error) throw new Error(error.message);
      return Array.isArray(data) ? (data as string[]) : [];
    },
  });
  const load = () => {
    void refetch();
    void refetchBooking();
  };

  const setBooking = async (target: PersonalKey, allow: boolean) => {
    setSavingBooking(true);
    const { error } = await rpc('fn_ai_personal_key_set_booking', { p_key_id: target.id, p_allow: allow });
    setSavingBooking(false);
    if (error) {
      toast.error(error.message || 'Could not change this key. Please try again.');
      return;
    }
    toast.success(
      allow
        ? `"${target.name}" can now book meetings on your calendar.`
        : `"${target.name}" can no longer book meetings.`
    );
    load();
  };

  const workingCount = keys.filter((k) => k.status === 'working').length;

  const create = async () => {
    setCreating(true);
    const { data, error } = await rpc('fn_ai_personal_key_create', {
      p_name: name.trim() || null,
      p_days: days,
    });
    setCreating(false);
    if (error) {
      toast.error(error.message || 'Could not make a key.');
      return;
    }
    setNewKey(data as NewKey);
    setName('');
    load();
  };

  const copyKey = async () => {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey.key);
      toast.success('Key copied. Paste it into your AI now.');
    } catch {
      toast.error('Could not copy. Select the key and copy it by hand.');
    }
  };

  const turnOff = async () => {
    if (!turningOff) return;
    const target = turningOff;
    setTurningOff(null);
    const { error } = await rpc('fn_ai_personal_key_revoke', { p_key_id: target.id });
    if (error) {
      toast.error('Could not turn the key off. Please try again.');
      return;
    }
    toast.success(`"${target.name}" is turned off. Anything using it stops working now.`);
    load();
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 pb-24 lg:p-6 lg:pb-6">
      <div className="space-y-2">
        <Link
          href="/ai-query"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to AI Assistant
        </Link>
        <h1 className="text-2xl font-bold text-foreground">Connect an outside AI</h1>
        <p className="text-sm text-muted-foreground">
          Use MyJKKN from an outside AI such as Claude Code, Claude Desktop or Gemini CLI. The outside AI sees only what you can see in
          MyJKKN, and it can only read. It cannot change, send or delete anything, unless you let one of your keys book
          meetings on your calendar below.
        </p>
      </div>

      <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
        <div className="space-y-1 text-sm text-foreground">
          <p className="font-semibold">Your key works like your password.</p>
          <p className="text-muted-foreground">
            Anyone who has it can read what you can read in MyJKKN. Paste it only into your own AI app. Do not
            send it in a chat, email or document. If you think someone else has it, turn it off below straight
            away.
          </p>
        </div>
      </div>

      {newKey ? (
        <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm dark:shadow-none">
          <h2 className="text-lg font-semibold text-foreground">Your new key: copy it now</h2>
          <p className="text-sm text-muted-foreground">
            You will not see this key again. If you lose it, turn it off and make a new one.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <code className="flex-1 break-all rounded-md border bg-muted px-3 py-2 font-mono text-sm text-foreground">
              {newKey.key}
            </code>
            <Button onClick={copyKey} className="shrink-0">
              <Copy className="mr-2 h-4 w-4" /> Copy key
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Works until {formatDate(newKey.expires_at)}.</p>
          <Button variant="outline" onClick={() => setNewKey(null)}>
            I have copied it
          </Button>
        </section>
      ) : (
        <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm dark:shadow-none">
          <h2 className="text-lg font-semibold text-foreground">Make a key</h2>
          <div className="space-y-2">
            <Label htmlFor="key-name">Name (so you can tell your keys apart)</Label>
            <Input
              id="key-name"
              placeholder="For example: Claude on my laptop"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">How long should it work?</p>
            <div className="flex flex-wrap gap-2">
              {DAY_CHOICES.map((d) => (
                <Button
                  key={d}
                  type="button"
                  size="sm"
                  variant={days === d ? 'default' : 'outline'}
                  onClick={() => setDays(d)}
                >
                  {d} days
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={create} disabled={creating || workingCount >= MAX_WORKING_KEYS}>
              <KeyRound className="mr-2 h-4 w-4" />
              {creating ? 'Making key…' : 'Make key'}
            </Button>
            <span className="text-xs text-muted-foreground">
              {workingCount >= MAX_WORKING_KEYS
                ? `You have ${MAX_WORKING_KEYS} working keys. Turn one off to make another.`
                : `You can have up to ${MAX_WORKING_KEYS} working keys at a time.`}
            </span>
          </div>
        </section>
      )}

      <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm dark:shadow-none">
        <h2 className="text-lg font-semibold text-foreground">Your keys</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : isError ? (
          <p className="text-sm text-muted-foreground">Could not load your keys. Refresh the page to try again.</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">You have not made a key yet.</p>
        ) : (
          <ul className="divide-y">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-foreground">{k.name}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className={`font-medium ${STATUS_LABEL[k.status].className}`}>
                      {STATUS_LABEL[k.status].text}
                    </span>
                    {' · '}made {formatDate(k.created_at)} · works until {formatDate(k.expires_at)} · last used{' '}
                    {formatDate(k.last_used_at)}
                  </p>
                </div>
                {k.status === 'working' && (
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`book-${k.id}`}
                        // If the booking state could not be loaded, do not show
                        // "off" for a key that may be on: disable the switch.
                        disabled={bookingUnknown || bookingLoading || savingBooking}
                        checked={bookingIds.includes(k.id)}
                        onCheckedChange={(on) => (on ? setAllowingBooking(k) : void setBooking(k, false))}
                      />
                      <Label htmlFor={`book-${k.id}`} className="text-sm text-foreground">
                        Can book meetings
                      </Label>
                      {bookingUnknown && (
                        <span className="text-xs text-muted-foreground">(could not check, refresh the page)</span>
                      )}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setTurningOff(k)}>
                      Turn off
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm dark:shadow-none">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">How to connect</h2>
          <p className="text-sm text-muted-foreground">
            Every AI needs the same two things: the address{' '}
            <code className="rounded bg-muted px-1 font-mono text-xs text-foreground">{DOOR_URL}</code> and your
            key, sent as <span className="font-medium text-foreground">Bearer</span> followed by the key. The AI must
            let you add that header yourself; apps that only offer OAuth sign-in cannot use it yet. The menus below
            may be named slightly differently in your version of the app.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {STEPS.map((ai) => (
            <div key={ai.title} className="space-y-2 rounded-lg border p-3">
              <h3 className="text-sm font-semibold text-foreground">{ai.title}</h3>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                {ai.steps.map((s) => (
                  <li key={s} className="break-words">
                    {s}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Then ask your AI a question such as &ldquo;Which learners in my department are below 75% participation?&rdquo;
          It answers with the same information the MyJKKN AI Assistant would show you.
        </p>
      </section>

      <AlertDialog open={allowingBooking !== null} onOpenChange={(open) => !open && setAllowingBooking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Let &ldquo;{allowingBooking?.name}&rdquo; book meetings?</AlertDialogTitle>
            <AlertDialogDescription>
              Whoever uses this key can then book meetings on your calendar and send the invitations in your name,
              without asking you first, including up to 5 people outside JKKN per meeting. It cannot book for anyone
              else, and only one of your keys can book at a time. You can switch this off, or turn the key off, here at
              any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not now</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = allowingBooking;
                setAllowingBooking(null);
                if (target) void setBooking(target, true);
              }}
            >
              Allow booking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={turningOff !== null} onOpenChange={(open) => !open && setTurningOff(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off &ldquo;{turningOff?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              Any AI using this key stops reaching MyJKKN at once. This cannot be undone; you can make a new key
              instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={turnOff}>Turn off</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
