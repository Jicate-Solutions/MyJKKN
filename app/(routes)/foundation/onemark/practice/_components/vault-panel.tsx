'use client';

// OneMark — the Mistake Vault, as the learner sees it.
//
// Counts and dates only. Which questions are in the vault is never listed
// here — the vault is a spaced-repetition queue, not a revision sheet, and
// showing the questions outside a review sitting would defeat it (PRD §6.3).
// The draw itself is fn_onemark_vault_draw's: eligibility, least-recently-
// wrong ordering and the 60% single-chapter cap (decision 13) are all
// server-side. This panel only says what is due and what comes back when.

import { Archive, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMyVault } from '@/hooks/onemark/use-vault';
import { useOneMarkT } from '@/lib/onemark/i18n/use-onemark-t';
import {
  upcomingVaultDays,
  type OneMarkSubject,
  type OneMarkVaultSummary,
} from '@/lib/services/onemark/vault-service';

/** A bare YYYY-MM-DD is a LOCAL day key (from upcomingVaultDays) and is built
 *  as a local date; `new Date('YYYY-MM-DD')` would read it as UTC midnight and
 *  shift it a day in any zone west of Greenwich. A full timestamp is shown
 *  in the viewer's zone as usual. */
function formatDay(iso: string): string {
  const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = dayOnly
    ? new Date(Number(dayOnly[1]), Number(dayOnly[2]) - 1, Number(dayOnly[3]))
    : new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function VaultPanel({
  learnerId,
  subjects,
  vault,
  onReview,
  starting,
}: {
  learnerId: string;
  subjects: OneMarkSubject[];
  vault: OneMarkVaultSummary[];
  onReview: (subject: OneMarkSubject) => void;
  starting: boolean;
}) {
  const rows = useMyVault(learnerId);
  const { t } = useOneMarkT();
  const upcoming = upcomingVaultDays(rows.data ?? []);
  const byExam = new Map(vault.map((v) => [v.examDefinitionId, v]));
  const anything = vault.some((v) => v.active + v.mastered > 0);

  return (
    <section className="rounded-2xl bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Archive className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-lg font-semibold text-foreground">{t('vault.title')}</h2>
      </div>
      <p className="mb-5 text-sm text-muted-foreground">{t('vault.intro')}</p>

      {!anything && (
        <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
          {t('vault.empty')}
        </p>
      )}

      {anything && (
        <ul className="divide-y divide-border">
          {subjects.map((s) => {
            const v = byExam.get(s.examDefinitionId);
            if (!v || v.active + v.mastered === 0) return null;
            return (
              <li key={s.examDefinitionId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm text-foreground">{s.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <span className="tabular-nums">{v.active}</span> {t('vault.inVault')} ·{' '}
                    <span className="tabular-nums">{v.mastered}</span> {t('vault.mastered')}
                    {v.eligibleNow === 0 && v.nextEligibleAt && (
                      <>
                        {' '}
                        · {t('vault.nextDue')} {formatDay(v.nextEligibleAt)}
                      </>
                    )}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={v.eligibleNow > 0 ? 'default' : 'outline'}
                  disabled={v.eligibleNow === 0 || starting || !s.poolReady}
                  onClick={() => onReview(s)}
                  title={
                    !s.poolReady
                      ? t('vault.notSetUp')
                      : v.eligibleNow === 0
                        ? t('vault.nothingDueTitle')
                        : undefined
                  }
                >
                  {starting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {v.eligibleNow > 0
                    ? t('vault.reviewDue', { count: v.eligibleNow })
                    : t('vault.nothingDue')}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {upcoming.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t('vault.comingBack')}
          </p>
          <ul className="flex flex-wrap gap-2">
            {upcoming.slice(0, 6).map((u) => (
              <li
                key={u.day}
                className="rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground"
              >
                {formatDay(u.day)} · <span className="tabular-nums">{u.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
