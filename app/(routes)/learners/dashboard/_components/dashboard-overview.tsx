import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DashboardOverviewProps {
  learnerId: string;
}

export default function DashboardOverview({ learnerId }: DashboardOverviewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">
          Welcome to your learner dashboard. This section will show your academic overview.
        </p>
        {/* TODO: Add grade summary, attendance summary, upcoming assignments */}
      </CardContent>
    </Card>
  );
}
