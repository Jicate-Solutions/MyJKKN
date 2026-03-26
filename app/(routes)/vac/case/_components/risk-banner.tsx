'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Flame, Info, PartyPopper } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CaseRiskLevel, CaseRiskCalculation } from '@/types/case';

interface RiskBannerProps {
  riskLevel: CaseRiskLevel;
  risk: CaseRiskCalculation | null;
  className?: string;
}

const CONFIG: Record<
  CaseRiskLevel,
  {
    bg: string;
    border: string;
    text: string;
    icon: ReactNode;
    title: string;
    getMessage: (risk: CaseRiskCalculation | null) => string;
  }
> = {
  on_track: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-800',
    icon: <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />,
    title: "You're on track!",
    getMessage: (risk) =>
      risk
        ? `${risk.tracks_completed} of 6 tracks complete — keep up the great work.`
        : 'You are completing tracks at the right pace for graduation.',
  },
  at_risk: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-800',
    icon: <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />,
    title: 'You need to accelerate.',
    getMessage: (risk) =>
      risk
        ? `You need ${risk.tracks_per_semester_needed} track${risk.tracks_per_semester_needed !== 1 ? 's' : ''} per semester to graduate on time. ${risk.tracks_remaining} track${risk.tracks_remaining !== 1 ? 's' : ''} remaining.`
        : 'Enroll in more tracks to stay on track for graduation.',
  },
  critical: {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-800',
    icon: <Flame className="h-5 w-5 text-orange-500 shrink-0" />,
    title: 'Action required — critical pace.',
    getMessage: (risk) =>
      risk
        ? `${risk.tracks_remaining} track${risk.tracks_remaining !== 1 ? 's' : ''} remaining, ${risk.semesters_remaining} semester${risk.semesters_remaining !== 1 ? 's' : ''} left. Consider intensive batches to catch up.`
        : 'You are significantly behind. Contact your coordinator immediately.',
  },
  overdue: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-800',
    icon: <Clock className="h-5 w-5 text-red-500 shrink-0" />,
    title: 'Exam approaching — incomplete tracks.',
    getMessage: (risk) => {
      const parts: string[] = [];
      if (risk?.days_to_exam !== null && risk?.days_to_exam !== undefined) {
        parts.push(`${risk.days_to_exam} day${risk.days_to_exam !== 1 ? 's' : ''} until exam.`);
      }
      if (risk?.tracks_remaining) {
        parts.push(
          `${risk.tracks_remaining} track${risk.tracks_remaining !== 1 ? 's' : ''} still incomplete.`
        );
      }
      parts.push('Contact your coordinator immediately.');
      return parts.join(' ');
    },
  },
  completed: {
    bg: 'bg-[#0b6d41]/5',
    border: 'border-[#0b6d41]/30',
    text: 'text-[#0b6d41]',
    icon: <PartyPopper className="h-5 w-5 text-[#0b6d41] shrink-0" />,
    title: 'Congratulations — all tracks complete!',
    getMessage: () =>
      'You have completed all 6 CASE tracks (180 hours). You are graduation-ready.',
  },
};

export function RiskBanner({ riskLevel, risk, className }: RiskBannerProps) {
  const cfg = CONFIG[riskLevel];

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'flex items-start gap-3 rounded-lg border p-4',
        cfg.bg,
        cfg.border,
        className
      )}
    >
      {cfg.icon}
      <div className={cn('flex-1 min-w-0', cfg.text)}>
        <p className="font-semibold text-sm leading-snug">{cfg.title}</p>
        <p className="text-sm mt-0.5 leading-snug">{cfg.getMessage(risk)}</p>
      </div>
      {riskLevel === 'on_track' || riskLevel === 'completed' ? null : (
        <div className={cn('flex items-center gap-1 text-xs shrink-0', cfg.text)}>
          <Info className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Talk to your coordinator</span>
        </div>
      )}
    </div>
  );
}
