'use client';

// learner-card.tsx — the identity check.
//
// Its only job is to let the clerk confirm, in one glance, that the money about
// to be taken belongs to the person standing at the counter. Hence roll number
// and register number are given equal weight to the name.

import Image from 'next/image';
import { User, Phone, X, GraduationCap, CalendarDays, Users, Hash } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SchoolLearnerForPayment } from '@/types/school-fees';

import { SECTION_THEMES } from '../../_components/section-theme';

const T = SECTION_THEMES.collect;

export function LearnerCard({
  learner,
  academicYearName,
  onClear,
}: {
  learner: SchoolLearnerForPayment;
  academicYearName: string;
  onClear: () => void;
}) {
  const fullName = `${learner.first_name} ${learner.last_name}`.trim();
  const initials = [learner.first_name, learner.last_name]
    .map((part) => (part || '').trim()[0] ?? '')
    .join('')
    .toUpperCase();
  const classLine = [learner.class_name, learner.section_name].filter(Boolean).join(' • ');

  return (
    <Card className={cn('overflow-hidden', T.cardBorder)}>
      {/* Thin section-colour strip along the top — the card reads as part of
          the Bill Payment screen even when scrolled away from the banner. */}
      <div className={cn('h-1.5 w-full', T.headerGradient)} />
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start gap-4">
          {/* Photo comes from learners_profiles.student_photo_url (Supabase
              Storage). Only ~210 of 805 school learners have one, so the
              fallback is the common case, not the exception — initials rather
              than a generic silhouette, because at a counter the avatar is
              part of confirming you have the right child. */}
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl ring-2 ring-teal-200 ring-offset-2 ring-offset-background dark:ring-teal-800">
            {learner.student_photo_url ? (
              <Image
                src={learner.student_photo_url}
                alt={fullName}
                fill
                sizes="80px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-teal-500 to-cyan-400 text-2xl font-bold text-white">
                {initials || <User className="h-8 w-8" />}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className={cn('text-[11px] font-semibold uppercase tracking-wider', T.text)}>
                  Learner
                </p>
                <h2 className="text-xl font-bold leading-tight truncate sm:text-2xl">{fullName}</h2>
              </div>

              <Button variant="outline" size="sm" onClick={onClear} className="shrink-0">
                <X className="h-4 w-4 mr-1" />
                Change
              </Button>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              <Fact icon={GraduationCap} label="Class" value={classLine || '—'} />
              <Fact icon={CalendarDays} label="Academic year" value={academicYearName} />
              <Fact icon={Hash} label="Reg No" value={learner.register_number || '—'} />
              <Fact icon={Hash} label="Roll No" value={learner.roll_number || '—'} />
              <Fact icon={Users} label="Parent / Guardian" value={learner.father_name || '—'} />
              <Fact icon={Phone} label="Mobile" value={learner.student_mobile || '—'} />
            </dl>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-2.5 py-1.5 min-w-0">
      <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Icon className="h-3 w-3 shrink-0" />
        {label}
      </dt>
      <dd className="text-sm font-medium truncate" title={value}>
        {value}
      </dd>
    </div>
  );
}
