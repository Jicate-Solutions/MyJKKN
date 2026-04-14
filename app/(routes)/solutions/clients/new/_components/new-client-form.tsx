'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { ClientForm } from '@/components/solutions/clients/client-form';
import { useCreateClient, type CreateClientInput } from '@/hooks/solutions/use-clients';
import { useAuth } from '@/hooks/use-auth';

export function NewClientForm() {
  const router = useRouter();
  const createClient = useCreateClient();
  const { profile } = useAuth();

  const handleSubmit = async (data: CreateClientInput) => {
    if (!profile?.id) {
      toast.error('User profile not loaded. Please refresh and try again.');
      return;
    }

    try {
      const result = await createClient.mutateAsync({
        ...data,
        created_by: profile.id,
      });
      toast.success('Client created successfully');
      // Bust Next.js router cache so the detail page fetches fresh data
      router.refresh();
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
