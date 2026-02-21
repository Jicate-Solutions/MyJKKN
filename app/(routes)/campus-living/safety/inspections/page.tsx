'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, ClipboardCheck } from 'lucide-react';
import { useState } from 'react';

export default function InspectionsPage() {
  const [typeFilter, setTypeFilter] = useState('all');

  const inspections = [
    { id: '1', name: 'Fire Safety Audit', type: 'fire_safety', date: '2026-03-05', inspector: 'External - Fire Dept', status: 'scheduled', score: null },
    { id: '2', name: 'Electrical Safety Check', type: 'electrical', date: '2026-03-15', inspector: 'Internal - Maintenance', status: 'scheduled', score: null },
    { id: '3', name: 'Water Quality Test', type: 'health', date: '2026-03-20', inspector: 'External - Lab', status: 'scheduled', score: null },
    { id: '4', name: 'Fire Safety Inspection', type: 'fire_safety', date: '2026-01-10', inspector: 'External - Fire Dept', status: 'completed', score: 95 },
    { id: '5', name: 'Room Hygiene Check', type: 'hygiene', date: '2026-01-25', inspector: 'Internal - Warden', status: 'completed', score: 88 },
    { id: '6', name: 'Kitchen Inspection', type: 'health', date: '2025-12-15', inspector: 'External - FSSAI', status: 'completed', score: 91 },
  ];

  const filteredInspections = inspections.filter(
    (i) => typeFilter === 'all' || i.type === typeFilter
  );

  return (
    <ContentLayout title="Inspections">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Safety Inspections</h1>
            <p className="text-muted-foreground">Schedule and track safety inspections and audits</p>
          </div>
          <Button asChild>
            <Link href="/campus-living/safety/inspections/new">
              <Plus className="mr-2 h-4 w-4" />
              Schedule Inspection
            </Link>
          </Button>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Scheduled</p>
              <p className="text-2xl font-bold text-blue-600">{inspections.filter(i => i.status === 'scheduled').length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Completed This Year</p>
              <p className="text-2xl font-bold text-green-600">{inspections.filter(i => i.status === 'completed').length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Avg. Score</p>
              <p className="text-2xl font-bold">
                {Math.round(inspections.filter(i => i.score).reduce((sum, i) => sum + (i.score || 0), 0) / inspections.filter(i => i.score).length)}%
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5" />
                All Inspections
              </CardTitle>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Filter type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="fire_safety">Fire Safety</SelectItem>
                  <SelectItem value="electrical">Electrical</SelectItem>
                  <SelectItem value="health">Health / FSSAI</SelectItem>
                  <SelectItem value="hygiene">Hygiene</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Inspection</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Inspector</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInspections.map((inspection) => (
                  <TableRow key={inspection.id}>
                    <TableCell className="font-medium">{inspection.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{inspection.type.replace('_', ' ')}</Badge>
                    </TableCell>
                    <TableCell>{inspection.date}</TableCell>
                    <TableCell className="text-sm">{inspection.inspector}</TableCell>
                    <TableCell>
                      {inspection.score !== null ? (
                        <span className={`font-medium ${inspection.score >= 90 ? 'text-green-600' : inspection.score >= 70 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {inspection.score}%
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={inspection.status === 'completed' ? 'default' : 'secondary'}>
                        {inspection.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/campus-living/safety/inspections/${inspection.id}`}>View</Link>
                      </Button>
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
