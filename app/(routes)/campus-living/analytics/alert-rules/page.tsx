'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Settings, Plus, Bell, AlertTriangle, Shield, UtensilsCrossed, Wrench, Users } from 'lucide-react';

export default function AlertRulesPage() {
  const rules = [
    { id: '1', name: 'Attendance Below Threshold', domain: 'Attendance', condition: 'Night attendance < 85%', severity: 'warning', enabled: true, icon: Users },
    { id: '2', name: 'Maintenance SLA Breach', domain: 'Maintenance', condition: 'Any request exceeds SLA deadline', severity: 'critical', enabled: true, icon: Wrench },
    { id: '3', name: 'Mess Rating Drop', domain: 'Mess', condition: 'Average rating < 3.0 for 3 days', severity: 'warning', enabled: true, icon: UtensilsCrossed },
    { id: '4', name: 'Safety Incident Alert', domain: 'Safety', condition: 'Any high/critical severity incident', severity: 'critical', enabled: true, icon: Shield },
    { id: '5', name: 'Fee Collection Target', domain: 'Fees', condition: 'Collection < 70% by mid-month', severity: 'warning', enabled: true, icon: AlertTriangle },
    { id: '6', name: 'Waste Threshold Exceeded', domain: 'Mess', condition: 'Daily waste > 25 kg', severity: 'info', enabled: false, icon: UtensilsCrossed },
    { id: '7', name: 'Unauthorized Entry', domain: 'Safety', condition: 'Unregistered person at gate after curfew', severity: 'critical', enabled: true, icon: Shield },
    { id: '8', name: 'Occupancy Drop', domain: 'Occupancy', condition: 'Any block < 80% occupied', severity: 'info', enabled: false, icon: Users },
  ];

  return (
    <ContentLayout title="Alert Rules">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Alert Rule Configuration</h1>
            <p className="text-muted-foreground">Configure alert thresholds and notification rules</p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Rule
          </Button>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total Rules</p>
              <p className="text-2xl font-bold">{rules.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-2xl font-bold text-green-600">{rules.filter(r => r.enabled).length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Disabled</p>
              <p className="text-2xl font-bold text-muted-foreground">{rules.filter(r => !r.enabled).length}</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {rules.map((rule) => (
            <Card key={rule.id} className={!rule.enabled ? 'opacity-60' : ''}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-4">
                    <div className="rounded-lg bg-primary/10 p-2 mt-0.5">
                      <rule.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold">{rule.name}</h4>
                        <Badge variant="outline">{rule.domain}</Badge>
                        <Badge className={
                          rule.severity === 'critical' ? 'bg-red-100 text-red-800 hover:bg-red-100' :
                          rule.severity === 'warning' ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100' :
                          'bg-blue-100 text-blue-800 hover:bg-blue-100'
                        }>
                          {rule.severity}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Condition: {rule.condition}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch checked={rule.enabled} />
                      <Label className="text-sm">{rule.enabled ? 'Active' : 'Disabled'}</Label>
                    </div>
                    <Button variant="ghost" size="sm">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </ContentLayout>
  );
}
