'use client';

import { Clock } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';

export default function PrivilegeReportPage() {
  return (
    <ContentLayout title="Monthly Progress Report">
      <Card className="max-w-2xl mx-auto">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Clock className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Coming Soon</h3>
          <p className="text-muted-foreground">
            Monthly progress reports will be available in the next update.
            You will be able to submit your app link, GitHub repository,
            and a description of what you built each month.
          </p>
        </CardContent>
      </Card>
    </ContentLayout>
  );
}
