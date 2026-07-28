'use client';

/**
 * SF100 Meeting Requests — NIF decision queue.
 *
 * Teams request a meeting with a mentor/investor (named or free-text). NIF staff
 * triage the pending queue here: approve, decline (with an optional reason), or
 * schedule (which books a meeting on the backend and marks the request scheduled).
 *
 * Self-contained: GET /sf100/meeting-requests?queue=nif then PATCH
 * /sf100/meeting-requests/[id] with {action}. All gated by
 * startup_studio.sf100.member.create. Lightweight local modals (no radix) to
 * avoid the dialog-race issues documented for this codebase.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  CalendarClock,
  Loader2,
  Check,
  X,
  CalendarPlus,
  Ban,
  User,
} from 'lucide-react';

interface Req {
  id: string;
  enrollmentId: string;
  teamName?: string | null;
  requestedMentorId: string | null;
  requestedName: string | null;
  requestedContact: string | null;
  requestedDisplay: string | null;
  reason: string | null;
  status: 'pending' | 'approved' | 'declined' | 'scheduled' | 'cancelled' | string;
  declineReason: string | null;
  createdAt: string;
  bookingId: string | null;
}

const API = '/api/startup-studio/sf100/meeting-requests';

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  scheduled: 'bg-emerald-100 text-emerald-800',
  declined: 'bg-rose-100 text-rose-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function Sf100MeetingRequestsPanel() {
  const [reqs, setReqs] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [declineFor, setDeclineFor] = useState<Req | null>(null);
  const [scheduleFor, setScheduleFor] = useState<Req | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}?queue=nif`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Failed to load requests');
      setReqs(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`${API}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Action failed');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const approve = async (r: Req) => {
    if (await patch(r.id, { action: 'approve' })) void load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Meeting requests</h3>
          <p className="text-sm text-slate-500">
            Teams requesting a meeting with a mentor or investor. Approve, decline, or schedule
            each request.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Refresh
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
      ) : reqs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
          No pending meeting requests. You’re all caught up.
        </div>
      ) : (
        <div className="space-y-2.5">
          {reqs.map((r) => {
            const busy = busyId === r.id;
            return (
              <div
                key={r.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">
                        {r.teamName || 'Team'}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          STATUS_BADGE[r.status] ?? 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-700">
                      <User className="h-3.5 w-3.5 text-slate-400" />
                      <span className="font-medium">
                        {r.requestedDisplay || r.requestedName || 'Unspecified contact'}
                      </span>
                      {r.requestedContact && (
                        <span className="text-slate-400">· {r.requestedContact}</span>
                      )}
                    </div>
                    {r.reason && <p className="mt-1.5 text-sm text-slate-600">{r.reason}</p>}
                    {r.declineReason && (
                      <p className="mt-1 text-xs text-rose-600">
                        Declined: {r.declineReason}
                      </p>
                    )}
                    <div className="mt-1.5 text-xs text-slate-400">
                      Requested {fmtDate(r.createdAt)}
                    </div>
                  </div>

                  {r.status === 'pending' && (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => void approve(r)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        Approve
                      </button>
                      <button
                        onClick={() => setScheduleFor(r)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
                      >
                        <CalendarPlus className="h-3.5 w-3.5" />
                        Schedule
                      </button>
                      <button
                        onClick={() => setDeclineFor(r)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Decline
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {declineFor && (
        <DeclineModal
          req={declineFor}
          onClose={() => setDeclineFor(null)}
          onDeclined={async (reason) => {
            const ok = await patch(declineFor.id, {
              action: 'decline',
              declineReason: reason || undefined,
            });
            setDeclineFor(null);
            if (ok) void load();
          }}
        />
      )}
      {scheduleFor && (
        <ScheduleModal
          req={scheduleFor}
          onClose={() => setScheduleFor(null)}
          onScheduled={async (startTime, endTime) => {
            const ok = await patch(scheduleFor.id, { action: 'schedule', startTime, endTime });
            setScheduleFor(null);
            if (ok) void load();
          }}
        />
      )}
    </div>
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

function DeclineModal({
  req,
  onClose,
  onDeclined,
}: {
  req: Req;
  onClose: () => void;
  onDeclined: (reason: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    await onDeclined(reason.trim());
    setSaving(false);
  };

  return (
    <Modal title={`Decline request from ${req.teamName || 'team'}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Optionally tell the team why this meeting can’t go ahead.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)…"
          rows={3}
          className="w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        />
        <button
          onClick={submit}
          disabled={saving}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-rose-600 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Decline request
        </button>
      </div>
    </Modal>
  );
}

function ScheduleModal({
  req,
  onClose,
  onScheduled,
}: {
  req: Req;
  onClose: () => void;
  onScheduled: (startTime: string, endTime: string) => void | Promise<void>;
}) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!start || !end) return setErr('Pick a start and end time.');
    const startDt = new Date(start);
    const endDt = new Date(end);
    if (Number.isNaN(startDt.getTime()) || Number.isNaN(endDt.getTime()))
      return setErr('Invalid date/time.');
    if (endDt <= startDt) return setErr('End time must be after the start time.');
    setSaving(true);
    await onScheduled(startDt.toISOString(), endDt.toISOString());
    setSaving(false);
  };

  const input =
    'h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20';

  return (
    <Modal title={`Schedule meeting for ${req.teamName || 'team'}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Booking with{' '}
          <span className="font-semibold">
            {req.requestedDisplay || req.requestedName || 'the requested contact'}
          </span>
          . A meeting will be created and the request marked scheduled.
        </p>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Start</label>
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={input}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">End</label>
          <input
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className={input}
          />
        </div>
        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        <button
          onClick={submit}
          disabled={saving}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
          Schedule meeting
        </button>
      </div>
    </Modal>
  );
}
