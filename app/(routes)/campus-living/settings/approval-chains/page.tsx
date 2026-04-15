'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Save, Plus, Edit, ArrowRight, GitBranch } from 'lucide-react';

export default function ApprovalChainsPage() {
  const workflows = [
    {
      id: '1',
      name: 'Weekend Leave Approval',
      trigger: 'Student submits weekend leave',
      active: true,
      steps: [
        { role: 'Floor In-charge', action: 'Approve/Reject', timeout: '4 hours' },
        { role: 'Warden', action: 'Final Approve', timeout: '8 hours' },
      ],
    },
    {
      id: '2',
      name: 'Long Leave Approval',
      trigger: 'Student submits leave > 3 days',
      active: true,
      steps: [
        { role: 'Warden', action: 'Verify & Recommend', timeout: '12 hours' },
        { role: 'Chief Warden', action: 'Approve/Reject', timeout: '24 hours' },
        { role: 'Parent Consent', action: 'SMS Confirmation', timeout: '48 hours' },
      ],
    },
    {
      id: '3',
      name: 'Curfew Exception',
      trigger: 'Student requests curfew exception',
      active: true,
      steps: [
        { role: 'Warden', action: 'Approve/Reject', timeout: '2 hours' },
      ],
    },
    {
      id: '4',
      name: 'Visitor Extension',
      trigger: 'Visitor stay beyond visiting hours',
      active: false,
      steps: [
        { role: 'Security', action: 'Record & Escalate', timeout: '30 min' },
        { role: 'Warden', action: 'Approve/Reject', timeout: '1 hour' },
      ],
    },
    {
      id: '5',
      name: 'Maintenance Escalation',
      trigger: 'Request exceeds 75% SLA time',
      active: true,
      steps: [
        { role: 'Maintenance Head', action: 'Reassign or Expedite', timeout: '2 hours' },
        { role: 'Chief Warden', action: 'Review', timeout: '4 hours' },
      ],
    },
  ];

  return (
    <ContentLayout title="Approval Chains">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Approval Workflow Configuration</h1>
            <p className="text-muted-foreground">Configure multi-step approval chains for various processes</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline"><Plus className="mr-2 h-4 w-4" />Add Workflow</Button>
            <Button><Save className="mr-2 h-4 w-4" />Save</Button>
          </div>
        </div>

        <div className="space-y-4">
          {workflows.map((workflow) => (
            <Card key={workflow.id} className={!workflow.active ? 'opacity-60' : ''}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <GitBranch className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-lg">{workflow.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">Trigger: {workflow.trigger}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Switch checked={workflow.active} />
                      <Label className="text-sm">{workflow.active ? 'Active' : 'Disabled'}</Label>
                    </div>
                    <Button variant="ghost" size="sm"><Edit className="h-4 w-4" /></Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 flex-wrap">
                  {workflow.steps.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="border rounded-lg p-3 bg-muted/50">
                        <p className="text-sm font-medium">{step.role}</p>
                        <p className="text-xs text-muted-foreground">{step.action}</p>
                        <Badge variant="outline" className="text-xs mt-1">Timeout: {step.timeout}</Badge>
                      </div>
                      {idx < workflow.steps.length - 1 && (
                        <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </ContentLayout>
  );
}
