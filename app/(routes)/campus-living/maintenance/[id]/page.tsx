'use client';

import { use } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  User,
  Wrench,
  Camera,
  MessageSquare,
} from 'lucide-react';

interface MaintenanceDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function MaintenanceDetailPage({ params }: MaintenanceDetailPageProps) {
  const { id } = use(params);

  // TODO: Replace with actual hook
  // const { data: request, isLoading } = useMaintenanceRequest(id);

  const request = {
    id,
    title: 'Leaking tap in bathroom',
    description: 'The hot water tap in the bathroom has been leaking constantly for 2 days. Water is pooling on the floor and could be a slip hazard.',
    category: 'Plumbing',
    room: 'Block A - Room 101',
    reported_by: 'Arun Kumar (CS2024001)',
    priority: 'high',
    status: 'in_progress',
    created_at: '2026-02-20 09:30 AM',
    sla_deadline: '2026-02-21 09:30 AM',
    assigned_to: 'Suresh (Plumber)',
    assigned_at: '2026-02-20 10:15 AM',
  };

  const timeline = [
    { time: '2026-02-20 09:30 AM', event: 'Request created', by: 'Arun Kumar', type: 'created' },
    { time: '2026-02-20 10:15 AM', event: 'Assigned to Suresh (Plumber)', by: 'Warden', type: 'assigned' },
    { time: '2026-02-20 11:00 AM', event: 'Inspection started', by: 'Suresh', type: 'update' },
    { time: '2026-02-20 11:30 AM', event: 'Parts ordered - washer replacement needed', by: 'Suresh', type: 'update' },
  ];

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'critical':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Critical</Badge>;
      case 'high':
        return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">High</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Medium</Badge>;
      case 'low':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Low</Badge>;
      default:
        return <Badge variant="outline">{priority}</Badge>;
    }
  };

  return (
    <ContentLayout title="Maintenance Request">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/campus-living/maintenance">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{request.title}</h1>
              <p className="text-muted-foreground">Request #{request.id}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {getPriorityBadge(request.priority)}
            <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
              <Clock className="mr-1 h-3 w-3" />
              In Progress
            </Badge>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Details */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Request Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Description</p>
                  <p>{request.description}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Category</p>
                      <p className="font-medium">{request.category}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Location</p>
                      <p className="font-medium">{request.room}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Reported By</p>
                      <p className="font-medium">{request.reported_by}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Assigned To</p>
                      <p className="font-medium">{request.assigned_to || 'Unassigned'}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Photos */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="h-5 w-5" />
                  Photos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="border-2 border-dashed rounded-lg aspect-video flex items-center justify-center bg-muted/50">
                    <div className="text-center">
                      <Camera className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Before photo</p>
                    </div>
                  </div>
                  <div className="border-2 border-dashed rounded-lg aspect-video flex items-center justify-center bg-muted/50">
                    <div className="text-center">
                      <Camera className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">After photo (pending)</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Add Update */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Add Update
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea placeholder="Add a status update or note..." rows={3} />
                <div className="flex gap-2">
                  <Select>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Update status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="resolved">Mark Resolved</SelectItem>
                      <SelectItem value="on_hold">On Hold</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button>Submit Update</Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* SLA Progress */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">SLA Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="text-sm font-medium">{request.created_at}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">SLA Deadline</p>
                    <p className="text-sm font-medium text-orange-600">{request.sla_deadline}</p>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-orange-500 rounded-full h-2" style={{ width: '75%' }} />
                  </div>
                  <p className="text-xs text-orange-600">75% of SLA time elapsed</p>
                </div>
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Activity Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {timeline.map((item, idx) => (
                    <div key={idx} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-2 h-2 rounded-full mt-2 ${
                          item.type === 'created' ? 'bg-blue-500' :
                          item.type === 'assigned' ? 'bg-purple-500' :
                          'bg-gray-400'
                        }`} />
                        {idx < timeline.length - 1 && (
                          <div className="w-px flex-1 bg-gray-200 mt-1" />
                        )}
                      </div>
                      <div className="pb-4">
                        <p className="text-sm font-medium">{item.event}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.by} - {item.time}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
