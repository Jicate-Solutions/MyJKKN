'use client';

import { useLearnerPrivileges } from '@/hooks/academic/use-privileges';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Award, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface PrivilegeBadgeWidgetProps {
  studentId: string;
  isVisible?: boolean;
}

export function PrivilegeBadgeWidget({ studentId, isVisible = true }: PrivilegeBadgeWidgetProps) {
  const { data: privileges, isLoading } = useLearnerPrivileges(studentId);

  // Don't render anything if no privileges or hidden
  if (!isVisible || isLoading || !privileges || privileges.length === 0) {
    return null;
  }

  // Get the first privilege group (most learners will have one)
  const primary = privileges[0];
  const typeNames = primary.privilege_types.map(t => t.name);

  return (
    <Link href="/academic/privileges/my" className="block">
      <Card className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950/30 dark:to-amber-900/20 border-amber-200 dark:border-amber-800 hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-500 rounded-lg shrink-0">
              <Award className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-sm text-amber-900 dark:text-amber-100 truncate">
                  {primary.group_name}
                </h3>
                <ChevronRight className="h-4 w-4 text-amber-500 shrink-0" />
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
                Director Order #{primary.reference_code}
              </p>
              <div className="flex flex-wrap gap-1">
                {typeNames.map((name) => (
                  <Badge
                    key={name}
                    variant="secondary"
                    className="text-[10px] bg-amber-200/60 dark:bg-amber-800/40 text-amber-800 dark:text-amber-200 border-0"
                  >
                    {name}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
