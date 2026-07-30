'use client';

// app/(routes)/health/achievements/_components/verification-panel.tsx
// ============================================================================
// The IQAC side of the achievements surface: confirm (or withdraw) the verified
// tick on learner achievements — outbound tournaments included.
//
// Renders NOTHING for anyone without accreditation.certificates.manage (or the
// admin bypass); the server action decides that, and re-checks it on every
// write, so this component is presentation only.
// ============================================================================

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BadgeCheck, ShieldCheck, Clock, AlertTriangle, ExternalLink } from 'lucide-react';
import {
  loadVerificationQueue,
  setAchievementVerified,
  type VerificationRow,
} from '../_actions/verify-achievement';
import { getCertificateLink } from '../_actions/certificate-link';
import { parseDescription } from '../_lib/outbound';

const LEVEL_LABEL: Record<string, string> = {
  intra_college: 'Intra-College',
  inter_college: 'Inter-College',
  district: 'District',
  state: 'State',
  national: 'National',
  international: 'International',
};

const TYPE_LABEL: Record<string, string> = {
  gold: 'Gold Medal',
  silver: 'Silver Medal',
  bronze: 'Bronze Medal',
  participation: 'Participation',
  record: 'Record Broken',
  best_player: 'Best Player',
  captain: 'Captain',
  other: 'Other',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Certificates are never handed to the browser as part of the queue — the row
 * only says whether one exists. Asking for it calls the server action, which
 * re-checks the D7 visibility rule and mints a link that lives five minutes.
 *
 * The fetched link is then rendered as a real anchor for the officer to click,
 * rather than opened with window.open() after the await: a pop-up triggered from
 * a resolved promise is blocked often enough that the certificate would silently
 * fail to open for some reviewers.
 */
function CertificateLink({ achievementId }: { achievementId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function request() {
    setLoading(true);
    setError(null);
    const res = await getCertificateLink(achievementId);
    if (!res.ok || !res.url) {
      setError(res.error ?? 'Could not open the certificate.');
    } else {
      setUrl(res.url);
    }
    setLoading(false);
  }

  if (error) {
    return <span className="text-[11px] text-red-600 max-w-[14rem]">{error}</span>;
  }

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1"
      >
        Open certificate
        <ExternalLink className="h-3 w-3" />
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={request}
      disabled={loading}
      className="text-[11px] text-indigo-600 hover:underline disabled:text-gray-400"
    >
      {loading ? 'Preparing…' : 'View certificate'}
    </button>
  );
}

export function VerificationPanel() {
  const [rows, setRows] = useState<VerificationRow[]>([]);
  const [canVerify, setCanVerify] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function apply(res: Awaited<ReturnType<typeof loadVerificationQueue>>) {
    setCanVerify(res.canVerify);
    setRows(res.rows ?? []);
    setError(res.ok ? null : res.error ?? 'Could not load the queue.');
    setLoading(false);
  }

  // Fetched inside the effect (not through a shared loader) so no state is set
  // synchronously while the effect body runs, and a late response after unmount
  // is dropped.
  useEffect(() => {
    let cancelled = false;
    void loadVerificationQueue().then((res) => {
      if (!cancelled) apply(res);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(row: VerificationRow) {
    setBusyId(row.id);
    setError(null);
    const res = await setAchievementVerified(row.id, !row.verified);
    if (!res.ok) {
      setError(res.error ?? 'Could not save the verification.');
      setBusyId(null);
      return;
    }
    apply(await loadVerificationQueue());
    setBusyId(null);
  }

  // No permission → the panel does not exist for this viewer.
  if (!loading && !canVerify) return null;

  const pending = rows.filter((r) => !r.verified);
  const verified = rows.filter((r) => r.verified);

  return (
    <Card className="border-indigo-100">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-indigo-800">
          <ShieldCheck className="h-4 w-4" />
          IQAC Verification
        </CardTitle>
        <p className="text-xs text-gray-500">
          Only the accreditation / IQAC team can tick an achievement as verified.
          Unverified entries are claims, not evidence — tick only what you have
          seen proof of, because verified entries are what accreditation counts.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="text-xs text-red-600 flex items-start gap-1">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
            {error}
          </p>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-16 animate-pulse bg-gray-100 rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-xs text-gray-500">
            No achievements recorded yet. Once learners (or the physical
            director) enter a tournament they travelled to, it appears here for
            verification.
          </p>
        ) : (
          <>
            <QueueSection
              title={`Awaiting verification (${pending.length})`}
              icon={<Clock className="h-3.5 w-3.5 text-amber-500" />}
              rows={pending}
              busyId={busyId}
              onToggle={toggle}
              emptyText="Nothing waiting — every recorded achievement is verified."
            />
            <QueueSection
              title={`Verified (${verified.length})`}
              icon={<BadgeCheck className="h-3.5 w-3.5 text-emerald-500" />}
              rows={verified}
              busyId={busyId}
              onToggle={toggle}
              emptyText="No achievement has been verified yet."
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function QueueSection({
  title,
  icon,
  rows,
  busyId,
  onToggle,
  emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  rows: VerificationRow[];
  busyId: string | null;
  onToggle: (row: VerificationRow) => void;
  emptyText: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
        {icon}
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-400">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const { host, isReserve, notes } = parseDescription(row.description);
            return (
              <li
                key={row.id}
                className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {row.learner_name}
                    {row.learner_roll && (
                      <span className="text-xs font-normal text-gray-400">
                        {' '}
                        · {row.learner_roll}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-600 truncate">
                    {row.event_name}
                    {row.sport ? ` · ${row.sport}` : ''}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {LEVEL_LABEL[row.event_level] ?? row.event_level} ·{' '}
                    {TYPE_LABEL[row.achievement_type] ?? row.achievement_type} ·{' '}
                    {formatDate(row.achievement_date)}
                  </p>
                  {host && (
                    <p className="text-[11px] text-gray-500">Hosted by {host}</p>
                  )}
                  {/* D11: a reserve travelled with the squad and never played.
                      The tick still counts them as having taken part — but the
                      officer ticking it sees, before they tick, that this person
                      did not compete. */}
                  {isReserve && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border text-slate-700 bg-slate-50 border-slate-200 inline-block">
                      Reserve — travelled, did not play
                    </span>
                  )}
                  {notes && (
                    <p className="text-[11px] text-gray-400 line-clamp-2">{notes}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {row.has_certificate ? (
                    <CertificateLink achievementId={row.id} />
                  ) : (
                    <span className="text-[11px] text-gray-400">No certificate</span>
                  )}

                  {row.is_own ? (
                    <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                      Your own record — a colleague must verify
                    </span>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant={row.verified ? 'outline' : 'default'}
                      disabled={busyId === row.id}
                      onClick={() => onToggle(row)}
                      className={
                        row.verified
                          ? 'h-8 text-xs'
                          : 'h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white'
                      }
                    >
                      {busyId === row.id
                        ? 'Saving…'
                        : row.verified
                          ? 'Unverify'
                          : 'Verify'}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
