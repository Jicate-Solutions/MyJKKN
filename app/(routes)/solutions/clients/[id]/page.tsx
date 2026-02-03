'use client';

import { use } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  MapPin,
  PenSquare,
  FileText,
  Plus,
} from 'lucide-react';

interface ClientDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ClientDetailPage({ params }: ClientDetailPageProps) {
  const { id } = use(params);

  // Placeholder data
  const client = {
    id,
    name: 'ABC University',
    contact_person: 'Dr. John Smith',
    contact_email: 'john@abc-university.edu',
    contact_phone: '+91 98765 43210',
    address: '123 University Road, Chennai, Tamil Nadu 600001',
    source_type: 'direct',
    partner_status: 'yi',
    notes: 'Long-term partner for educational software solutions.',
    solutions: [
      { id: '1', code: 'JKKN-SOL-2026-001', title: 'Student Portal', status: 'active' },
      { id: '2', code: 'JKKN-SOL-2026-005', title: 'Library Management', status: 'completed' },
    ],
  };

  const partnerConfig: Record<string, { label: string; color: string }> = {
    standard: { label: 'Standard', color: 'bg-gray-100 text-gray-800' },
    yi: { label: 'YI Member', color: 'bg-blue-100 text-blue-800' },
    alumni: { label: 'Alumni', color: 'bg-green-100 text-green-800' },
  };

  const partner = partnerConfig[client.partner_status] || partnerConfig.standard;

  return (
    <ContentLayout title="Client Details">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Clients', href: '/solutions/clients' },
          { label: client.name },
        ]}
      />
      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/solutions/clients">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <Badge className={partner.color}>{partner.label}</Badge>
              </div>
              <h1 className="text-2xl font-bold">{client.name}</h1>
            </div>
          </div>
          <Button>
            <PenSquare className="mr-2 h-4 w-4" />
            Edit Client
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Contact Info */}
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Contact Person</p>
                <p className="font-medium">{client.contact_person}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <Mail className="h-3 w-3" /> Email
                </p>
                <a href={`mailto:${client.contact_email}`} className="text-primary hover:underline">
                  {client.contact_email}
                </a>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <Phone className="h-3 w-3" /> Phone
                </p>
                <a href={`tel:${client.contact_phone}`} className="text-primary hover:underline">
                  {client.contact_phone}
                </a>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Address
                </p>
                <p>{client.address}</p>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{client.notes || 'No notes added.'}</p>
            </CardContent>
          </Card>
        </div>

        {/* Solutions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Solutions
              </CardTitle>
              <CardDescription>{client.solutions.length} solutions for this client</CardDescription>
            </div>
            <Button size="sm" asChild>
              <Link href={`/solutions/new?client=${client.id}`}>
                <Plus className="mr-2 h-4 w-4" />
                New Solution
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {client.solutions.map((solution) => (
                <div
                  key={solution.id}
                  className="flex items-center justify-between p-4 rounded-lg border"
                >
                  <div>
                    <Link
                      href={`/solutions/${solution.id}`}
                      className="font-medium hover:underline"
                    >
                      {solution.title}
                    </Link>
                    <p className="text-sm text-muted-foreground">{solution.code}</p>
                  </div>
                  <Badge variant={solution.status === 'active' ? 'default' : 'secondary'}>
                    {solution.status}
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
