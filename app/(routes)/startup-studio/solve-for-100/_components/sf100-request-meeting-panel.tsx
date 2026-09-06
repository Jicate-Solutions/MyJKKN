'use client';

/**
 * "Request a meeting" — team-facing panel. A team asks NIF to set up a meeting
 * with a named mentor/investor (free-text is enough for Phase 3). NIF then
 * approves / declines / schedules from their queue; the team sees the status
 * (and the decline reason, if any) here.
 *
 * All calls go to /api/startup-studio/sf100/meeting-requests, which runs on the
 * authenticated RLS client — only members of THIS team (or an admin) can read/
 * write, and created_by is pinned server-side. `canEdit` hides the write
 * controls on read-only surfaces.
 */
import { useCallback, useEffect, useState } from 'react';
import { Plus, Loader2, CalendarClock, X } from 'lucide-react';

type Status = 'pending' | 'approved' | 'declined' | 'scheduled' | 'cancelled';

interface MeetingRequest {
  id: string;
  enrollmentId: string;
  requestedMentorId: string | null;
  requestedName: string | null;
  requestedContact: string | null;
  requestedDisplay: string | null;
  reason: string | null;
  status: Status;
  declineReason: string | null;
  createdAt: string;
  bookingId: string | null;
}

const API = '/api/startup-studio/sf100/meeting-requests';

const STATUS_STYLE: Record<Status, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-sky-100 text-sky-800',
  scheduled: 'bg-emerald-100 text-emerald-800',
  declined: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

const STATUS_LABEL: Record<Status, string> = {
  pending: 'Pending',
  approved: 'Approved',
  scheduled: 'Scheduled',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

export function Sf100RequestMeetingPanel({
  enrollmentId,
  canEdit = true,
}: {
  enrollmentId: string;
  canEdit?: boolean;
}) {
  const [requests, setRequests] = useState<MeetingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRequest, setShowRequest] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}?enrollmentId=${encodeURIComponent(enrollmentId)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Failed to load');
      setRequests(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [enrollmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-emerald-600" />
          <h3 className="text-base font-semibold text-slate-900">Meeting requests</h3>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowRequest(true)}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
          >
            <Plus className="h-3.5 w-3.5" /> Request a meeting
          </button>
        )}
      </div>

      <p className="mb-3 text-sm text-slate-500">
        Ask to meet a mentor or investor. Your coordinator (NIF) reviews each request and
        schedules the ones that fit.
      </p>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : requests.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">No meeting requests yet.</p>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="rounded-lg border border-slate-100 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">
                    {r.requestedDisplay || r.requestedName || 'Mentor / investor'}
                  </p>
                  {r.reason && <p className="mt-0.5 text-sm text-slate-600">{r.reason}</p>}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status]}`}
                >
                  {STATUS_LABEL[r.status]}
                </span>
              </div>
              {r.status === 'declined' && r.declineReason && (
                <p className="mt-2 rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
                  Declined: {r.declineReason}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {showRequest && (
        <RequestMeetingModal
          enrollmentId={enrollmentId}
          onClose={() => setShowRequest(false)}
          onCreated={() => {
            setShowRequest(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function RequestMeetingModal({
  enrollmentId,
  onClose,
  onCreated,
}: {
  enrollmentId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [requestedName, setRequestedName] = useState('');
  const [requestedContact, setRequestedContact] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!requestedName.trim()) return setErr('Enter the person you want to meet.');
    if (!reason.trim()) return setErr('Add a short reason for the meeting.');
    setSaving(true);
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrollmentId,
          requestedName: requestedName.trim(),
          requestedContact: requestedContact.trim() || undefined,
          reason: reason.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Failed to submit request');
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to submit request');
    } finally {
      setSaving(false);
    }
  };

  const input =
    'h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20';

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
          <h4 className="text-base font-semibold text-slate-900">Request a meeting</h4>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Who do you want to meet?
            </label>
            <input
              className={input}
              placeholder="Name of the mentor or investor"
              value={requestedName}
              onChange={(e) => setRequestedName(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Their email or phone (optional)
            </label>
            <input
              className={input}
              placeholder="Helps NIF reach them"
              value={requestedContact}
              onChange={(e) => setRequestedContact(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Reason for the meeting
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="What do you want to discuss?"
              rows={3}
              className="w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
          <button
            onClick={submit}
            disabled={saving}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Send request
          </button>
        </div>
      </div>
    </div>
  );
}
