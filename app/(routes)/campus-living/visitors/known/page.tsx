'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ShieldCheck,
  Plus,
  Search,
  Phone,
  Edit,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';

export default function KnownVisitorsPage() {
  const [searchQuery, setSearchQuery] = useState('');

  // TODO: Replace with actual hook
  // const { data: knownVisitors, isLoading } = useKnownVisitors();

  const knownVisitors = [
    { id: '1', name: 'Mr. Ramesh Kumar', phone: '+91 98765 43210', relationship: 'Parent', student: 'Arun Kumar (CS2024001)', visits: 12, pre_approved: true, valid_until: '2026-06-30' },
    { id: '2', name: 'Ms. Lakshmi Devi', phone: '+91 87654 32109', relationship: 'Parent', student: 'Priya Sharma (EC2024015)', visits: 8, pre_approved: true, valid_until: '2026-06-30' },
    { id: '3', name: 'Electrician Suresh', phone: '+91 76543 21098', relationship: 'Vendor', student: 'Maintenance Team', visits: 24, pre_approved: true, valid_until: '2026-12-31' },
    { id: '4', name: 'Dr. Meena', phone: '+91 65432 10987', relationship: 'Medical', student: 'Medical Room', visits: 15, pre_approved: true, valid_until: '2026-12-31' },
    { id: '5', name: 'Mr. Subramaniam', phone: '+91 54321 09876', relationship: 'Guardian', student: 'Rahul Patel (ME2024003)', visits: 5, pre_approved: false, valid_until: null },
  ];

  const filteredVisitors = knownVisitors.filter(
    (v) =>
      v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.student.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <ContentLayout title="Known Visitors">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Known / Pre-approved Visitors</h1>
            <p className="text-muted-foreground">
              Manage pre-approved visitors for faster check-in
            </p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Known Visitor
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search visitors or students..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Visitor</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Relationship</TableHead>
                  <TableHead>Associated With</TableHead>
                  <TableHead>Total Visits</TableHead>
                  <TableHead>Pre-approved</TableHead>
                  <TableHead>Valid Until</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVisitors.map((visitor) => (
                  <TableRow key={visitor.id}>
                    <TableCell className="font-medium">{visitor.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Phone className="h-3 w-3" />
                        {visitor.phone}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{visitor.relationship}</Badge>
                    </TableCell>
                    <TableCell>{visitor.student}</TableCell>
                    <TableCell>{visitor.visits}</TableCell>
                    <TableCell>
                      {visitor.pre_approved ? (
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                          <ShieldCheck className="mr-1 h-3 w-3" />
                          Approved
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Not Approved</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {visitor.valid_until
                        ? new Date(visitor.valid_until).toLocaleDateString()
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
