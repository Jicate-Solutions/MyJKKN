'use client';

/**
 * crossover-cta.tsx
 * JKKN Health — Wellness Program → core Health module cross-over CTA
 *
 * Adoption on-ramp: once a participant is engaged in a wellness program
 * (they've marked at least one day watched), nudge them into the two core
 * Health-module habits that the impact dashboard's `adoption_lift` measures:
 *   • daily mood check-in  → /health/assessments
 *   • wellness profile/goal → /health/profile
 *
 * Purely additive — it reads engagement state passed in from the page and
 * renders nothing until the person has completed at least one day.
 */

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Smile, Target, Sparkles, ChevronRight } from 'lucide-react';

export function CrossoverCTA({ programTitle }: { programTitle?: string | null }) {
  const name = programTitle?.trim() || 'this program';

  return (
    <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 overflow-hidden">
      <CardContent className="py-5 px-5 space-y-4">
        {/* Heading */}
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 border border-emerald-200">
            <Sparkles className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 leading-snug">
              Enjoying {name}? Keep the momentum going.
            </p>
            <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">
              A daily mood check-in and a wellness goal take under a minute —
              and they carry the good habit beyond these few days.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Link href="/health/assessments" className="flex-1">
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
              <Smile className="h-4 w-4 mr-1.5" />
              Log today&apos;s mood
              <ChevronRight className="h-3.5 w-3.5 ml-1 opacity-80" />
            </Button>
          </Link>
          <Link href="/health/profile" className="flex-1">
            <Button
              variant="outline"
              className="w-full border-emerald-300 text-emerald-700 bg-white hover:bg-emerald-50"
            >
              <Target className="h-4 w-4 mr-1.5" />
              Set a wellness goal
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
