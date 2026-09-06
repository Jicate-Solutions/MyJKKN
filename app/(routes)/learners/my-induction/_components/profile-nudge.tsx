'use client';

// "Finish your profile" nudge — the Day-10 onboarding driver (spec §5, decision
// 10: is_profile_complete by the last induction day). Links to the existing
// student profile page (/learners/my-profile); does NOT duplicate the profile
// editor. Progress mirrors calculateProfileCompleteness (4 required fields).
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, UserCheck, ArrowRight } from 'lucide-react';

const BRAND = '#0b6d41';

interface Props {
  isComplete: boolean;
  filled: number;
  total: number;
  deadline?: string | null; // induction end_date (the Day-10 deadline), ISO
}

function formatDeadline(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ProfileNudge({ isComplete, filled, total, deadline }: Props) {
  if (isComplete) {
    return (
      <Card className="border-[#0b6d41]/30 bg-[#0b6d41]/5">
        <CardContent className="flex items-center gap-2 py-3 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: BRAND }} />
          <span className="font-medium" style={{ color: BRAND }}>Your profile is complete.</span>
          <span className="text-muted-foreground">Nicely done — you&apos;re all set for induction.</span>
        </CardContent>
      </Card>
    );
  }

  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  const deadlineLabel = formatDeadline(deadline);

  return (
    <Card className="border-amber-300 bg-amber-50">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-start gap-3">
          <UserCheck className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-900">Finish your profile</p>
            <p className="text-sm text-amber-800">
              You&apos;ve completed {filled} of {total} key details
              {deadlineLabel ? <> — please finish by <span className="font-medium">{deadlineLabel}</span></> : null}.
            </p>
          </div>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-amber-200">
          <div
            className="h-full rounded-full bg-amber-500 transition-all"
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>

        <div className="flex justify-end">
          <Button asChild size="sm" className="bg-amber-600 text-white hover:bg-amber-700">
            <Link href="/learners/my-profile">
              Finish your profile <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
