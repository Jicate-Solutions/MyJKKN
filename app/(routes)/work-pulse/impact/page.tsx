import {
  Bot,
  Clock,
  Award,
  Users,
  Workflow,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getImpactData } from './_data/get-impact';

const SOLUTION_LABELS: Record<string, string> = {
  new_module: 'New Module',
  standalone_agent: 'Agent',
  process_change: 'Process Change',
  training: 'Training',
};

export default async function ImpactDashboardPage() {
  const { summary, agents } = await getImpactData();

  const summaryCards = [
    { label: 'Agents Deployed', value: summary.agents_deployed, icon: Bot },
    { label: 'Hours Saved/Week', value: summary.hours_saved_weekly, icon: Clock },
    { label: 'Training Wins', value: summary.training_wins, icon: Award },
    { label: 'People Helped', value: summary.people_helped, icon: Users },
    { label: 'Workflows Absorbed', value: summary.workflows_absorbed, icon: Workflow },
  ];

  return (
    <ContentLayout title="Impact Dashboard">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Work Pulse', href: '/work-pulse' },
          { label: 'Impact' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold py-1">Impact Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Deployed agents, hours saved, and flywheel health metrics
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.label}>
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{card.value}</p>
                      <p className="text-xs text-muted-foreground">{card.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Deployed Agents Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Deployed Agents & Solutions</CardTitle>
          </CardHeader>
          <CardContent>
            {agents.length === 0 ? (
              <div className="py-8 text-center">
                <Bot className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">
                  No agents deployed yet. The AI pipeline discovers opportunities from your Weekly Pulse submissions.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Before (hrs/wk)</TableHead>
                    <TableHead className="text-right">After (hrs/wk)</TableHead>
                    <TableHead className="text-right">Saved (hrs/wk)</TableHead>
                    <TableHead className="text-right">People Using</TableHead>
                    <TableHead>Deployed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agents.map((agent) => (
                    <TableRow key={agent.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {agent.agent_name}
                          {agent.is_jicate_product && (
                            <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700">
                              JICATE
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {SOLUTION_LABELS[agent.solution_type] || agent.solution_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(agent.pre_hours_weekly).toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(agent.post_hours_weekly).toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-green-600">
                        {Number(agent.hours_saved_weekly).toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right">{agent.people_using}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(agent.deployed_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Flywheel Health */}
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Flywheel Health
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Month-over-month trends (populated after 2+ months of data)
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-background">
                <ArrowUpRight className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm font-medium">Coverage Growth</p>
                  <p className="text-xs text-muted-foreground">
                    Submission rate trend across departments
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-background">
                <ArrowUpRight className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm font-medium">Hours Saved</p>
                  <p className="text-xs text-muted-foreground">
                    Total hours recovered by deployed agents
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-background">
                <ArrowDownRight className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm font-medium">Workflows</p>
                  <p className="text-xs text-muted-foreground">
                    New workflows automated this quarter
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
