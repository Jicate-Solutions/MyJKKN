'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { ArrowLeft, Save, Users, X, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Link from 'next/link';
import { toast } from 'sonner';
import { useBulkUpdateLearners } from '@/hooks/use-learner-profiles';
import { LearnerProfileService } from '@/lib/services/learner-profile-service';

interface LearnerSummary {
  id: string;
  name: string;
  admission_number: string;
  status: string;
  section_name?: string;
}

export default function BulkEditLearnersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedIds = searchParams.get('ids')?.split(',').filter(Boolean) || [];

  const [learners, setLearners] = useState<LearnerSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [bulkField, setBulkField] = useState<string>('');
  const [bulkValue, setBulkValue] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const bulkUpdate = useBulkUpdateLearners();

  useEffect(() => {
    async function loadLearners() {
      if (selectedIds.length === 0) {
        setIsLoading(false);
        return;
      }
      try {
        const profiles = await Promise.all(
          selectedIds.map(id => LearnerProfileService.getLearnerProfile(id))
        );
        setLearners(
          profiles
            .filter(Boolean)
            .map((p: any) => ({
              id: p.id,
              name: p.name || 'Unknown',
              admission_number: p.admission_number || '-',
              status: p.status || 'active',
              section_name: p.sections?.name || p.section_name || '-',
            }))
        );
      } catch (err) {
        toast.error('Failed to load learner profiles');
      } finally {
        setIsLoading(false);
      }
    }
    loadLearners();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRemoveLearner = (id: string) => {
    setLearners(prev => prev.filter(l => l.id !== id));
    if (learners.length <= 1) {
      router.push('/learners/profiles');
    }
  };

  const handleBulkApply = async () => {
    if (!bulkField || !bulkValue) {
      toast.error('Please select a field and value to update');
      return;
    }

    const currentIds = learners.map(l => l.id);
    if (currentIds.length === 0) {
      toast.error('No learners selected');
      return;
    }

    setIsSubmitting(true);
    try {
      const updates = currentIds.map(id => ({
        id,
        [bulkField]: bulkValue,
      }));
      const result = await bulkUpdate.mutateAsync(updates);
      toast.success(`Updated ${result.success.length} learners successfully`);
      if (result.failed.length > 0) {
        toast.error(`Failed to update ${result.failed.length} learners`);
      }
      router.push('/learners/profiles');
    } catch {
      toast.error('Bulk update failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (selectedIds.length === 0) {
    return (
      <ContentLayout title="Bulk Edit Learners">
        <div className="max-w-2xl mx-auto">
          <PageBreadcrumb
            items={[
              { label: 'Learners', href: '/learners/profiles' },
              { label: 'Bulk Edit' },
            ]}
          />
          <Card className="mt-6">
            <CardContent className="pt-6 text-center">
              <Users className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
              <CardTitle className="text-lg mb-2">No Learners Selected</CardTitle>
              <CardDescription className="mb-4">
                Select learners from the profiles page first, then click &ldquo;Bulk Edit&rdquo; to modify them.
              </CardDescription>
              <Button asChild>
                <Link href="/learners/profiles">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Go to Learner Profiles
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Bulk Edit Learners">
      <div className="max-w-4xl mx-auto space-y-6">
        <PageBreadcrumb
          items={[
            { label: 'Learners', href: '/learners/profiles' },
            { label: 'Bulk Edit' },
          ]}
        />

        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/learners/profiles">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Bulk Edit Learners</h2>
            <p className="text-muted-foreground">
              Apply changes to {learners.length} selected learner{learners.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Update Field</CardTitle>
            <CardDescription>
              Choose a field and value to apply to all selected learners
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Field to Update</Label>
                <Select value={bulkField} onValueChange={setBulkField}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select field..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lifecycle_status">Lifecycle Status</SelectItem>
                    <SelectItem value="blood_group">Blood Group</SelectItem>
                    <SelectItem value="bus_route">Bus Route</SelectItem>
                    <SelectItem value="hostel_type">Hostel Type</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>New Value</Label>
                {bulkField === 'lifecycle_status' ? (
                  <Select value={bulkValue} onValueChange={setBulkValue}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="graduated">Graduated</SelectItem>
                      <SelectItem value="exited">Exited</SelectItem>
                    </SelectContent>
                  </Select>
                ) : bulkField === 'blood_group' ? (
                  <Select value={bulkValue} onValueChange={setBulkValue}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select blood group..." />
                    </SelectTrigger>
                    <SelectContent>
                      {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
                        <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <input
                    type="text"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Enter new value..."
                    value={bulkValue}
                    onChange={(e) => setBulkValue(e.target.value)}
                  />
                )}
              </div>
            </div>

            {bulkField === 'lifecycle_status' && bulkValue === 'exited' && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Setting status to &ldquo;Exited&rdquo; will also disable the learner&apos;s account login.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Selected Learners ({learners.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Admission No.</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {learners.map(learner => (
                    <TableRow key={learner.id}>
                      <TableCell className="font-medium">{learner.name}</TableCell>
                      <TableCell>{learner.admission_number}</TableCell>
                      <TableCell>{learner.section_name}</TableCell>
                      <TableCell>
                        <Badge variant={learner.status === 'active' ? 'default' : 'secondary'}>
                          {learner.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleRemoveLearner(learner.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="outline" asChild>
            <Link href="/learners/profiles">Cancel</Link>
          </Button>
          <Button
            onClick={handleBulkApply}
            disabled={!bulkField || !bulkValue || isSubmitting || learners.length === 0}
          >
            <Save className="mr-2 h-4 w-4" />
            {isSubmitting ? 'Updating...' : `Apply to ${learners.length} Learners`}
          </Button>
        </div>
      </div>
    </ContentLayout>
  );
}
