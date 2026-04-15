'use client';

import { use } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ClipboardCheck, CalendarDays, User, MapPin, CheckCircle2, XCircle } from 'lucide-react';

interface InspectionDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function InspectionDetailPage({ params }: InspectionDetailPageProps) {
  const { id } = use(params);

  const inspection = {
    id,
    name: 'Fire Safety Inspection',
    type: 'Fire Safety',
    date: '2026-01-10',
    inspector: 'District Fire Officer - Kovilpatti',
    status: 'completed',
    score: 95,
    location: 'All Blocks',
    notes: 'Annual mandatory fire safety audit by the district fire department.',
  };

  const findings = [
    { area: 'Fire Extinguishers', score: 100, status: 'pass', notes: 'All extinguishers serviced and within expiry' },
    { area: 'Emergency Exits', score: 95, status: 'pass', notes: 'All exits clear and properly marked' },
    { area: 'Fire Alarm System', score: 100, status: 'pass', notes: 'System tested and functional' },
    { area: 'Electrical Wiring', score: 85, status: 'pass', notes: 'Minor insulation wear in Block D corridor - scheduled for repair' },
    { area: 'Fire Drill Records', score: 90, status: 'pass', notes: 'Last drill conducted Nov 2025. Next due within 60 days' },
    { area: 'Kitchen Fire Suppression', score: 100, status: 'pass', notes: 'Hood suppression system functional' },
  ];

  const followUps = [
    { item: 'Replace worn wiring insulation in Block D corridor', deadline: '2026-02-28', status: 'completed' },
    { item: 'Conduct fire drill before Mar 2026', deadline: '2026-03-15', status: 'pending' },
  ];

  return (
    <ContentLayout title="Inspection Detail">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/campus-living/safety/inspections"><ArrowLeft className="mr-2 h-4 w-4" />Back</Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{inspection.name}</h1>
              <p className="text-muted-foreground">{inspection.type} | {inspection.date}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Badge variant="default">Completed</Badge>
            <Badge className={`${inspection.score >= 90 ? 'bg-green-100 text-green-800 hover:bg-green-100' : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100'}`}>
              Score: {inspection.score}%
            </Badge>
          </div>
        </div>

        {/* Info */}
        <Card>
          <CardHeader><CardTitle>Inspection Information</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
              <div><p className="text-sm text-muted-foreground">Type</p><p className="font-medium">{inspection.type}</p></div>
            </div>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <div><p className="text-sm text-muted-foreground">Date</p><p className="font-medium">{inspection.date}</p></div>
            </div>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <div><p className="text-sm text-muted-foreground">Inspector</p><p className="font-medium">{inspection.inspector}</p></div>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <div><p className="text-sm text-muted-foreground">Location</p><p className="font-medium">{inspection.location}</p></div>
            </div>
          </CardContent>
        </Card>

        {/* Findings */}
        <Card>
          <CardHeader><CardTitle>Findings</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {findings.map((finding) => (
                <div key={finding.area} className="flex items-start justify-between p-3 border rounded-lg">
                  <div className="flex items-start gap-3">
                    {finding.status === 'pass' ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                    )}
                    <div>
                      <p className="font-medium">{finding.area}</p>
                      <p className="text-sm text-muted-foreground">{finding.notes}</p>
                    </div>
                  </div>
                  <Badge className={`${finding.score >= 90 ? 'bg-green-100 text-green-800 hover:bg-green-100' : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100'}`}>
                    {finding.score}%
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Follow-ups */}
        <Card>
          <CardHeader><CardTitle>Follow-up Actions</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {followUps.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{item.item}</p>
                    <p className="text-sm text-muted-foreground">Deadline: {item.deadline}</p>
                  </div>
                  <Badge variant={item.status === 'completed' ? 'default' : 'secondary'}>
                    {item.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
