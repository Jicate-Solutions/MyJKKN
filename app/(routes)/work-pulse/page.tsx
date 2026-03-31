import { Activity, Sparkles, Bot, CalendarDays } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { WorkPulseService } from '@/lib/services/work-pulse/work-pulse-service';
import { getPulseStats } from './_data/get-pulse-stats';
import { getPulseEntries } from './_data/get-pulse-entries';
import { WeeklyPulseForm } from './_components/weekly-pulse-form';
import { BadgeDisplay } from './_components/badge-display';
import { MicroInterviewResponse } from './_components/micro-interview-response';
import { ComplianceTab } from './_components/compliance-tab';
import { WorkPulseInfoModal } from './_components/work-pulse-info-modal';
const COMPLIANCE_ROLES = ['hod', 'principal', 'super_admin', 'administrator'];

export default async function WorkPulsePage() {
  const { profile } = await getEnhancedUserProfile();
  if (!profile) {
    return (
      <ContentLayout title="Work Pulse">
        <p className="text-muted-foreground">Please log in to access Work Pulse.</p>
      </ContentLayout>
    );
  }

  const [stats, { data: entries }, hasSubmitted, interviews] = await Promise.all([
    getPulseStats(),
    getPulseEntries({ limit: 5 }),
    WorkPulseService.hasSubmittedThisWeek(profile.id),
    WorkPulseService.getPendingInterviews(profile.id),
  ]);

  const showCompliance = COMPLIANCE_ROLES.includes(profile.role);

  const statCards = [
    { label: 'Total Pulses', value: stats?.total_pulses || 0, icon: Activity },
    { label: 'Patterns Spotted', value: stats?.patterns_spotted || 0, icon: Sparkles },
    { label: 'Agents Originated', value: stats?.agents_originated || 0, icon: Bot },
    { label: 'This Month', value: stats?.this_month || 0, icon: CalendarDays },
  ];

  return (
    <ContentLayout title="My Pulse">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Work Pulse', href: '/work-pulse' },
          { label: 'My Pulse' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold py-1">My Pulse</h1>
            <p className="text-sm text-muted-foreground">
              Share what&apos;s slowing you down — help us find automation opportunities
            </p>
          </div>
          <WorkPulseInfoModal />
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.label}>
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{card.value}</p>
                      <p className="text-xs text-muted-foreground">{card.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Badges */}
        {stats && <BadgeDisplay stats={stats} />}

        {/* Weekly Pulse Form */}
        <WeeklyPulseForm hasSubmitted={hasSubmitted} />

        {/* Micro-Interviews */}
        <MicroInterviewResponse interviews={interviews} />

        {/* Recent Entries */}
        {entries.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Recent Entries</h3>
            {entries.map((entry) => (
              <Card key={entry.id}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Week of {new Date(entry.week_of).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                  <div className="grid gap-2 text-sm">
                    <div>
                      <span className="font-medium text-muted-foreground">Talent waste:</span>{' '}
                      <span className="text-xs bg-muted px-1.5 py-0.5 rounded mr-1">
                        {entry.talent_waste_category}
                      </span>
                      {entry.talent_waste_description.slice(0, 100)}
                      {entry.talent_waste_description.length > 100 ? '...' : ''}
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">Repetition:</span>{' '}
                      <span className="text-xs bg-muted px-1.5 py-0.5 rounded mr-1">
                        {entry.repetition_category}
                      </span>
                      {entry.repetition_description.slice(0, 100)}
                      {entry.repetition_description.length > 100 ? '...' : ''}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Compliance Tab (HOD/Admin only) */}
        {showCompliance && profile.institution_id && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              Department Compliance
            </h3>
            <ComplianceTab institutionId={profile.institution_id} />
          </div>
        )}

      </div>
    </ContentLayout>
  );
}
