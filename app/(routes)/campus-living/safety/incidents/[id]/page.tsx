'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft,
  AlertTriangle,
  MapPin,
  User,
  Clock,
  FileText,
  Camera,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import {
  useHostelIncident,
  useUpdateHostelIncident,
} from '@/hooks/campus-living/use-hostel-incidents';

interface IncidentDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function IncidentDetailPage({ params }: IncidentDetailPageProps) {
  const { id } = use(params);
  const { data, isLoading, error } = useHostelIncident(id);
  const updateIncident = useUpdateHostelIncident();
  const [actionNote, setActionNote] = useState('');
  const incident = data as any;

  if (isLoading) {
    return (
      <ContentLayout title="Incident Detail">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  if (error || !incident) {
    return (
      <ContentLayout title="Incident Detail">
        <div className="space-y-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/campus-living/safety/incidents">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Incidents
            </Link>
          </Button>
          <Card>
            <CardContent className="py-12 text-center space-y-2">
              <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
              <p className="font-medium">Incident not found</p>
              <p className="text-sm text-muted-foreground">
                {error instanceof Error ? error.message : `No incident with ID ${id}`}
              </p>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Critical</Badge>;
      case 'high': return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">High</Badge>;
      case 'medium': return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Medium</Badge>;
      case 'low': return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Low</Badge>;
      default: return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      reported: 'bg-blue-100 text-blue-800',
      under_investigation: 'bg-purple-100 text-purple-800',
      action_taken: 'bg-amber-100 text-amber-800',
      closed: 'bg-green-100 text-green-800',
      reopened: 'bg-red-100 text-red-800',
    };
    const cls = map[status] ?? 'bg-gray-100 text-gray-800';
    return <Badge className={`${cls} hover:${cls}`}>{status?.replaceAll('_', ' ') ?? 'unknown'}</Badge>;
  };

  const handleSubmitUpdate = () => {
    if (!actionNote.trim()) {
      toast.error('Please describe the update before submitting');
      return;
    }
    const previousActions = Array.isArray(incident.actions_taken)
      ? incident.actions_taken
      : [];
    const newAction = {
      action: actionNote.trim(),
      by: 'Current User',
      date: new Date().toISOString(),
    };
    updateIncident.mutate(
      {
        id,
        payload: {
          actions_taken: [...previousActions, newAction] as any,
          status: 'action_taken' as any,
        },
      },
      {
        onSuccess: () => setActionNote(''),
      }
    );
  };

  const handleStatusChange = (status: string, label: string) => {
    updateIncident.mutate({
      id,
      payload: { status: status as any },
    }, {
      onSuccess: () => toast.success(`Marked as ${label}`),
    });
  };

  const actions: Array<{ action: string; by?: string; date?: string }> =
    Array.isArray(incident.actions_taken) ? incident.actions_taken : [];
  const isMutating = updateIncident.isPending;

  return (
    <ContentLayout title="Incident Detail">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/campus-living/safety/incidents">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{incident.title}</h1>
              <p className="text-muted-foreground">Incident #{incident.id}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {getSeverityBadge(incident.severity)}
            {getStatusBadge(incident.status)}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Incident Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Description</p>
                  <p>{incident.description ?? '—'}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Type</p>
                      <p className="font-medium capitalize">{incident.type ?? '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Location</p>
                      <p className="font-medium">{incident.location ?? '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Date &amp; Time</p>
                      <p className="font-medium">
                        {incident.incident_at
                          ? new Date(incident.incident_at).toLocaleString('en-IN')
                          : incident.date ?? '—'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Reported By</p>
                      <p className="font-medium">
                        {incident.reported_by ?? 'Anonymous'}
                        {incident.reporter_role ? ` (${incident.reporter_role})` : ''}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {incident.involved_parties && (
              <Card>
                <CardHeader>
                  <CardTitle>Parties Involved</CardTitle>
                </CardHeader>
                <CardContent>
                  <p>{typeof incident.involved_parties === 'string'
                      ? incident.involved_parties
                      : JSON.stringify(incident.involved_parties)}</p>
                </CardContent>
              </Card>
            )}

            {incident.immediate_action && (
              <Card>
                <CardHeader>
                  <CardTitle>Immediate Action Taken</CardTitle>
                </CardHeader>
                <CardContent>
                  <p>{incident.immediate_action}</p>
                </CardContent>
              </Card>
            )}

            {/* Evidence */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="h-5 w-5" />
                  Evidence
                </CardTitle>
              </CardHeader>
              <CardContent>
                {Array.isArray(incident.evidence) && incident.evidence.length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-3">
                    {incident.evidence.map((ev: any, idx: number) => (
                      <div
                        key={idx}
                        className="border rounded-lg aspect-video flex items-center justify-center bg-muted/50"
                      >
                        <div className="text-center px-2">
                          <FileText className="h-6 w-6 text-muted-foreground mx-auto mb-1" />
                          <p className="text-xs text-muted-foreground truncate">
                            {ev.type ?? ev.name ?? `Evidence ${idx + 1}`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No evidence attached to this incident.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Add Action */}
            <Card>
              <CardHeader>
                <CardTitle>Add Action / Update</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Document an action taken or status update..."
                  rows={3}
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  disabled={isMutating}
                />
                <Button onClick={handleSubmitUpdate} disabled={isMutating}>
                  {isMutating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit Update
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Status Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                {actions.length > 0 ? (
                  <div className="space-y-4">
                    {actions.map((action, idx) => (
                      <div key={idx} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
                          {idx < actions.length - 1 && (
                            <div className="w-px flex-1 bg-gray-200 mt-1" />
                          )}
                        </div>
                        <div className="pb-4">
                          <p className="text-sm font-medium">{action.action}</p>
                          <p className="text-xs text-muted-foreground">
                            {action.by ?? 'System'}
                            {action.date ? ` — ${new Date(action.date).toLocaleString('en-IN')}` : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No actions recorded yet.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  size="sm"
                  onClick={() => handleStatusChange('under_investigation', 'Under Investigation')}
                  disabled={isMutating}
                >
                  Escalate to Administration
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  size="sm"
                  onClick={() => handleStatusChange('closed', 'Resolved')}
                  disabled={isMutating}
                >
                  Mark as Resolved
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  size="sm"
                  onClick={() =>
                    toast.info('Report generation ships in a follow-up PR.', {
                      description: 'A PDF/CSV export of this incident will be available once the report endpoint is live.',
                    })
                  }
                  disabled={isMutating}
                >
                  Generate Report
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
