'use client';

import { use } from 'react';
import Link from 'next/link';
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
} from 'lucide-react';

interface IncidentDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function IncidentDetailPage({ params }: IncidentDetailPageProps) {
  const { id } = use(params);

  const incident = {
    id,
    title: 'Ragging complaint (verbal)',
    type: 'ragging',
    severity: 'high',
    location: 'Block A - Common Area',
    reported_by: 'Anonymous',
    reporter_role: 'Student',
    date: '2026-02-17 08:30 PM',
    status: 'investigating',
    description: 'A group of senior students was reported verbally harassing a first-year student in the common area of Block A. The incident lasted approximately 15 minutes. The victim was asked to perform tasks and was ridiculed.',
    immediate_action: 'Warden was alerted immediately. CCTV footage has been pulled. Both parties have been separated.',
    involved_parties: 'Victim: First-year student (name withheld). Accused: 3 senior students (identities being verified).',
    actions_taken: [
      { date: '2026-02-17 09:00 PM', action: 'Warden notified and CCTV reviewed', by: 'Security' },
      { date: '2026-02-18 10:00 AM', action: 'Anti-Ragging Committee convened', by: 'Dean' },
      { date: '2026-02-18 02:00 PM', action: 'Statements recorded from witnesses', by: 'Committee' },
      { date: '2026-02-19 11:00 AM', action: 'Accused students identified and called for hearing', by: 'Committee' },
    ],
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Critical</Badge>;
      case 'high': return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">High</Badge>;
      case 'medium': return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Medium</Badge>;
      case 'low': return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Low</Badge>;
      default: return <Badge variant="outline">{severity}</Badge>;
    }
  };

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
            <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">Investigating</Badge>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            {/* Details */}
            <Card>
              <CardHeader>
                <CardTitle>Incident Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Description</p>
                  <p>{incident.description}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Type</p>
                      <p className="font-medium capitalize">{incident.type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Location</p>
                      <p className="font-medium">{incident.location}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Date & Time</p>
                      <p className="font-medium">{incident.date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Reported By</p>
                      <p className="font-medium">{incident.reported_by} ({incident.reporter_role})</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Parties */}
            <Card>
              <CardHeader>
                <CardTitle>Parties Involved</CardTitle>
              </CardHeader>
              <CardContent>
                <p>{incident.involved_parties}</p>
              </CardContent>
            </Card>

            {/* Immediate Action */}
            <Card>
              <CardHeader>
                <CardTitle>Immediate Action Taken</CardTitle>
              </CardHeader>
              <CardContent>
                <p>{incident.immediate_action}</p>
              </CardContent>
            </Card>

            {/* Evidence */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="h-5 w-5" />
                  Evidence
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="border-2 border-dashed rounded-lg aspect-video flex items-center justify-center bg-muted/50">
                    <div className="text-center">
                      <Camera className="h-6 w-6 text-muted-foreground mx-auto mb-1" />
                      <p className="text-xs text-muted-foreground">CCTV Screenshot</p>
                    </div>
                  </div>
                  <div className="border-2 border-dashed rounded-lg aspect-video flex items-center justify-center bg-muted/50">
                    <div className="text-center">
                      <FileText className="h-6 w-6 text-muted-foreground mx-auto mb-1" />
                      <p className="text-xs text-muted-foreground">Witness Statement</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Add Action */}
            <Card>
              <CardHeader>
                <CardTitle>Add Action / Update</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea placeholder="Document an action taken or status update..." rows={3} />
                <Button>Submit Update</Button>
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
                <div className="space-y-4">
                  {incident.actions_taken.map((action, idx) => (
                    <div key={idx} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
                        {idx < incident.actions_taken.length - 1 && (
                          <div className="w-px flex-1 bg-gray-200 mt-1" />
                        )}
                      </div>
                      <div className="pb-4">
                        <p className="text-sm font-medium">{action.action}</p>
                        <p className="text-xs text-muted-foreground">
                          {action.by} - {action.date}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start" size="sm">Escalate to Administration</Button>
                <Button variant="outline" className="w-full justify-start" size="sm">Mark as Resolved</Button>
                <Button variant="outline" className="w-full justify-start" size="sm">Generate Report</Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
