'use client';

import {
  Info,
  Zap,
  Brain,
  TrendingUp,
  Clock,
  Users,
  MessageCircle,
  Award,
  BarChart3,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Bot,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

export function WorkPulseInfoModal() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Info className="h-4 w-4" />
          How it Works
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Zap className="h-5 w-5 text-yellow-500" />
            Work Pulse — Your Voice for Change
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-2">
          {/* What is Work Pulse */}
          <section>
            <h3 className="font-semibold text-base mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              What is Work Pulse?
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Work Pulse is a weekly 2-minute check-in where you share what&apos;s slowing you down at work.
              Our AI analyzes responses across the institution to discover patterns — repetitive tasks,
              wasted talent, and automation opportunities. Your feedback directly shapes what gets built next.
            </p>
          </section>

          <Separator />

          {/* How it Works — Steps */}
          <section>
            <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              How It Works
            </h3>
            <div className="space-y-4">
              {[
                {
                  step: 1,
                  icon: MessageCircle,
                  title: 'You Report',
                  description: 'Answer 2 quick questions each week: What takes too much of your talent? What repetitive task wastes the most time?',
                  color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
                },
                {
                  step: 2,
                  icon: Brain,
                  title: 'AI Discovers Patterns',
                  description: 'Every Sunday, our AI analyzes all responses to identify common pain points, group similar issues, and calculate impact scores.',
                  color: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
                },
                {
                  step: 3,
                  icon: Bot,
                  title: 'Solutions Get Built',
                  description: 'High-impact patterns become automation agents, new modules, process changes, or targeted training — prioritized by how many people they help.',
                  color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
                },
                {
                  step: 4,
                  icon: TrendingUp,
                  title: 'Impact is Measured',
                  description: 'Once deployed, we measure hours saved, people helped, and workflows improved. You see the real impact of your feedback on the Impact Dashboard.',
                  color: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.step} className="flex gap-3">
                    <div className={`shrink-0 rounded-full h-8 w-8 flex items-center justify-center text-xs font-bold ${item.color}`}>
                      {item.step}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-medium">{item.title}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Flywheel Visual */}
            <div className="mt-4 p-3 rounded-lg bg-muted/50 text-center">
              <div className="flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground">
                <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 rounded text-blue-700 dark:text-blue-300">Report</span>
                <ArrowRight className="h-3 w-3" />
                <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900 rounded text-purple-700 dark:text-purple-300">Discover</span>
                <ArrowRight className="h-3 w-3" />
                <span className="px-2 py-1 bg-green-100 dark:bg-green-900 rounded text-green-700 dark:text-green-300">Build</span>
                <ArrowRight className="h-3 w-3" />
                <span className="px-2 py-1 bg-amber-100 dark:bg-amber-900 rounded text-amber-700 dark:text-amber-300">Measure</span>
                <ArrowRight className="h-3 w-3" />
                <span className="text-muted-foreground">Repeat</span>
              </div>
            </div>
          </section>

          <Separator />

          {/* The 3 Pages */}
          <section>
            <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Three Dashboards
            </h3>
            <div className="grid gap-3">
              <div className="p-3 rounded-lg border">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 text-[10px]">My Pulse</Badge>
                  <span className="text-xs text-muted-foreground">/work-pulse</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your personal dashboard. Submit your weekly pulse, see your stats, earned badges,
                  and answer quick follow-up questions. HODs can also see department compliance rates.
                </p>
              </div>
              <div className="p-3 rounded-lg border">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 text-[10px]">Agent Board</Badge>
                  <span className="text-xs text-muted-foreground">/work-pulse/agents</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  See all discovered automation opportunities ranked by impact. Patterns are grouped into
                  tiers: S-Tier (critical), A-Tier (important), B-Tier (moderate), C-Tier (monitor).
                </p>
              </div>
              <div className="p-3 rounded-lg border">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-[10px]">Impact</Badge>
                  <span className="text-xs text-muted-foreground">/work-pulse/impact</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Track deployed solutions — how many hours saved per week, people helped,
                  and workflows automated. See the real-world impact of your feedback.
                </p>
              </div>
            </div>
          </section>

          <Separator />

          {/* Benefits */}
          <section>
            <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
              <Award className="h-4 w-4 text-primary" />
              Benefits & Badges
            </h3>
            <div className="space-y-2">
              {[
                { icon: CheckCircle2, text: 'Your repetitive work gets automated — saving you hours every week' },
                { icon: Users, text: 'Problems affecting many people get prioritized first' },
                { icon: Clock, text: 'Takes only 2 minutes per week — minimal effort, maximum impact' },
                { icon: Shield, text: 'Your individual responses are private — only aggregated patterns are shared' },
                { icon: MessageCircle, text: 'Tamil input is automatically translated — write in whichever language is natural' },
              ].map((item, idx) => {
                const Icon = item.icon;
                return (
                  <div key={idx} className="flex items-start gap-2">
                    <Icon className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">{item.text}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
              <p className="text-xs font-medium text-amber-800 dark:text-amber-200 mb-2">
                Earn Badges
              </p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    <Award className="h-3 w-3 mr-1" />
                    Pattern Spotter
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">10+ pattern matches from your reports</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    <Bot className="h-3 w-3 mr-1" />
                    Agent Originator
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">1+ deployed agent from your feedback</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    Impact Pioneer
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">50+ hours saved across the institution</span>
                </div>
              </div>
            </div>
          </section>

          <Separator />

          {/* Quick Pulse FAB */}
          <section>
            <h3 className="font-semibold text-base mb-2 flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              Quick Pulse (Yellow Button)
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Notice the yellow <strong>&#9889;</strong> button in the bottom-right corner of every page?
              That&apos;s the Quick Pulse shortcut. Click it anytime to submit your weekly pulse without
              leaving the page you&apos;re on. It disappears on the Work Pulse pages since the full form is
              already available.
            </p>
          </section>

          <Separator />

          {/* FAQ */}
          <section>
            <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              Frequently Asked Questions
            </h3>
            <div className="space-y-3">
              {[
                {
                  q: 'How often should I submit?',
                  a: 'Once per week. You can update your submission anytime during the week — the latest response is kept.',
                },
                {
                  q: 'Can others see my individual responses?',
                  a: 'No. Only you can see your own entries. The AI analyzes responses in aggregate to find patterns — individual submissions are never shared with managers or colleagues.',
                },
                {
                  q: 'Can I write in Tamil?',
                  a: 'Yes! Tamil text is automatically detected and translated to English for AI analysis. Your original Tamil text is preserved alongside the translation.',
                },
                {
                  q: 'What happens after I submit?',
                  a: 'Every Sunday, our AI clusters all responses to discover patterns. High-impact patterns appear on the Agent Board. Solutions are prioritized by how many people they help and how many hours they save.',
                },
                {
                  q: 'What are micro-interviews?',
                  a: 'Occasionally (max once per month), you may see a quick follow-up question about a pattern related to your feedback. This helps the AI gather deeper context for better solutions.',
                },
                {
                  q: 'Who can see the Agent Board and Impact Dashboard?',
                  a: 'All authenticated users. Full transparency — everyone can see what patterns have been discovered and what solutions are being built.',
                },
              ].map((item, idx) => (
                <div key={idx}>
                  <p className="text-xs font-medium">{item.q}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.a}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
