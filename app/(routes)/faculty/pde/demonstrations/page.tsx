'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCapabilities } from '@/hooks/pde/use-pde';
import { BeatLoader } from 'react-spinners';
import {
  Award,
  CheckCircle,
  RotateCcw,
  Eye,
  Sparkles,
} from 'lucide-react';

// Mock pending demonstrations type (until backend endpoint available)
interface PendingDemonstration {
  id: string;
  learner_name: string;
  learner_id: string;
  capability_name: string;
  capability_category: string;
  submitted_at: string;
  status: 'pending' | 'reviewed' | 'approved' | 'revision_requested';
  evidence_type: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending Review', color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  reviewed: { label: 'Reviewed', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300' },
  revision_requested: { label: 'Revision Requested', color: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300' },
};

export default function FacultyDemonstrationsPage() {
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const { data: capabilities, isLoading: loadingCapabilities } = useCapabilities(
    categoryFilter || undefined
  );

  // Demonstrations will come from a dedicated endpoint once available.
  // For now, this page provides the shell with empty state.
  const demonstrations: PendingDemonstration[] = [];
  const isLoading = false;

  const pendingCount = demonstrations.filter((d) => d.status === 'pending').length;

  return (
    <ContentLayout title="Capability Demonstrations">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Faculty', href: '/faculty' },
          { label: 'PDE', href: '/faculty/pde/dashboard' },
          { label: 'Demonstrations' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1" style={{ color: '#0b6d41' }}>
              Capability Demonstrations
            </h1>
            <p className="text-sm text-muted-foreground">
              Review Learner capability demonstrations and provide feedback
            </p>
          </div>
          {pendingCount > 0 && (
            <Badge className="bg-[#ffde59] text-amber-900 border-amber-300 text-sm px-3 py-1">
              {pendingCount} pending review{pendingCount !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        {/* Filter */}
        <Card className="bg-[#fbfbee]/30 dark:bg-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-muted-foreground">
                Filter by capability category:
              </span>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Categories</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                  <SelectItem value="analytical">Analytical</SelectItem>
                  <SelectItem value="creative">Creative</SelectItem>
                  <SelectItem value="leadership">Leadership</SelectItem>
                  <SelectItem value="communication">Communication</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Demonstrations Table */}
        <Card className="bg-[#fbfbee]/30 dark:bg-card">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center p-8">
                <BeatLoader color="#0b6d41" />
              </div>
            ) : demonstrations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Sparkles className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <h3 className="text-lg font-medium mb-1">No pending demonstrations</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  When Learners submit capability demonstrations, they will appear here for your review.
                  You can approve, provide feedback, or request revisions.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Learner</TableHead>
                    <TableHead>Capability</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {demonstrations.map((demo) => {
                    const statusConf = STATUS_CONFIG[demo.status] || STATUS_CONFIG.pending;
                    return (
                      <TableRow key={demo.id} className="hover:bg-muted/50">
                        <TableCell className="font-medium">{demo.learner_name}</TableCell>
                        <TableCell>{demo.capability_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize text-xs">
                            {demo.capability_category}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(demo.submitted_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`text-xs ${statusConf.color}`}>
                            {statusConf.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button size="sm" variant="outline" className="text-xs h-7">
                              <Eye className="h-3 w-3 mr-1" />
                              View
                            </Button>
                            {demo.status === 'pending' && (
                              <>
                                <Button
                                  size="sm"
                                  className="text-xs h-7 bg-[#0b6d41] hover:bg-[#0b6d41]/90"
                                >
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Approve
                                </Button>
                                <Button size="sm" variant="destructive" className="text-xs h-7">
                                  <RotateCcw className="h-3 w-3 mr-1" />
                                  Revise
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
