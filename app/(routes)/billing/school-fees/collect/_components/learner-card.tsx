'use client';

// learner-card.tsx — the identity check.
//
// Its only job is to let the clerk confirm, in one glance, that the money about
// to be taken belongs to the person standing at the counter. Hence roll number
// and register number are given equal weight to the name.

import Image from 'next/image';
import { User, Phone, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { SchoolLearnerForPayment } from '@/types/school-fees';

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
  const classLine = [learner.class_name, learner.section_name].filter(Boolean).join(' • ');

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border bg-muted">
            {learner.student_photo_url ? (
              <Image
                src={learner.student_photo_url}
                alt={fullName}
                fill
                sizes="64px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <User className="h-7 w-7 text-muted-foreground" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold truncate">{fullName}</h2>
                <p className="text-sm text-muted-foreground">
                  Reg No: {learner.register_number || '—'} &nbsp;•&nbsp; Roll No:{' '}
                  {learner.roll_number || '—'}
                </p>
              </div>

              <Button variant="ghost" size="sm" onClick={onClear} className="shrink-0">
                <X className="h-4 w-4 mr-1" />
                Change
              </Button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {classLine ? <Badge variant="outline">{classLine}</Badge> : null}
              <Badge variant="outline">{academicYearName}</Badge>
            </div>

            {(learner.father_name || learner.student_mobile) ? (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {learner.father_name ? <span>Parent/Guardian: {learner.father_name}</span> : null}
                {learner.student_mobile ? (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {learner.student_mobile}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
