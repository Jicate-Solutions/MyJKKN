'use client';

import { Card, CardContent } from '@/components/ui/card';

export function SystemHealthTab() {
  return (
    <Card>
      <CardContent className='flex items-center justify-center h-64 text-muted-foreground'>
        Loading System Health...
      </CardContent>
    </Card>
  );
}
