import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ClientNav } from '@/components/solutions/portals';

export default async function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login?redirect=/portal/client');
  }

  // Fetch client record
  const { data: client } = await (supabase as any).from('sh_clients')
    .select('id, name, contact_email, company_name')
    .eq('user_id', user.id)
    .single();

  // If not a client, redirect to home
  if (!client) {
    redirect('/');
  }

  return (
    <div className="flex h-screen">
      <ClientNav
        clientName={client.name}
        companyName={client.company_name}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b bg-background px-6">
          <h1 className="text-lg font-semibold">JKKN Solutions - Client Portal</h1>
        </header>
        <main className="flex-1 overflow-y-auto bg-muted/40 p-6">{children}</main>
      </div>
    </div>
  );
}
