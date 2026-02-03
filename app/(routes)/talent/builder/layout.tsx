import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BuilderNav } from '@/components/solutions/portals/builder-nav';
import { BuilderHeader } from '@/components/solutions/portals/builder-header';

export default async function BuilderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  // Check if user is a builder
  const { data: builder } = await (supabase as any).from('sh_builders')
    .select(`
      *,
      department:departments(id, name, code)
    `)
    .eq('user_id', user.id)
    .single();

  if (!builder) {
    // Not a builder - redirect to main dashboard
    redirect('/');
  }

  return (
    <div className="flex h-screen">
      <BuilderNav builderName={builder.name} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <BuilderHeader
          builderName={builder.name}
          departmentName={builder.department?.name}
        />
        <main className="flex-1 overflow-y-auto bg-muted/40 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
