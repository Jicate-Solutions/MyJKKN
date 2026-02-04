'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { ClientForm } from '@/components/solutions/clients/client-form';
import { useCreateClient, type CreateClientInput } from '@/hooks/solutions/use-clients';

export function NewClientForm() {
  const router = useRouter();
  const createClient = useCreateClient();

  const handleSubmit = async (data: CreateClientInput) => {
    try {
      const result = await createClient.mutateAsync(data);
      toast.success('Client created successfully');
      router.push(`/solutions/clients/${result.id}`);
    } catch (error) {
      console.error('Failed to create client:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create client');
      throw error; // Re-throw to let form know it failed
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <ClientForm onSubmit={handleSubmit} isLoading={createClient.isPending} />
      </CardContent>
    </Card>
  );
}
