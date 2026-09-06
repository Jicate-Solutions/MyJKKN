'use client';

/**
 * The role ladder, and what it actually does to a request.
 *
 * A ladder is an ordered list of roles, LOWEST rung first. The chain an
 * applicant gets is every rung STRICTLY ABOVE their own, so one ladder produces
 * a different chain per person:
 *
 *   staff → hod → principal → cao
 *     a Facilitator (holds no rung) → HOD, Principal, CAO
 *     an HOD                        → Principal, CAO
 *     a Principal                   → CAO
 *     the CAO                       → nobody, so the fallback approver is used
 *
 * THE PREVIEW IS THE POINT OF THIS COMPONENT. A ladder is the one configuration
 * on this screen whose effect is not visible from the configuration — the same
 * four rungs mean four different things to four different people. The table
 * below renders resolveRungsAbove() for every rung, which is the same pure
 * function the apply-time build uses, so what it shows cannot drift from what
 * the applicant gets. (Postgres owns the authoritative resolution, because
 * user_roles is unreadable in the browser; the two are covered by the same
 * cases in __tests__/hr/leave-approval-chain.test.ts.)
 */

import { useMemo } from 'react';
import { AlertCircle, ArrowDown, ArrowRight, ArrowUp, Plus, Trash2 } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { resolveRungsAbove } from '@/lib/hr/leave/approval-chain';
import type { LeaveApproverRoleOption, LeaveFlowRunMode } from '@/types/hr-leave-types';

import { RolePicker } from './role-picker';

interface Props {
  ladder: string[];
  roles: LeaveApproverRoleOption[] | undefined;
  runMode: LeaveFlowRunMode;
  onChange: (ladder: string[]) => void;
}

export function RoleLadderEditor({ ladder, roles, runMode, onChange }: Props) {
  const roleByKey = useMemo(
    () => new Map((roles ?? []).map((r) => [r.role_key, r] as const)),
    [roles]
  );
  const label = (key: string) => roleByKey.get(key)?.role_name ?? key;

  const move = (i: number, to: number) => {
    if (to < 0 || to >= ladder.length) return;
    const next = [...ladder];
    [next[i], next[to]] = [next[to], next[i]];
    onChange(next);
  };

  /**
   * Every rung, plus the "holds no rung at all" case that covers most staff.
   *
   * `name` is redefined inside rather than closing over `label`, which the React
   * Compiler cannot see through — it infers a dependency the deps array does not
   * list and then skips optimizing the whole component.
   */
  const preview = useMemo(() => {
    if (ladder.length === 0) return [];
    const name = (key: string) => roleByKey.get(key)?.role_name ?? key;
    return [
      {
        who: 'Anyone holding none of these roles',
        chain: resolveRungsAbove(ladder, []).map(name),
      },
      ...ladder.map((rung) => ({
        who: name(rung),
        chain: resolveRungsAbove(ladder, [rung]).map(name),
      })),
    ];
  }, [ladder, roleByKey]);

  const unused = (roles ?? []).filter((r) => !ladder.includes(r.role_key));

  return (
    <div className="space-y-4">
      <div>
        <Label>Ladder — lowest rung first</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">
          A request goes to everyone <strong>above</strong> the applicant&apos;s own rung.
        </p>

        <div className="mt-2 space-y-2">
          {ladder.map((rung, i) => {
            const role = roleByKey.get(rung);
            return (
              <div key={rung} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                <Badge variant="secondary" className="shrink-0">{i + 1}</Badge>
                <span className="min-w-0 break-words font-medium">{label(rung)}</span>
                <span className="text-xs text-muted-foreground">
                  {role ? `${role.user_count} ${role.user_count === 1 ? 'person' : 'people'}` : ''}
                </span>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Move rung down the ladder">
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => move(i, i + 1)} disabled={i === ladder.length - 1}
                    aria-label="Move rung up the ladder">
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                    onClick={() => onChange(ladder.filter((r) => r !== rung))}
                    aria-label={`Remove ${label(rung)}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}

          {ladder.length === 0 && (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              No rungs yet. Add the lowest role first.
            </p>
          )}
        </div>

        <div className="mt-2 flex items-center gap-2">
          {/* Always empty: this field adds a rung rather than holding one, so it
              falls back to its placeholder the moment the pick lands in the list
              above. `unused` already excludes the rungs on the ladder, which is
              also why it can run out — 104 roles means it never will in
              practice, but an empty dropdown would read as broken. */}
          <RolePicker
            roles={unused}
            value=""
            onChange={(v) => v && onChange([...ladder, v])}
            placeholder={unused.length === 0 ? 'Every role is on the ladder' : 'Add a rung'}
            disabled={unused.length === 0}
            icon={<Plus className="h-4 w-4 shrink-0" />}
            className="w-full sm:w-[280px]"
            aria-label="Add a rung to the ladder"
          />
        </div>
      </div>

      {preview.length > 0 && (
        <div className="rounded-md border bg-muted/30 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            What each applicant gets
          </p>
          <div className="space-y-1.5">
            {preview.map((row) => (
              <div key={row.who} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="min-w-0 break-words text-muted-foreground">{row.who}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {row.chain.length === 0 ? (
                  <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                    nobody above them — uses the fallback approver
                  </span>
                ) : (
                  <span className="flex flex-wrap items-center gap-1">
                    {row.chain.map((c, i) => (
                      <span key={c} className="inline-flex items-center gap-1">
                        <Badge variant="outline" className="font-normal">{c}</Badge>
                        {runMode === 'sequential' && i < row.chain.length - 1 && (
                          <span className="text-muted-foreground">→</span>
                        )}
                        {runMode === 'parallel' && i < row.chain.length - 1 && (
                          <span className="text-xs text-muted-foreground">or</span>
                        )}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {ladder.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="space-y-1 text-xs">
            <p>
              Anyone holding several of these roles enters at the <strong>highest</strong> one, so a
              person who is both Staff and HOD is treated as an HOD and never routed to themselves.
            </p>
            <p>
              A rung only reaches <strong>the applicant&apos;s own institution</strong> — an HOD at
              one college never sees another college&apos;s requests. Only the Super Administrator
              and holders of <code>hr.leave.approve</code> (HR Head, CEO, COO) approve across all
              institutions.
            </p>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
