'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Hammer, BookOpen, Video } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

// TODO: Replace with real hooks after service migration
// import { useSolution, useUpdateSolution } from '@/hooks/solutions/use-solutions';

interface EditSolutionFormProps {
  solutionId: string;
}

type SolutionType = 'software' | 'training' | 'content';

const typeConfig: Record<SolutionType, { icon: React.ElementType; color: string }> = {
  software: { icon: Hammer, color: 'text-blue-600' },
  training: { icon: BookOpen, color: 'text-green-600' },
  content: { icon: Video, color: 'text-purple-600' },
};

export function EditSolutionForm({ solutionId }: EditSolutionFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Placeholder data until hooks are migrated
  const solution = {
    id: solutionId,
    solution_code: 'JKKN-SOL-2026-001',
    title: 'Student Portal Enhancement',
    solution_type: 'software' as SolutionType,
    status: 'active',
    problem_statement: 'Current student portal lacks modern features.',
    description: 'Complete overhaul of the student portal.',
    client_id: '1',
    lead_department_id: '1',
    base_price: 500000,
    final_price: 450000,
    start_date: '2026-01-15',
    target_date: '2026-06-15',
  };
  const isLoading = false;

  const clients = [
    { id: '1', name: 'ABC University' },
    { id: '2', name: 'XYZ Corp' },
  ];
  const departments = [
    { id: '1', name: 'Computer Science' },
    { id: '2', name: 'Information Technology' },
  ];

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const formData = new FormData(e.currentTarget);
      console.log('Updating solution:', Object.fromEntries(formData));

      toast.success('Solution updated successfully');
      router.push(`/solutions/${solutionId}`);
    } catch (error) {
      toast.error('Failed to update solution');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const Icon = typeConfig[solution.solution_type].icon;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className={`h-5 w-5 ${typeConfig[solution.solution_type].color}`} />
          {solution.solution_code}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                name="title"
                defaultValue={solution.title}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="client_id">Client *</Label>
              <Select name="client_id" defaultValue={solution.client_id}>
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lead_department_id">Lead Department *</Label>
              <Select name="lead_department_id" defaultValue={solution.lead_department_id}>
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select name="status" defaultValue={solution.status}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="in_amc">In AMC</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="base_price">Base Price (INR)</Label>
              <Input
                id="base_price"
                name="base_price"
                type="number"
                defaultValue={solution.base_price}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="final_price">Final Price (INR)</Label>
              <Input
                id="final_price"
                name="final_price"
                type="number"
                defaultValue={solution.final_price}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="start_date">Start Date</Label>
              <Input
                id="start_date"
                name="start_date"
                type="date"
                defaultValue={solution.start_date}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="target_date">Target Completion</Label>
              <Input
                id="target_date"
                name="target_date"
                type="date"
                defaultValue={solution.target_date}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="problem_statement">Problem Statement</Label>
            <Textarea
              id="problem_statement"
              name="problem_statement"
              defaultValue={solution.problem_statement}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={solution.description}
              rows={4}
            />
          </div>

          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
