'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Search,
  FileCheck,
  Clock,
  CheckCircle,
  RotateCcw,
  AlertCircle,
  Eye,
  ThumbsUp,
  MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClientSupabaseClient as createClient } from '@/lib/supabase/client';

const statusColors: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  review: 'bg-amber-100 text-amber-700',
  revision: 'bg-orange-100 text-orange-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
};

interface Deliverable {
  id: string;
  title: string;
  status: string;
  file_url: string | null;
  notes: string | null;
  revision_count: number;
  created_at: string;
  order?: {
    id: string;
    solution?: {
      id: string;
      title: string;
    };
  };
}

export default function ClientDeliverablesPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [actionLoading, setActionLoading] = useState(false);
  const [revisionDialogOpen, setRevisionDialogOpen] = useState(false);
  const [selectedDeliverable, setSelectedDeliverable] = useState<Deliverable | null>(null);
  const [revisionNotes, setRevisionNotes] = useState('');

  const loadDeliverables = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setIsLoading(false);
      return;
    }

    const { data: client } = await (supabase as any).from('sh_clients')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!client) {
      setIsLoading(false);
      return;
    }

    // Get solutions for this client
    const { data: solutions } = await (supabase as any).from('sh_solutions')
      .select('id, title')
      .eq('client_id', client.id);

    if (!solutions || solutions.length === 0) {
      setIsLoading(false);
      return;
    }

    const solutionIds = solutions.map(s => s.id);

    // Get content orders for these solutions
    const { data: orders } = await (supabase as any).from('sh_content_orders')
      .select('id, solution_id')
      .in('solution_id', solutionIds);

    if (!orders || orders.length === 0) {
      setIsLoading(false);
      return;
    }

    const orderIds = orders.map(o => o.id);

    // Get deliverables
    const { data: deliverablesData } = await (supabase as any).from('sh_content_deliverables')
      .select('id, title, status, file_url, notes, revision_count, created_at, order_id')
      .in('order_id', orderIds)
      .order('created_at', { ascending: false });

    // Map deliverables with their solution info
    const mappedDeliverables = (deliverablesData || []).map(d => {
      const order = orders.find(o => o.id === d.order_id);
      const solution = order ? solutions.find(s => s.id === order.solution_id) : null;
      return {
        ...d,
        order: order ? {
          id: order.id,
          solution: solution ? { id: solution.id, title: solution.title } : undefined,
        } : undefined,
      };
    });

    setDeliverables(mappedDeliverables);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadDeliverables();
  }, [loadDeliverables]);

  const handleApprove = async (deliverableId: string) => {
    setActionLoading(true);
    const supabase = createClient();

    const { error } = await (supabase as any).from('sh_content_deliverables')
      .update({ status: 'approved' })
      .eq('id', deliverableId);

    if (error) {
      toast.error('Failed to approve deliverable');
    } else {
      toast.success('Deliverable approved successfully');
      await loadDeliverables();
    }

    setActionLoading(false);
  };

  const handleRequestRevision = async () => {
    if (!selectedDeliverable || !revisionNotes.trim()) {
      toast.error('Please provide revision notes');
      return;
    }

    setActionLoading(true);
    const supabase = createClient();

    const { error } = await (supabase as any).from('sh_content_deliverables')
      .update({
        status: 'revision',
        notes: revisionNotes,
        revision_count: selectedDeliverable.revision_count + 1,
      })
      .eq('id', selectedDeliverable.id);

    if (error) {
      toast.error('Failed to request revision');
    } else {
      toast.success('Revision requested successfully');
      setRevisionDialogOpen(false);
      setRevisionNotes('');
      setSelectedDeliverable(null);
      await loadDeliverables();
    }

    setActionLoading(false);
  };

  // Filter deliverables
  const filteredDeliverables = deliverables.filter((deliverable) => {
    if (activeTab !== 'all') {
      if (activeTab === 'pending' && deliverable.status !== 'review') return false;
      if (activeTab === 'approved' && deliverable.status !== 'approved') return false;
      if (activeTab === 'revision' && deliverable.status !== 'revision') return false;
    }

    if (search) {
      const searchLower = search.toLowerCase();
      return (
        deliverable.title.toLowerCase().includes(searchLower) ||
        deliverable.order?.solution?.title?.toLowerCase().includes(searchLower)
      );
    }

    return true;
  });

  const counts = {
    all: deliverables.length,
    pending: deliverables.filter((d) => d.status === 'review').length,
    approved: deliverables.filter((d) => d.status === 'approved').length,
    revision: deliverables.filter((d) => d.status === 'revision').length,
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Deliverables</h1>
        <p className="text-muted-foreground">
          Review and approve deliverables from your content orders
        </p>
      </div>

      {/* Stats */}
      {counts.pending > 0 && (
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <p className="text-sm text-amber-800">
                You have <strong>{counts.pending}</strong> deliverable
                {counts.pending !== 1 ? 's' : ''} awaiting your review
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search deliverables..."
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
            <FileCheck className="h-4 w-4" />
            All ({counts.all})
          </TabsTrigger>
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="h-4 w-4" />
            Pending Review ({counts.pending})
          </TabsTrigger>
          <TabsTrigger value="approved" className="gap-2">
            <CheckCircle className="h-4 w-4" />
            Approved ({counts.approved})
          </TabsTrigger>
          <TabsTrigger value="revision" className="gap-2">
            <RotateCcw className="h-4 w-4" />
            In Revision ({counts.revision})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {filteredDeliverables.length > 0 ? (
            <div className="space-y-4">
              {filteredDeliverables.map((deliverable) => (
                <Card key={deliverable.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{deliverable.title}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          {deliverable.order?.solution?.title || 'Unknown Solution'}
                        </p>
                      </div>
                      <Badge className={statusColors[deliverable.status] || 'bg-gray-100 text-gray-700'}>
                        {deliverable.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {deliverable.notes && (
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-sm">{deliverable.notes}</p>
                      </div>
                    )}

                    {deliverable.revision_count > 0 && (
                      <p className="text-sm text-orange-600">
                        {deliverable.revision_count} revision{deliverable.revision_count !== 1 ? 's' : ''} requested
                      </p>
                    )}

                    <div className="flex gap-2">
                      {deliverable.file_url && (
                        <Button variant="outline" asChild>
                          <a href={deliverable.file_url} target="_blank" rel="noopener noreferrer">
                            <Eye className="h-4 w-4 mr-2" />
                            View File
                          </a>
                        </Button>
                      )}

                      {deliverable.status === 'review' && (
                        <>
                          <Button
                            onClick={() => handleApprove(deliverable.id)}
                            disabled={actionLoading}
                          >
                            <ThumbsUp className="h-4 w-4 mr-2" />
                            Approve
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setSelectedDeliverable(deliverable);
                              setRevisionDialogOpen(true);
                            }}
                            disabled={actionLoading}
                          >
                            <MessageSquare className="h-4 w-4 mr-2" />
                            Request Revision
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <FileCheck className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  {search
                    ? 'No deliverables match your search'
                    : activeTab === 'pending'
                    ? 'No deliverables pending review'
                    : 'No deliverables found'}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Revision Dialog */}
      <Dialog open={revisionDialogOpen} onOpenChange={setRevisionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Revision</DialogTitle>
            <DialogDescription>
              Provide feedback on what changes are needed for this deliverable.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Textarea
              placeholder="Describe the changes needed..."
              value={revisionNotes}
              onChange={(e) => setRevisionNotes(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevisionDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRequestRevision} disabled={actionLoading}>
              {actionLoading ? 'Submitting...' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
