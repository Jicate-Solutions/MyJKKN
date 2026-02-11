'use client';

import { useEffect } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function SocialMediaError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[social-media] Error:', error);
  }, [error]);

  return (
    <ContentLayout title="Social Media">
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <p className="text-muted-foreground text-sm">
              An error occurred while loading the social media module.
            </p>
            <Button onClick={() => reset()} variant="outline">
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
