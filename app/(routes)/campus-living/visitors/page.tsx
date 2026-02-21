'use client';

import Link from 'next/link';
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
  Users,
  UserPlus,
  Search,
  LogIn,
  LogOut,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { useState } from 'react';

export default function VisitorsPage() {
  const [searchQuery, setSearchQuery] = useState('');

  // TODO: Replace with actual hook
  // const { data: visitors, isLoading } = useHostelVisitors();

  const visitors = [
    { id: '1', name: 'Mr. Ramesh Kumar', phone: '+91 98765 43210', visiting: 'Arun Kumar (CS2024001)', purpose: 'Parent visit', check_in: '10:30 AM', check_out: null, id_type: 'Aadhaar', status: 'checked_in' },
    { id: '2', name: 'Ms. Lakshmi Devi', phone: '+91 87654 32109', visiting: 'Priya Sharma (EC2024015)', purpose: 'Parent visit', check_in: '11:00 AM', check_out: null, id_type: 'Voter ID', status: 'checked_in' },
    { id: '3', name: 'Suresh (Electrician)', phone: '+91 76543 21098', visiting: 'Block A - Room 105', purpose: 'Maintenance', check_in: '9:00 AM', check_out: '11:45 AM', id_type: 'Company ID', status: 'checked_out' },
    { id: '4', name: 'Dr. Meena', phone: '+91 65432 10987', visiting: 'Medical Room', purpose: 'Medical visit', check_in: '2:00 PM', check_out: null, id_type: 'Hospital ID', status: 'checked_in' },
  ];

  const filteredVisitors = visitors.filter(
    (v) =>
      v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.visiting.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <ContentLayout title="Visitors">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Visitor Management</h1>
            <p className="text-muted-foreground">
              Track visitor check-in/check-out for hostel blocks
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/campus-living/visitors/known">
                <ShieldCheck className="mr-2 h-4 w-4" />
                Known Visitors
              </Link>
            </Button>
            <Button asChild>
              <Link href="/campus-living/visitors/register">
                <UserPlus className="mr-2 h-4 w-4" />
                New Visitor
              </Link>
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Currently Inside</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {visitors.filter((v) => v.status === 'checked_in').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Today Total</CardTitle>
              <LogIn className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{visitors.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Checked Out</CardTitle>
              <LogOut className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {visitors.filter((v) => v.status === 'checked_out').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Overstay Alerts</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">0</div>
            </CardContent>
          </Card>
        </div>

        {/* Visitors Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search visitors..."
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
                  <TableHead>Visitor Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Visiting</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>ID Type</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead>Check-out</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVisitors.map((visitor) => (
                  <TableRow key={visitor.id}>
                    <TableCell className="font-medium">{visitor.name}</TableCell>
                    <TableCell>{visitor.phone}</TableCell>
                    <TableCell>{visitor.visiting}</TableCell>
                    <TableCell>{visitor.purpose}</TableCell>
                    <TableCell>{visitor.id_type}</TableCell>
                    <TableCell>{visitor.check_in}</TableCell>
                    <TableCell>{visitor.check_out || '-'}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          visitor.status === 'checked_in'
                            ? 'bg-green-100 text-green-800 hover:bg-green-100'
                            : ''
                        }
                        variant={visitor.status === 'checked_out' ? 'secondary' : 'default'}
                      >
                        {visitor.status === 'checked_in' ? 'Inside' : 'Left'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/campus-living/visitors/${visitor.id}`}>View</Link>
                        </Button>
                        {visitor.status === 'checked_in' && (
                          <Button variant="outline" size="sm">
                            <LogOut className="mr-1 h-3 w-3" />
                            Check-out
                          </Button>
                        )}
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
