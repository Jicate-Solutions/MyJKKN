'use client';

import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface CohortHeaderProps {
  memberName: string;
  level: number;
}

export function CohortHeader({ memberName, level }: CohortHeaderProps) {
  const levelLabels: Record<number, string> = {
    0: 'Observer',
    1: 'Co-Lead',
    2: 'Lead',
    3: 'Master Trainer',
  };

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      <div>
        <h1 className="text-lg font-semibold">{memberName}</h1>
        <p className="text-sm text-muted-foreground">
          Level {level}: {levelLabels[level] || 'Unknown'}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
