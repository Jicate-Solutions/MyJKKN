'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { Plus, Search, AlertTriangle } from 'lucide-react';
import { useState } from 'react';

export default function IncidentsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');

  // TODO: Replace with actual hook
  const incidents = [
    { id: '1', title: 'Unauthorized entry attempt', type: 'security', severity: 'medium', location: 'Block A - Main Gate', reported_by: 'Security Guard', date: '2026-02-21', status: 'investigating' },
    { id: '2', title: 'Minor injury during sports', type: 'medical', severity: 'low', location: 'Sports Ground', reported_by: 'Warden', date: '2026-02-20', status: 'resolved' },
    { id: '3', title: 'Fire alarm triggered - false', type: 'fire', severity: 'high', location: 'Block C - 3rd Floor', reported_by: 'Fire Marshal', date: '2026-02-19', status: 'resolved' },
    { id: '4', title: 'Theft complaint - mobile phone', type: 'theft', severity: 'medium', location: 'Block B - Room 205', reported_by: 'Priya Sharma', date: '2026-02-18', status: 'investigating' },
    { id: '5', title: 'Ragging complaint (verbal)', type: 'ragging', severity: 'high', location: 'Block A - Common Area', reported_by: 'Anonymous', date: '2026-02-17', status: 'investigating' },
  ];

  const filteredIncidents = incidents.filter((i) => {
    const matchesSearch = i.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'all' || i.type === typeFilter;
    const matchesSeverity = severityFilter === 'all' || i.severity === severityFilter;
    return matchesSearch && matchesType && matchesSeverity;
  });

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
    switch (status) {
      case 'investigating': return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">Investigating</Badge>;
      case 'resolved': return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Resolved</Badge>;
      case 'open': return <Badge variant="outline">Open</Badge>;
      case 'closed': return <Badge variant="secondary">Closed</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <ContentLayout title="Incidents">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Safety Incidents</h1>
            <p className="text-muted-foreground">Track and manage safety incidents across campus</p>
          </div>
          <Button asChild>
            <Link href="/campus-living/safety/incidents/new">
              <Plus className="mr-2 h-4 w-4" />
              Report Incident
            </Link>
          </Button>
        </div>

        {/* Summary */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total This Month</p>
              <p className="text-2xl font-bold">{incidents.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Investigating</p>
              <p className="text-2xl font-bold text-purple-600">{incidents.filter(i => i.status === 'investigating').length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">High Severity</p>
              <p className="text-2xl font-bold text-orange-600">{incidents.filter(i => i.severity === 'high' || i.severity === 'critical').length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Resolved</p>
              <p className="text-2xl font-bold text-green-600">{incidents.filter(i => i.status === 'resolved').length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search incidents..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                  <SelectItem value="medical">Medical</SelectItem>
                  <SelectItem value="fire">Fire</SelectItem>
                  <SelectItem value="theft">Theft</SelectItem>
                  <SelectItem value="ragging">Ragging</SelectItem>
                </SelectContent>
              </Select>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severity</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Incident</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Reported By</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredIncidents.map((incident) => (
                  <TableRow key={incident.id}>
                    <TableCell className="font-medium">{incident.title}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{incident.type}</Badge></TableCell>
                    <TableCell>{getSeverityBadge(incident.severity)}</TableCell>
                    <TableCell className="text-sm">{incident.location}</TableCell>
                    <TableCell className="text-sm">{incident.reported_by}</TableCell>
                    <TableCell className="text-sm">{incident.date}</TableCell>
                    <TableCell>{getStatusBadge(incident.status)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/campus-living/safety/incidents/${incident.id}`}>View</Link>
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
