'use client';

import { useEffect, useState } from 'react';
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
import { Loader2, Hammer, BookOpen, Video, AlertCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useSolution, useUpdateSolution } from '@/hooks/solutions/use-solutions';
import { useClients } from '@/hooks/solutions/use-clients';
import { useDepartments } from '@/hooks/organization/use-departments';

interface EditSolutionFormProps {
  solutionId: string;
}

type SolutionType = 'software' | 'training' | 'content';
type SolutionStatus = 'active' | 'on_hold' | 'completed' | 'cancelled' | 'in_amc';

const typeConfig: Record<SolutionType, { icon: React.ElementType; color: string; label: string }> = {
  software: { icon: Hammer, color: 'text-blue-600', label: 'Software Development' },
  training: { icon: BookOpen, color: 'text-green-600', label: 'Training Program' },
  content: { icon: Video, color: 'text-purple-600', label: 'Content Production' },
};

const statusOptions: { value: SolutionStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'in_amc', label: 'In AMC' },
];

export function EditSolutionForm({ solutionId }: EditSolutionFormProps) {
  const router = useRouter();

  // Form state
  const [title, setTitle] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
  const [status, setStatus] = useState<SolutionStatus>('active');
  const [basePrice, setBasePrice] = useState('');
  const [finalPrice, setFinalPrice] = useState('');
  const [startDate, setStartDate] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [description, setDescription] = useState('');

  // Fetch solution data
  const { data: solution, isLoading: solutionLoading, error: solutionError } = useSolution(solutionId);

  // Fetch clients from database
  const { data: clientsData, isLoading: clientsLoading, error: clientsError } = useClients({
    is_active: true,
    limit: 100,
  });

  // Fetch departments from database
  const { data: departmentsData, isLoading: departmentsLoading, error: departmentsError } = useDepartments({
    isActive: true,
    limit: 100,
  });

  // Update solution mutation
  const updateSolution = useUpdateSolution();

  const clients = clientsData?.data || [];
  const departments = departmentsData?.data || [];

  // Populate form when solution data loads
  useEffect(() => {
    if (solution) {
      setTitle(solution.title || '');
      setSelectedClientId(solution.client_id || '');
      setSelectedDepartmentId(solution.lead_department_id || '');
      setStatus((solution.status as SolutionStatus) || 'active');
      setBasePrice(solution.base_price?.toString() || '');
      setFinalPrice(solution.final_price?.toString() || '');
      setStartDate(solution.start_date || '');
      setTargetDate(solution.target_date || '');
      setDescription(solution.description || '');
    }
  }, [solution]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!title || !selectedClientId || !selectedDepartmentId) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      await updateSolution.mutateAsync({
        id: solutionId,
        input: {
          title,
          lead_department_id: selectedDepartmentId,
          status,
          base_price: basePrice ? parseFloat(basePrice) : undefined,
          final_price: finalPrice ? parseFloat(finalPrice) : undefined,
          start_date: startDate || undefined,
          target_date: targetDate || undefined,
          description: description || undefined,
        },
      });

      toast.success('Solution updated successfully');
      router.push(`/solutions/${solutionId}`);
    } catch (error) {
      console.error('Failed to update solution:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update solution');
    }
  };

  const isLoading = solutionLoading || clientsLoading || departmentsLoading;
  const hasError = solutionError || clientsError || departmentsError;

  if (solutionLoading) {
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

  if (solutionError || !solution) {
    return (
      <Card>
        <CardContent className="py-10">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <div>
              <h3 className="font-semibold">Solution not found</h3>
              <p className="text-sm text-muted-foreground">
                The solution you are trying to edit does not exist or you don&apos;t have permission to access it.
              </p>
            </div>
            <Button variant="outline" onClick={() => router.back()}>
              Go Back
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const solutionType = solution.solution_type as SolutionType;
  const typeInfo = typeConfig[solutionType] || typeConfig.software;
  const Icon = typeInfo.icon;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className={`h-5 w-5 ${typeInfo.color}`} />
          <span>{solution.solution_code}</span>
          <span className="text-muted-foreground font-normal">- {typeInfo.label}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasError && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span>Failed to load some data. Please refresh the page.</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="client_id">Client *</Label>
              {clientsLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select
                  value={selectedClientId}
                  onValueChange={setSelectedClientId}
                  disabled // Client cannot be changed after creation
                >
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
              )}
              <p className="text-xs text-muted-foreground">Client cannot be changed after creation</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lead_department_id">Lead Department *</Label>
              {departmentsLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select
                  value={selectedDepartmentId}
                  onValueChange={setSelectedDepartmentId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.department_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as SolutionStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="base_price">Base Price (INR)</Label>
              <Input
                id="base_price"
                type="number"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                min="0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="final_price">Final Price (INR)</Label>
              <Input
                id="final_price"
                type="number"
                value={finalPrice}
                onChange={(e) => setFinalPrice(e.target.value)}
                min="0"
              />
              <p className="text-xs text-muted-foreground">
                Auto-calculated from base price and discounts
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="start_date">Start Date</Label>
              <Input
                id="start_date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="target_date">Target Completion</Label>
              <Input
                id="target_date"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the problem and the solution approach..."
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
            <Button type="submit" disabled={updateSolution.isPending || isLoading}>
              {updateSolution.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
