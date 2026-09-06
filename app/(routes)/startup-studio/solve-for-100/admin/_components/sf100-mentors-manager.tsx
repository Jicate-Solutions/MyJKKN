'use client';

/**
 * SF100 Mentors & Investors — coordinator/NIF management surface.
 *
 * Self-contained: talks only to the SF100 external-mentor APIs (all gated by
 * startup_studio.sf100.member.create). Lightweight local modals (no radix) to
 * avoid the dialog-race issues documented for this codebase.
 *
 * Capabilities (Phase 1): add an external mentor/investor, generate/deactivate a
 * 6-digit login code, assign a contact to any SF100 team.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  UserPlus,
  KeyRound,
  ShieldOff,
  Users,
  Loader2,
  Copy,
  Check,
  X,
  Briefcase,
  GraduationCap,
} from 'lucide-react';

interface AccessStatus {
  hasCode: boolean;
  isActive: boolean;
  locked: boolean;
  lockedUntil: string | null;
  attempts: number;
  lastLoginAt: string | null;
}
interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  organization: string | null;
  mentorType: string;
  isInvestor: boolean;
  assignedTeamCount: number;
  access: AccessStatus;
}
interface Team {
  enrollmentId: string;
  teamName: string;
}

const API = '/api/startup-studio/sf100';

export function Sf100MentorsManager() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [assignFor, setAssignFor] = useState<Contact | null>(null);
  const [codeReveal, setCodeReveal] = useState<{ name: string; code: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/external-mentors`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Failed to load');
      setContacts(json.data.contacts);
      setTeams(json.data.teams);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const genCode = async (c: Contact) => {
    const res = await fetch(`/api/startup-studio/mentors/${c.id}/access-code`, {
      method: 'POST',
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json?.message || 'Failed to generate code');
      return;
    }
    setCodeReveal({ name: c.name, code: json.data.code });
    void load();
  };

  const deactivate = async (c: Contact) => {
    const res = await fetch(`/api/startup-studio/mentors/${c.id}/access-code`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json?.message || 'Failed to deactivate');
      return;
    }
    void load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Mentors &amp; Investors</h3>
          <p className="text-sm text-slate-500">
            External contacts log in at <code className="rounded bg-slate-100 px-1">/external</code>{' '}
            with a 6-digit code and see only the teams you assign them.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          <UserPlus className="h-4 w-4" />
          Add contact
        </button>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => setError(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : contacts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
          No external mentors or investors yet. Add your first contact above.
        </div>
      ) : (
        <div className="space-y-2.5">
          {contacts.map((c) => (
            <div
              key={c.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{c.name}</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                        c.isInvestor
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {c.isInvestor ? (
                        <Briefcase className="h-3 w-3" />
                      ) : (
                        <GraduationCap className="h-3 w-3" />
                      )}
                      {c.isInvestor ? 'Investor' : 'Mentor'}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {[c.organization, c.email, c.phone].filter(Boolean).join(' · ') || '—'}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 text-slate-500">
                      <Users className="h-3 w-3" />
                      {c.assignedTeamCount} team{c.assignedTeamCount === 1 ? '' : 's'}
                    </span>
                    <CodeBadge access={c.access} />
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setAssignFor(c)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Assign to team
                  </button>
                  <button
                    onClick={() => genCode(c)}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    {c.access.hasCode ? 'Regenerate' : 'Generate code'}
                  </button>
                  {c.access.hasCode && c.access.isActive && (
                    <button
                      onClick={() => deactivate(c)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      <ShieldOff className="h-3.5 w-3.5" />
                      Deactivate
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddContactModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            void load();
          }}
        />
      )}
      {assignFor && (
        <AssignModal
          contact={assignFor}
          teams={teams}
          onClose={() => setAssignFor(null)}
          onAssigned={() => {
            setAssignFor(null);
            void load();
          }}
          onError={setError}
        />
      )}
      {codeReveal && (
        <CodeRevealModal
          name={codeReveal.name}
          code={codeReveal.code}
          onClose={() => setCodeReveal(null)}
        />
      )}
    </div>
  );
}

function CodeBadge({ access }: { access: AccessStatus }) {
  if (!access.hasCode)
    return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">No code</span>;
  if (!access.isActive)
    return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">Code deactivated</span>;
  if (access.locked)
    return <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">Locked</span>;
  return (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">
      Code active{access.lastLoginAt ? ' · logged in' : ''}
    </span>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h4 className="text-base font-semibold text-slate-900">{title}</h4>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AddContactModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [role, setRole] = useState<'mentor' | 'investor'>('mentor');
  const [form, setForm] = useState({ name: '', email: '', phone: '', organization: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setErr(null);
    if (!form.name.trim()) return setErr('Name is required.');
    if (!form.email.trim() && !form.phone.trim())
      return setErr('An email or phone is required (used to log in).');
    setSaving(true);
    try {
      const res = await fetch(`${API}/external-mentors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Failed to create');
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const input =
    'h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20';

  return (
    <Modal title="Add mentor or investor" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          {(['mentor', 'investor'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`rounded-lg py-2 text-sm font-medium capitalize ${
                role === r ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <input className={input} placeholder="Full name" value={form.name} onChange={set('name')} />
        <input className={input} placeholder="Email" value={form.email} onChange={set('email')} />
        <input className={input} placeholder="Phone" value={form.phone} onChange={set('phone')} />
        <input
          className={input}
          placeholder="Organization (optional)"
          value={form.organization}
          onChange={set('organization')}
        />
        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        <button
          onClick={submit}
          disabled={saving}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Add {role}
        </button>
      </div>
    </Modal>
  );
}

function AssignModal({
  contact,
  teams,
  onClose,
  onAssigned,
  onError,
}: {
  contact: Contact;
  teams: Team[];
  onClose: () => void;
  onAssigned: () => void;
  onError: (m: string) => void;
}) {
  const [enrollmentId, setEnrollmentId] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!enrollmentId) return setErr('Pick a team.');
    setSaving(true);
    try {
      const res = await fetch(`${API}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mentorId: contact.id, enrollmentId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Failed to assign');
      onAssigned();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Failed to assign';
      setErr(m);
      onError(m);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Assign ${contact.name} to a team`} onClose={onClose}>
      <div className="space-y-3">
        <select
          value={enrollmentId}
          onChange={(e) => setEnrollmentId(e.target.value)}
          className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500"
        >
          <option value="">Select a team…</option>
          {teams.map((t) => (
            <option key={t.enrollmentId} value={t.enrollmentId}>
              {t.teamName}
            </option>
          ))}
        </select>
        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        <button
          onClick={submit}
          disabled={saving}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Assign
        </button>
      </div>
    </Modal>
  );
}

function CodeRevealModal({
  name,
  code,
  onClose,
}: {
  name: string;
  code: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked; the code is visible to read out */
    }
  };
  return (
    <Modal title="Access code generated" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Share this 6-digit code with <span className="font-semibold">{name}</span>. It is shown{' '}
          <span className="font-semibold">only once</span> — they use it with their email/phone to
          log in at <code className="rounded bg-slate-100 px-1">/external</code>.
        </p>
        <div className="flex items-center justify-center gap-3 rounded-xl bg-slate-900 py-5">
          <span className="text-3xl font-bold tracking-[0.4em] text-white">{code}</span>
          <button
            onClick={copy}
            className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20"
            title="Copy"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
        <button
          onClick={onClose}
          className="h-10 w-full rounded-lg bg-emerald-700 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          Done
        </button>
      </div>
    </Modal>
  );
}
