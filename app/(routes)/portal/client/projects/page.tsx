'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Briefcase, Hammer, BookOpen, Video } from 'lucide-react';
import { createClientSupabaseClient as createClient } from '@/lib/supabase/client';

const typeIcons: Record<string, typeof Hammer> = {
  software: Hammer,
  training: BookOpen,
  content: Video,
};

const typeColors: Record<string, string> = {
  software: 'bg-blue-100 text-blue-800',
  training: 'bg-green-100 text-green-800',
  content: 'bg-purple-100 text-purple-800',
};

const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  on_hold: 'bg-amber-100 text-amber-700',
  completed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-700',
  in_amc: 'bg-indigo-100 text-indigo-700',
};

interface Solution {
  id: string;
  title: string;
  solution_code: string;
  solution_type: 'software' | 'training' | 'content';
  status: string;
  problem_statement: string | null;
  created_at: string;
}

export default function ClientProjectsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    async function fetchSolutions() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data: client } = await supabase
        .from('sh_clients')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!client) {
        setIsLoading(false);
        return;
      }

      const { data } = await supabase
        .from('sh_solutions')
        .select('id, title, solution_code, solution_type, status, problem_statement, created_at')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false });

      setSolutions((data as Solution[]) || []);
      setIsLoading(false);
    }

    fetchSolutions();
  }, []);

  // Filter solutions
  const filteredSolutions = solutions.filter((solution) => {
    if (activeTab !== 'all' && solution.solution_type !== activeTab) {
      return false;
    }

    if (search) {
      const searchLower = search.toLowerCase();
      return (
        solution.title.toLowerCase().includes(searchLower) ||
        solution.solution_code.toLowerCase().includes(searchLower) ||
        solution.problem_statement?.toLowerCase().includes(searchLower)
      );
    }

    return true;
  });

  const counts = {
    all: solutions.length,
    software: solutions.filter((s) => s.solution_type === 'software').length,
    training: solutions.filter((s) => s.solution_type === 'training').length,
    content: solutions.filter((s) => s.solution_type === 'content').length,
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Projects</h1>
        <p className="text-muted-foreground">
          View and track all your solutions with JKKN
        </p>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all" className="gap-2">
            <Briefcase className="h-4 w-4" />
            All ({counts.all})
          </TabsTrigger>
          <TabsTrigger value="software" className="gap-2">
            <Hammer className="h-4 w-4" />
            Software ({counts.software})
          </TabsTrigger>
          <TabsTrigger value="training" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Training ({counts.training})
          </TabsTrigger>
          <TabsTrigger value="content" className="gap-2">
            <Video className="h-4 w-4" />
            Content ({counts.content})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {filteredSolutions.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredSolutions.map((solution) => {
                const TypeIcon = typeIcons[solution.solution_type] || Briefcase;
                return (
                  <Card key={solution.id} className="hover:border-primary transition-colors">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg ${typeColors[solution.solution_type]?.split(' ')[0] || 'bg-gray-100'}`}>
                            <TypeIcon className={`h-5 w-5 ${typeColors[solution.solution_type]?.split(' ')[1] || 'text-gray-600'}`} />
                          </div>
                          <div>
                            <CardTitle className="text-base">{solution.title}</CardTitle>
                            <p className="text-sm text-muted-foreground font-mono mt-1">
                              {solution.solution_code}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {solution.problem_statement && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {solution.problem_statement}
                        </p>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{solution.solution_type}</Badge>
                          <Badge className={statusColors[solution.status] || 'bg-gray-100 text-gray-700'}>
                            {solution.status.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                      <Link href={`/portal/client/projects/${solution.id}`}>
                        <Button variant="outline" className="w-full">View Details</Button>
                      </Link>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Briefcase className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  {search ? 'No projects match your search' : 'No projects found'}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
