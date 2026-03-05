'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { useEvent, useEventStats } from '@/hooks/startup-studio/use-events';
import { RegistrationsTable } from './_components/registrations-table';
import { ArrowLeft, CheckCircle2, Laptop, Loader2, ShieldCheck, Users, UserCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export default function AdminRegistrationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: event, isLoading } = useEvent(id);
  const { data: stats } = useEventStats(id);

  if (isLoading) {
    return (
      <ContentLayout title="Registrations">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </ContentLayout>
    );
  }

  if (!event) {
    return (
      <ContentLayout title="Registrations">
        <div className="text-center py-20 text-muted-foreground">Event not found.</div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Registrations`}>
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Startup Studio', href: '/startup-studio/events' },
        { label: event.name, href: `/startup-studio/events/${id}` },
        { label: 'Registrations' },
      ]} />

      <div className="space-y-6 mt-4 max-w-7xl">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => router.push(`/startup-studio/events/${id}`)}>
            <ArrowLeft className="h-4 w-4" /> Back to Event
          </Button>
        </div>

        <div>
          <h1 className="text-2xl font-bold py-1">Registrations</h1>
          <p className="text-sm text-muted-foreground">{event.name}</p>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <RegistrationStat icon={<Users className="h-5 w-5 text-blue-500" />} label="Total Teams" value={stats.total_teams} color="blue" />
            <RegistrationStat icon={<UserCheck className="h-5 w-5 text-emerald-500" />} label="Total Members" value={stats.total_members} color="emerald" />
            <RegistrationStat icon={<Laptop className="h-5 w-5 text-amber-500" />} label="Laptops Confirmed" value={stats.members_with_laptops} color="amber" />
            <RegistrationStat icon={<ShieldCheck className="h-5 w-5 text-purple-500" />} label="Lovable Verified" value={stats.lovable_verified_teams} color="purple" />
            <RegistrationStat icon={<CheckCircle2 className="h-5 w-5 text-green-500" />} label="Checked In" value={stats.checked_in_teams} color="green" />
          </div>
        )}

        <RegistrationsTable eventId={id} />
      </div>
    </ContentLayout>
  );
}

function RegistrationStat({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: number;
  color: 'blue' | 'emerald' | 'amber' | 'purple' | 'green';
}) {
  const colorMap = {
    blue: 'bg-blue-50 dark:bg-blue-950/20',
    emerald: 'bg-emerald-50 dark:bg-emerald-950/20',
    amber: 'bg-amber-50 dark:bg-amber-950/20',
    purple: 'bg-purple-50 dark:bg-purple-950/20',
    green: 'bg-green-50 dark:bg-green-950/20',
  };

  return (
    <Card className={cn('shadow-sm', colorMap[color])}>
      <CardContent className="p-4 flex flex-col items-center text-center gap-1">
        {icon}
        <span className="text-2xl font-bold">{value}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </CardContent>
    </Card>
  );
}
