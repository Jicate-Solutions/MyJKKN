'use client';

import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface BuilderHeaderProps {
  builderName: string;
  departmentName?: string;
}

export function BuilderHeader({ builderName, departmentName }: BuilderHeaderProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      <div>
        <h1 className="text-lg font-semibold">{builderName}</h1>
        {departmentName && (
          <p className="text-sm text-muted-foreground">{departmentName}</p>
        )}
      </div>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs">
            3
          </Badge>
        </Button>
      </div>
    </header>
  );
}
