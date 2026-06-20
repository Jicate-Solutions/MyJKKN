'use client';

import { Card } from '@/components/ui/card';
import { useParentSession } from '@/hooks/parent/use-parent-session';

export default function AboutPage() {
  const { activeChild } = useParentSession();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">About Us</h1>
      <Card className="space-y-2 p-5 text-sm">
        <p className="font-semibold text-[#0b6d41]">{activeChild?.institutionName ?? 'JKKN Institutions'}</p>
        <p className="text-muted-foreground">
          The JKKN Parent Portal keeps you connected with your child&apos;s learning journey —
          attendance, fees, homework, achievements, and direct communication with the institution.
        </p>
        <p className="text-muted-foreground">Powered by JKKN.</p>
      </Card>
    </div>
  );
}
