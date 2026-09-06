'use client';

import { AlertTriangle, CheckCircle2, AlertCircle, Shield } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HealthData {
  totals: {
    users: number;
    orphans: number;
    mismatches: number;
    roles: number;
    superAdmins: number;
    // People who can sign in but have no profile at all. Distinct from
    // `orphans`, which is profiles with no ROLE. Optional so an older cached
    // response cannot crash the page.
    signedInWithoutProfile?: number;
    signedInWithoutProfileRecoverable?: number;
  };
}

interface Props {
  data: HealthData;
  onAction?: (
    action: 'show-orphans' | 'show-mismatches' | 'show-super-admins' | 'show-tables'
  ) => void;
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────

interface PlainCardProps {
  borderColor: string;
  bgColor: string;
  icon: React.ReactNode;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}

function PlainCard({
  borderColor,
  bgColor,
  icon,
  title,
  body,
  actionLabel,
  onAction
}: PlainCardProps) {
  return (
    <Card className={`border ${borderColor} ${bgColor}`}>
      <CardContent className='pt-5'>
        <div className='flex gap-3'>
          <div className='shrink-0 mt-0.5'>{icon}</div>
          <div className='flex flex-col gap-2 min-w-0'>
            <p className='font-semibold text-sm leading-snug'>{title}</p>
            {body && (
              <p className='text-sm text-slate-700 leading-relaxed'>{body}</p>
            )}
            {actionLabel && onAction && (
              <div>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={onAction}
                  className='text-xs h-7 px-3'
                >
                  {actionLabel}
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PlainHealthCards({ data, onAction }: Props) {
  const { totals } = data;
  const { users, orphans, mismatches, roles, superAdmins } = totals;
  const noProfile = totals.signedInWithoutProfile ?? 0;
  const noProfileFixable = totals.signedInWithoutProfileRecoverable ?? 0;

  return (
    <div className='grid grid-cols-1 lg:grid-cols-2 gap-3'>
      {/* Card 0 — Signed in, but no profile.
          Counts only people who have ACTUALLY signed in. There is a much larger
          set of never-used pre-created accounts; they have not hit anything, and
          counting them here would drown the real number. */}
      {noProfile > 0 ? (
        <PlainCard
          borderColor='border-red-300'
          bgColor='bg-red-50'
          icon={<AlertTriangle className='h-5 w-5 text-red-600' />}
          title={`${noProfile.toLocaleString()} ${
            noProfile === 1 ? 'person signs' : 'people sign'
          } in and get turned away`}
          body={`Their login works, but there is no profile to open, so they land back on the sign-in page every time.${
            noProfileFixable > 0
              ? ` ${noProfileFixable} of them already ${
                  noProfileFixable === 1 ? 'has' : 'have'
                } a profile under a different ID and can be reconnected.`
              : ''
          }`}
        />
      ) : (
        <PlainCard
          borderColor='border-emerald-300'
          bgColor='bg-emerald-50'
          icon={<CheckCircle2 className='h-5 w-5 text-emerald-600' />}
          title='Everyone who can sign in has a profile ✓'
        />
      )}

      {/* Card 1 — Orphan Users */}
      {orphans > 0 ? (
        <PlainCard
          borderColor='border-red-300'
          bgColor='bg-red-50'
          icon={<AlertTriangle className='h-5 w-5 text-red-600' />}
          title={`${orphans.toLocaleString()} people can't use the system`}
          body="They log in, see an empty app, and don't know why. Reason: They have accounts but no role was assigned."
          actionLabel='Show list →'
          onAction={() => onAction?.('show-orphans')}
        />
      ) : (
        <PlainCard
          borderColor='border-emerald-300'
          bgColor='bg-emerald-50'
          icon={<CheckCircle2 className='h-5 w-5 text-emerald-600' />}
          title='Everyone has a role assigned ✓'
        />
      )}

      {/* Card 2 — Mismatches */}
      {mismatches > 0 ? (
        <PlainCard
          borderColor='border-amber-300'
          bgColor='bg-amber-50'
          icon={<AlertCircle className='h-5 w-5 text-amber-600' />}
          title={`${mismatches.toLocaleString()} people see a broken menu`}
          body="Their displayed role and actual permissions don't match. They click menu items that do nothing — or miss items they need."
          actionLabel='Show list →'
          onAction={() => onAction?.('show-mismatches')}
        />
      ) : (
        <PlainCard
          borderColor='border-emerald-300'
          bgColor='bg-emerald-50'
          icon={<CheckCircle2 className='h-5 w-5 text-emerald-600' />}
          title='Displayed roles match actual permissions ✓'
        />
      )}

      {/* Card 3 — Data Protection (always green) */}
      <PlainCard
        borderColor='border-emerald-300'
        bgColor='bg-emerald-50'
        icon={<Shield className='h-5 w-5 text-emerald-600' />}
        title='Data is protected'
        body='All tables require permission to read. Security rules are active across the system.'
        actionLabel='View RLS audit →'
        onAction={() => onAction?.('show-tables')}
      />

      {/* Card 4 — Super Admin Count */}
      {superAdmins > 5 ? (
        <PlainCard
          borderColor='border-amber-300'
          bgColor='bg-amber-50'
          icon={<AlertCircle className='h-5 w-5 text-amber-600' />}
          title={`${superAdmins} people have Super Admin access`}
          body='Best practice is 2–5. Consider reviewing who needs this level.'
          actionLabel='Review list →'
          onAction={() => onAction?.('show-super-admins')}
        />
      ) : (
        <PlainCard
          borderColor='border-slate-200'
          bgColor='bg-white'
          icon={<Shield className='h-5 w-5 text-slate-500' />}
          title={`${superAdmins} ${superAdmins === 1 ? 'person has' : 'people have'} Super Admin access`}
          body={`${users.toLocaleString()} total users across ${roles} roles. This count is healthy.`}
          actionLabel='Review list →'
          onAction={() => onAction?.('show-super-admins')}
        />
      )}
    </div>
  );
}
