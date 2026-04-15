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
  Loader2,
} from 'lucide-react';
import { useHostelMaintenanceRequest } from '@/hooks/campus-living/use-hostel-maintenance';

interface MaintenanceDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function MaintenanceDetailPage({ params }: MaintenanceDetailPageProps) {
  const { id } = use(params);

  const { data: request, isLoading } = useHostelMaintenanceRequest(id);

  if (isLoading || !request) {
    return (
      <ContentLayout title="Maintenance Request">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

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
            <Badge className={
              request.status === 'resolved' ? 'bg-green-100 text-green-800 hover:bg-green-100' :
              request.status === 'in_progress' ? 'bg-blue-100 text-blue-800 hover:bg-blue-100' :
              ''
            }>
              <Clock className="mr-1 h-3 w-3" />
              {request.status === 'resolved' ? 'Resolved' : request.status === 'in_progress' ? 'In Progress' : request.status.replace('_', ' ')}
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
                      <p className="font-medium capitalize">{request.category}{request.subcategory ? ` / ${request.subcategory}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Location</p>
                      <p className="font-medium">{(request as any).hostel_blocks?.name || request.block_id}{(request as any).hostel_rooms?.room_number ? ` - Room ${(request as any).hostel_rooms.room_number}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Reported By</p>
                      <p className="font-medium">{request.learner_id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Assigned To</p>
                      <p className="font-medium">{request.assigned_to_name || 'Unassigned'}</p>
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
                    <p className="text-sm font-medium">{request.created_at ? new Date(request.created_at).toLocaleString() : '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">SLA Deadline</p>
                    <p className="text-sm font-medium text-orange-600">{request.sla_deadline ? new Date(request.sla_deadline).toLocaleString() : '-'}</p>
                  </div>
                  {(() => {
                    const created = new Date(request.created_at).getTime();
                    const deadline = new Date(request.sla_deadline).getTime();
                    const now = Date.now();
                    const total = deadline - created;
                    const elapsed = now - created;
                    const pct = total > 0 ? Math.min(100, Math.round((elapsed / total) * 100)) : 0;
                    const isOverdue = now > deadline;
                    return (
                      <>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div className={`${isOverdue ? 'bg-red-500' : pct > 75 ? 'bg-orange-500' : 'bg-green-500'} rounded-full h-2`} style={{ width: `${pct}%` }} />
                        </div>
                        <p className={`text-xs ${isOverdue ? 'text-red-600' : 'text-orange-600'}`}>
                          {isOverdue ? 'SLA breached' : `${pct}% of SLA time elapsed`}
                        </p>
                      </>
                    );
                  })()}
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
                  {[
                    { time: request.created_at, event: 'Request created', type: 'created' },
                    ...(request.assigned_at ? [{ time: request.assigned_at, event: `Assigned to ${request.assigned_to_name || 'staff'}`, type: 'assigned' }] : []),
                    ...(request.resolved_at ? [{ time: request.resolved_at, event: 'Request resolved', type: 'resolved' }] : []),
                    ...(request.verified_at ? [{ time: request.verified_at, event: `Verified by ${request.verified_by || 'staff'}`, type: 'verified' }] : []),
                  ].map((item, idx, arr) => (
                    <div key={idx} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-2 h-2 rounded-full mt-2 ${
                          item.type === 'created' ? 'bg-blue-500' :
                          item.type === 'assigned' ? 'bg-purple-500' :
                          item.type === 'resolved' ? 'bg-green-500' :
                          'bg-gray-400'
                        }`} />
                        {idx < arr.length - 1 && (
                          <div className="w-px flex-1 bg-gray-200 mt-1" />
                        )}
                      </div>
                      <div className="pb-4">
                        <p className="text-sm font-medium">{item.event}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.time ? new Date(item.time).toLocaleString() : ''}
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
