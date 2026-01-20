import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface UpcomingClassesProps {
  learnerId: string;
}

export default function UpcomingClasses({ learnerId }: UpcomingClassesProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming Classes</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          No upcoming classes
        </p>
        {/* TODO: Fetch timetable and show today's classes */}
      </CardContent>
    </Card>
  );
}
