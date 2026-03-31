import { Brain, Flame, Wrench, Award, TrendingUp } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getPatterns, getAgentBoardStats } from './_data/get-patterns';
import { WorkPulseService } from '@/lib/services/work-pulse/work-pulse-service';
import { WpPatternTier } from '@/types/work-pulse';
import { TierSection } from './_components/tier-section';

const TIERS: WpPatternTier[] = ['S', 'A', 'B', 'C'];

export default async function AgentBoardPage() {
  const [boardStats, { data: patterns }, impactSummary] = await Promise.all([
    getAgentBoardStats(),
    getPatterns({ limit: 100 }),
    WorkPulseService.getImpactSummary(),
  ]);

  // Group patterns by tier
  const byTier = TIERS.reduce(
    (acc, tier) => {
      acc[tier] = patterns.filter((p) => p.tier === tier);
      return acc;
    },
    {} as Record<WpPatternTier, typeof patterns>
  );

  // Training wins
  const trainingWins = patterns.filter(
    (p) => p.solution_type === 'training' && p.status === 'deployed'
  );

  const statCards = [
    { label: 'Total Opportunities', value: boardStats.total_opportunities, icon: Brain },
    { label: 'S-Tier', value: boardStats.s_tier_count, icon: Flame },
    { label: 'In Pipeline', value: boardStats.in_pipeline, icon: Wrench },
    { label: 'Training Wins', value: boardStats.training_wins, icon: Award },
  ];

  return (
    <ContentLayout title="Agent Opportunity Board">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Work Pulse', href: '/work-pulse' },
          { label: 'Agent Board' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold py-1">Agent Opportunity Board</h1>
          <p className="text-sm text-muted-foreground">
            AI-discovered automation opportunities ranked by impact
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map((card) => {
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

        {/* Tier Sections */}
        {patterns.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Brain className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">
                No patterns discovered yet. Submit your Weekly Pulse to contribute!
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {TIERS.map((tier) => (
              <TierSection key={tier} tier={tier} patterns={byTier[tier]} />
            ))}
          </div>
        )}

        {/* Training Wins */}
        {trainingWins.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Award className="h-4 w-4" />
              Training Wins
            </h3>
            <div className="grid gap-2 md:grid-cols-2">
              {trainingWins.map((win) => (
                <Card key={win.id}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{win.name}</p>
                        <p className="text-xs text-muted-foreground">{win.category}</p>
                      </div>
                      <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-[10px]">
                        Resolved via training
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Impact Footer */}
        <Card className="bg-muted/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Impact This Quarter
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6 text-sm">
              <div>
                <span className="text-lg font-bold">{impactSummary.agents_deployed}</span>
                <span className="text-muted-foreground ml-1">agents deployed</span>
              </div>
              <div>
                <span className="text-lg font-bold">{impactSummary.hours_saved_weekly}</span>
                <span className="text-muted-foreground ml-1">hrs saved/week</span>
              </div>
              <div>
                <span className="text-lg font-bold">{impactSummary.people_helped}</span>
                <span className="text-muted-foreground ml-1">people helped</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
