'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Search,
  Plus,
  Filter,
  Users,
  Star,
  FolderKanban,
  Wallet,
} from 'lucide-react';

// TODO: Replace with real hooks after service migration
// import { useBuilders } from '@/hooks/solutions/use-builders';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function BuildersList() {
  const [searchQuery, setSearchQuery] = useState('');

  // Placeholder data
  const builders = [
    {
      id: '1',
      name: 'John Doe',
      email: 'john@jkkn.ac.in',
      department: { name: 'Computer Science' },
      skills: ['React', 'Node.js', 'TypeScript'],
      active_assignments: 2,
      completed_assignments: 15,
      total_earnings: 250000,
      is_active: true,
    },
    {
      id: '2',
      name: 'Jane Smith',
      email: 'jane@jkkn.ac.in',
      department: { name: 'IT' },
      skills: ['Python', 'Django', 'PostgreSQL'],
      active_assignments: 1,
      completed_assignments: 8,
      total_earnings: 180000,
      is_active: true,
    },
    {
      id: '3',
      name: 'Mike Johnson',
      email: 'mike@jkkn.ac.in',
      department: { name: 'Computer Science' },
      skills: ['Flutter', 'Firebase', 'Dart'],
      active_assignments: 0,
      completed_assignments: 5,
      total_earnings: 75000,
      is_active: false,
    },
  ];

  const filteredBuilders = builders.filter((builder) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      builder.name.toLowerCase().includes(query) ||
      builder.email.toLowerCase().includes(query) ||
      builder.skills.some((s) => s.toLowerCase().includes(query))
    );
  });

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Users className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{builders.length}</p>
              <p className="text-sm text-muted-foreground">Total Builders</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Star className="h-8 w-8 text-yellow-500" />
            <div>
              <p className="text-2xl font-bold">
                {builders.filter((b) => b.is_active).length}
              </p>
              <p className="text-sm text-muted-foreground">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <FolderKanban className="h-8 w-8 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">
                {builders.reduce((sum, b) => sum + b.active_assignments, 0)}
              </p>
              <p className="text-sm text-muted-foreground">Active Assignments</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Wallet className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold">
                {formatCurrency(builders.reduce((sum, b) => sum + b.total_earnings, 0))}
              </p>
              <p className="text-sm text-muted-foreground">Total Paid</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search builders or skills..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button variant="outline">
              <Filter className="mr-2 h-4 w-4" />
              Filter
            </Button>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Builder
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Builder</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Skills</TableHead>
                <TableHead className="text-center">Assignments</TableHead>
                <TableHead className="text-right">Earnings</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBuilders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No builders found
                  </TableCell>
                </TableRow>
              ) : (
                filteredBuilders.map((builder) => (
                  <TableRow key={builder.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>
                            {builder.name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{builder.name}</p>
                          <p className="text-sm text-muted-foreground">{builder.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{builder.department.name}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {builder.skills.slice(0, 3).map((skill) => (
                          <Badge key={skill} variant="secondary" className="text-xs">
                            {skill}
                          </Badge>
                        ))}
                        {builder.skills.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{builder.skills.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div>
                        <span className="font-medium">{builder.active_assignments}</span>
                        <span className="text-muted-foreground">
                          {' '}
                          / {builder.completed_assignments} completed
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(builder.total_earnings)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={builder.is_active ? 'default' : 'secondary'}>
                        {builder.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
