import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface QuickStatsProps {
  learnerId: string;
}

export default function QuickStats({ learnerId }: QuickStatsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Stats</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">Attendance</span>
          <span className="font-semibold">--%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">GPA</span>
          <span className="font-semibold">--</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">Pending Bills</span>
          <span className="font-semibold">--</span>
        </div>
        {/* TODO: Fetch real stats from services */}
      </CardContent>
    </Card>
  );
}
