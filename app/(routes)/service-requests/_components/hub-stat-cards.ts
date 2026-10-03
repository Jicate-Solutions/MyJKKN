// The four stat cards at the top of /service-requests.
//
// BUG-006055 / BUG-006014 / BUG-006007: the second card used to read "Pending"
// and showed every request the viewer can see that is still submitted or in
// review — including requests waiting on SOMEONE ELSE's approval step. The
// "Pending Approvals" tab right under it lists only the requests waiting on
// the viewer. Two different numbers under the same word read as a bug
// ("4 pending, but my approvals tab has 1").
//
// The card now says what it counts ("In progress", waiting on any approver)
// and, for an approver, states the number waiting on them — the same number
// the Pending Approvals tab shows.
//
// "Approved" also counts `fulfilled`: types with auto_fulfill_on_approval jump
// straight there and never occupy `approved`, so the literal status alone left
// Dental reading "Approved 0" over 39 fulfilled requests. An approver also sees
// their own decisions under Approved and Rejected ("7 by you").

export interface HubStatCard {
  key: 'total' | 'in_progress' | 'approved' | 'rejected';
  label: string;
  value: number;
  caption: string | null;
}

/**
 * @param counts      status → count, from get_service_request_status_counts
 * @param awaitingYou total of the viewer's Pending Approvals queue, or null
 *                    when the viewer cannot approve or the queue is not known
 *                    (still loading, or narrowed by a search).
 * @param decidedByYou the viewer's own approve/reject actions, or null when
 *                    the viewer cannot approve or they are still loading.
 */
export function buildHubStatCards(
  counts: Record<string, unknown>,
  awaitingYou: number | null,
  decidedByYou: { approved: number; rejected: number } | null = null
): HubStatCard[] {
  const n = (key: string) => {
    const v = counts[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  };
  const total = Object.values(counts).reduce<number>(
    (sum, v) => sum + (typeof v === 'number' && Number.isFinite(v) ? v : 0),
    0
  );

  return [
    { key: 'total', label: 'Total', value: total, caption: null },
    {
      key: 'in_progress',
      label: 'In progress',
      value: n('submitted') + n('in_review'),
      caption:
        awaitingYou === null
          ? 'Waiting on any approver'
          : `${awaitingYou} waiting on you`,
    },
    {
      key: 'approved',
      label: 'Approved',
      value: n('approved') + n('fulfilled'),
      caption: decidedByYou ? `${decidedByYou.approved} by you` : null,
    },
    {
      key: 'rejected',
      label: 'Rejected',
      value: n('rejected'),
      caption: decidedByYou ? `${decidedByYou.rejected} by you` : null,
    },
  ];
}
