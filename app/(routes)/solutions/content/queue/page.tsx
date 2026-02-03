import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Video, Palette, FileText, Clock, User } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Work Queue | Solutions Hub',
  description: 'Content deliverables work queue',
};

export default function ContentQueuePage() {
  // Placeholder data
  const deliverables = [
    {
      id: '1',
      title: 'Promotional Video 1',
      order: { title: 'Marketing Campaign Q1' },
      division: 'video',
      status: 'in_progress',
      progress: 75,
      assigned_to: 'John Doe',
      revision_count: 1,
    },
    {
      id: '2',
      title: 'Social Media Banner Set',
      order: { title: 'Brand Refresh' },
      division: 'design',
      status: 'review',
      progress: 100,
      assigned_to: 'Jane Smith',
      revision_count: 0,
    },
    {
      id: '3',
      title: 'User Guide Chapter 1',
      order: { title: 'Product Documentation' },
      division: 'writing',
      status: 'pending',
      progress: 0,
      assigned_to: null,
      revision_count: 0,
    },
    {
      id: '4',
      title: 'Infographic Design',
      order: { title: 'Brand Refresh' },
      division: 'design',
      status: 'in_progress',
      progress: 45,
      assigned_to: 'Mike Johnson',
      revision_count: 0,
    },
    {
      id: '5',
      title: 'Product Demo Video',
      order: { title: 'Marketing Campaign Q1' },
      division: 'video',
      status: 'pending',
      progress: 0,
      assigned_to: null,
      revision_count: 0,
    },
  ];

  const divisionIcons: Record<string, React.ElementType> = {
    video: Video,
    design: Palette,
    writing: FileText,
  };

  const statusConfig: Record<string, { label: string; color: string }> = {
    pending: { label: 'Pending', color: 'bg-gray-100 text-gray-800' },
    in_progress: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-800' },
    review: { label: 'Review', color: 'bg-blue-100 text-blue-800' },
    revision: { label: 'Revision', color: 'bg-pink-100 text-pink-800' },
    approved: { label: 'Approved', color: 'bg-green-100 text-green-800' },
    delivered: { label: 'Delivered', color: 'bg-emerald-100 text-emerald-800' },
  };

  return (
    <ContentLayout title="Work Queue">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Content', href: '/solutions/content' },
          { label: 'Queue' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Work Queue</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Content deliverables awaiting work or review
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Deliverables Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {deliverables.map((item) => {
                const Icon = divisionIcons[item.division] || FileText;
                const status = statusConfig[item.status];

                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-4 rounded-lg border"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium">{item.title}</p>
                          <Badge className={status.color}>{status.label}</Badge>
                          {item.revision_count > 0 && (
                            <Badge variant="outline" className="text-pink-600">
                              R{item.revision_count}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{item.order.title}</p>
                        {item.progress > 0 && item.progress < 100 && (
                          <div className="flex items-center gap-2 mt-2">
                            <Progress value={item.progress} className="h-1 w-32" />
                            <span className="text-xs text-muted-foreground">
                              {item.progress}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {item.assigned_to ? (
                        <div className="flex items-center gap-2 text-sm">
                          <User className="h-4 w-4 text-muted-foreground" />
                          {item.assigned_to}
                        </div>
                      ) : (
                        <Button size="sm" variant="outline">
                          Claim
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
