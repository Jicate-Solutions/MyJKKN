/**
 * Process Definition Detail Component
 * Displays full process definition with stages, SLA, and actions
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Edit, Trash2, Clock, Target, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ProcessExcellenceService } from '@/lib/services/process-excellence/process-excellence-service';
import { toast } from 'sonner';
import { PROCESS_CATEGORY_LABELS } from '@/types/process-excellence';
import type { ProcessDefinition } from '@/types/process-excellence';

interface ProcessDefinitionDetailProps {
  definition: ProcessDefinition;
}

export function ProcessDefinitionDetail({ definition }: ProcessDefinitionDetailProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await ProcessExcellenceService.deleteProcessDefinition(definition.id);
      toast.success('Process definition deleted successfully');
      router.push('/process-excellence/definitions');
      router.refresh();
    } catch (error) {
      console.error('[process-excellence] Error deleting definition:', error);
      toast.error('Failed to delete process definition');
    } finally {
      setIsDeleting(false);
    }
  };

  const totalExpectedHours = definition.stages.reduce(
    (sum, stage) => sum + stage.expected_duration_hours,
    0
  );

  const valueAddStages = definition.stages.filter((s) => s.is_value_add);
  const valueAddHours = valueAddStages.reduce(
    (sum, stage) => sum + stage.expected_duration_hours,
    0
  );
  const expectedValueAddRatio =
    totalExpectedHours > 0 ? (valueAddHours / totalExpectedHours) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <CardTitle className="text-2xl">{definition.name}</CardTitle>
                <Badge variant={definition.is_active ? 'default' : 'secondary'}>
                  {definition.is_active ? 'Active' : 'Inactive'}
                </Badge>
                <Badge variant="outline">{PROCESS_CATEGORY_LABELS[definition.category]}</Badge>
              </div>
              {definition.description && (
                <CardDescription className="text-base">{definition.description}</CardDescription>
              )}
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/process-excellence/definitions/${definition.id}/edit`}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Link>
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={isDeleting}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Process Definition?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete &quot;{definition.name}&quot; and all associated
                      data. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
                      {isDeleting ? 'Deleting...' : 'Delete'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Total Duration</p>
                <p className="text-lg font-semibold">{totalExpectedHours}h</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Value-Add Ratio</p>
                <p className="text-lg font-semibold">{expectedValueAddRatio.toFixed(1)}%</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <Target className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Stages</p>
                <p className="text-lg font-semibold">{definition.stages.length}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Process Stages */}
      <Card>
        <CardHeader>
          <CardTitle>Process Stages</CardTitle>
          <CardDescription>
            Sequential stages in this process ({valueAddStages.length} value-adding,{' '}
            {definition.stages.length - valueAddStages.length} non-value-adding)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Stage Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead>Value-Add</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {definition.stages.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No stages defined
                  </TableCell>
                </TableRow>
              ) : (
                definition.stages.map((stage, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{index + 1}</TableCell>
                    <TableCell className="font-medium">{stage.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {stage.description || '-'}
                    </TableCell>
                    <TableCell className="text-right">{stage.expected_duration_hours}h</TableCell>
                    <TableCell>
                      {stage.is_value_add ? (
                        <Badge variant="default" className="bg-green-500">
                          Value-Add
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Non Value-Add</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* SLA Targets */}
      <Card>
        <CardHeader>
          <CardTitle>SLA & Performance Targets</CardTitle>
          <CardDescription>Target metrics for this process</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Target Cycle Time</p>
              </div>
              <p className="text-2xl font-bold">
                {definition.target_cycle_time_hours
                  ? `${definition.target_cycle_time_hours}h`
                  : 'Not set'}
              </p>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Target Value-Add Ratio</p>
              </div>
              <p className="text-2xl font-bold">
                {definition.target_value_add_ratio
                  ? `${definition.target_value_add_ratio}%`
                  : 'Not set'}
              </p>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">SLA (Service Level)</p>
              </div>
              <p className="text-2xl font-bold">
                {definition.sla_hours ? `${definition.sla_hours}h` : 'Not set'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle>Metadata</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Institution:</span>
            <span className="font-medium">{definition.institution?.name || 'Unknown'}</span>
          </div>
          <Separator />
          <div className="flex justify-between">
            <span className="text-muted-foreground">Created:</span>
            <span className="font-medium">
              {new Date(definition.created_at).toLocaleDateString('en-IN', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              })}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Last Updated:</span>
            <span className="font-medium">
              {new Date(definition.updated_at).toLocaleDateString('en-IN', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              })}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
