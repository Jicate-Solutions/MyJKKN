'use client';

import Link from 'next/link';
import { Instagram } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const breadcrumbItems = [
  { label: 'Home', href: '/' },
  { label: 'Administration' },
  { label: 'Social Media' },
];

export default function SocialAdminIndexPage() {
  return (
    <ContentLayout title="Social Media Admin">
      <PageBreadcrumb items={breadcrumbItems} />

      <div className="mt-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Social Media</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor and manage institutional social media accounts across all
            JKKN properties.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 p-2">
                  <Instagram className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-base">Instagram</CardTitle>
                  <CardDescription className="text-xs">
                    50 institutional accounts
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Track followers, engagement, post frequency, and health scores
                for all JKKN Instagram accounts.
              </p>
              <Link href="/admin/social/instagram">
                <Button size="sm" className="w-full">
                  Open Dashboard
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </ContentLayout>
  );
}
