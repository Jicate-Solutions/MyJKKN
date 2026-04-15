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
  Loader2,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useHostelVisitors } from '@/hooks/campus-living/use-hostel-visitors';

export default function KnownVisitorsPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const [searchQuery, setSearchQuery] = useState('');

  const { data: visitorData, isLoading } = useHostelVisitors(institutionId);
  const allVisitors = visitorData?.data || [];

  // Derive known visitors: visitors who have appeared more than once (by phone number)
  const visitorCountMap = new Map<string, { visitor: typeof allVisitors[0]; count: number }>();
  for (const v of allVisitors) {
    const existing = visitorCountMap.get(v.visitor_phone);
    if (existing) {
      existing.count += 1;
    } else {
      visitorCountMap.set(v.visitor_phone, { visitor: v, count: 1 });
    }
  }
  const knownVisitors = Array.from(visitorCountMap.values());

  const filteredVisitors = knownVisitors.filter(
    (entry) =>
      entry.visitor.visitor_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.visitor.visitor_phone.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <ContentLayout title="Known Visitors">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

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
                  <TableHead>Visitor</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Relationship</TableHead>
                  <TableHead>Total Visits</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVisitors.map((entry) => (
                  <TableRow key={entry.visitor.id}>
                    <TableCell className="font-medium">{entry.visitor.visitor_name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Phone className="h-3 w-3" />
                        {entry.visitor.visitor_phone}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{entry.visitor.visitor_relationship}</Badge>
                    </TableCell>
                    <TableCell>{entry.count}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
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
