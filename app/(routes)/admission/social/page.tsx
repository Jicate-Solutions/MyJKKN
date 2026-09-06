'use client';

import Link from 'next/link';
import { Instagram, Sparkles } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
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
  { label: 'Admission', href: '/admission' },
  { label: 'Social Media' },
];

export default function SocialAdminIndexPage() {
  return (
    <PermissionGuard
      module="social"
      action="view"
      fallback={
        <ContentLayout title="Social">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            You do not have permission to view this page. Ask an administrator
            to grant the Social Media permissions to your role.
          </div>
        </ContentLayout>
      }
    >
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
              <Link href="/admission/social/instagram">
                <Button size="sm" className="w-full">
                  Open Dashboard
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-gradient-to-br from-fuchsia-500 to-amber-500 p-2">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-base">Engagement</CardTitle>
                  <CardDescription className="text-xs">
                    Turn a broadcast handle into a loop
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Set a handle&apos;s brief, review member contributions, run the weekly
                contributor rota, and resolve concerns.
              </p>
              <Link href="/admission/social/engagement">
                <Button size="sm" className="w-full">
                  Open Console
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </ContentLayout>
    </PermissionGuard>
  );
}
