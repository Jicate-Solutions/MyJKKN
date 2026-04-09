/**
 * LC Structure - Terms Management
 * Lists all governance terms with create/edit functionality
 */

import { createClient } from '@/lib/supabase/server';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, FileText } from 'lucide-react';
import { TermActions, TermStatusButtons } from './term-actions';

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  upcoming: 'bg-blue-100 text-blue-800',
  completed: 'bg-gray-100 text-gray-700',
  archived: 'bg-gray-100 text-gray-500'
};

const termTypeLabels: Record<string, string> = {
  annual: 'Annual',
  executive_rotation: '6-Month Rotation'
};

export default async function TermsPage() {
  const { profile } = await getEnhancedUserProfile();
  if (!profile) redirect('/');

  const supabase = await createClient();

  const { data: terms } = await supabase
    .from('lc_terms')
    .select('*')
    .order('start_date', { ascending: false });

  const isStaffOrAdmin = ['admin', 'super_admin', 'staff', 'hod', 'principal'].includes(profile.role || '');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" />
            Governance Terms
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage LC governance periods - annual terms and 6-month executive rotations
          </p>
        </div>
        {isStaffOrAdmin && <TermActions userId={profile.id} />}
      </div>

      {/* Terms List */}
      {terms && terms.length > 0 ? (
        <div className="space-y-3">
          {terms.map((term) => (
            <Card key={term.id} className={term.status === 'active' ? 'border-green-200 bg-green-50/30' : ''}>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                      term.status === 'active' ? 'bg-green-100' : 'bg-gray-100'
                    }`}>
                      <Calendar className={`h-5 w-5 ${
                        term.status === 'active' ? 'text-green-600' : 'text-gray-500'
                      }`} />
                    </div>
                    <div>
                      <h3 className="font-semibold">{term.name}</h3>
                      <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        <span>
                          {new Date(term.start_date).toLocaleDateString('en-IN', {
                            day: 'numeric', month: 'short', year: 'numeric'
                          })}
                          {' '}to{' '}
                          {new Date(term.end_date).toLocaleDateString('en-IN', {
                            day: 'numeric', month: 'short', year: 'numeric'
                          })}
                        </span>
                      </div>
                      {term.description && (
                        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5" />
                          {term.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                    <Badge className={statusColors[term.status] || statusColors.archived}>
                      {term.status.charAt(0).toUpperCase() + term.status.slice(1)}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {termTypeLabels[term.term_type] || term.term_type}
                    </Badge>
                    {isStaffOrAdmin && (
                      <TermStatusButtons termId={term.id} currentStatus={term.status} />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Calendar className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <h3 className="font-medium text-lg">No terms created yet</h3>
            <p className="text-sm mt-1">Create the first governance term to get started.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
