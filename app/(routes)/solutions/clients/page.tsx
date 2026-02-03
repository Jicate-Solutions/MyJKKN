import { Metadata } from 'next';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import Link from 'next/link';
import { Plus, Search, Building2, Mail, Phone, ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Clients | Solutions Hub',
  description: 'Manage clients',
};

export default function ClientsPage() {
  // Placeholder data
  const clients = [
    {
      id: '1',
      name: 'ABC University',
      contact_person: 'Dr. John Smith',
      contact_email: 'john@abc-university.edu',
      contact_phone: '+91 98765 43210',
      source_type: 'direct',
      partner_status: 'yi',
      solution_count: 3,
      is_active: true,
    },
    {
      id: '2',
      name: 'XYZ Corporation',
      contact_person: 'Ms. Sarah Johnson',
      contact_email: 'sarah@xyz-corp.com',
      contact_phone: '+91 98765 43211',
      source_type: 'referral',
      partner_status: 'standard',
      solution_count: 2,
      is_active: true,
    },
    {
      id: '3',
      name: 'DEF Institute',
      contact_person: 'Prof. Kumar',
      contact_email: 'kumar@def-institute.ac.in',
      contact_phone: '+91 98765 43212',
      source_type: 'alumni',
      partner_status: 'alumni',
      solution_count: 1,
      is_active: true,
    },
  ];

  const partnerConfig: Record<string, { label: string; color: string }> = {
    standard: { label: 'Standard', color: 'bg-gray-100 text-gray-800' },
    yi: { label: 'YI Member', color: 'bg-blue-100 text-blue-800' },
    alumni: { label: 'Alumni', color: 'bg-green-100 text-green-800' },
    mou: { label: 'MoU Partner', color: 'bg-purple-100 text-purple-800' },
    referral: { label: 'Referral', color: 'bg-orange-100 text-orange-800' },
  };

  const sourceConfig: Record<string, string> = {
    direct: 'Direct',
    referral: 'Referral',
    alumni: 'Alumni Network',
    placement: 'Placement',
    clinical: 'Clinical',
    yi: 'Young Indians',
    intent: 'Intent Platform',
  };

  return (
    <ContentLayout title="Clients">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Clients' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Clients</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Manage clients and their solutions
            </p>
          </div>
          <Button asChild>
            <Link href="/solutions/clients/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Client
            </Link>
          </Button>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="py-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search clients..." className="pl-10" />
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Partner Status</TableHead>
                  <TableHead className="text-center">Solutions</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => {
                  const partner = partnerConfig[client.partner_status];
                  return (
                    <TableRow key={client.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-full bg-muted">
                            <Building2 className="h-4 w-4" />
                          </div>
                          <div>
                            <Link
                              href={`/solutions/clients/${client.id}`}
                              className="font-medium hover:underline"
                            >
                              {client.name}
                            </Link>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-medium">{client.contact_person}</p>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {client.contact_email}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {client.contact_phone}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{sourceConfig[client.source_type]}</TableCell>
                      <TableCell>
                        <Badge className={partner.color}>{partner.label}</Badge>
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {client.solution_count}
                      </TableCell>
                      <TableCell>
                        <Badge variant={client.is_active ? 'default' : 'secondary'}>
                          {client.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/solutions/clients/${client.id}`}>
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
