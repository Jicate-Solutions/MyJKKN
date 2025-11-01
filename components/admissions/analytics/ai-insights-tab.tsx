'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sparkles,
  RefreshCw,
  Lightbulb,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Info,
  Target,
  ShieldAlert,
  Zap,
  BarChart3,
  Clock,
  Layers,
  Flag,
  AlertTriangle,
  Award,
  Download,
  Share2,
  Copy,
  FileText
} from 'lucide-react';
import { AdmissionAIInsights } from '@/types/admission';
import {
  formatInsightsAsMarkdown,
  generateInsightsPDF,
  copyMarkdownToClipboard,
  downloadMarkdownFile
} from '@/lib/utils/ai-insights-formatter';
import toast from 'react-hot-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';

interface AIInsightsTabProps {
  insights?: AdmissionAIInsights;
  isLoading: boolean;
  error: Error | null;
  onGenerate: () => void;
  onRefresh: () => void;
  enabled: boolean;
}

export function AIInsightsTab({
  insights,
  isLoading,
  error,
  onGenerate,
  onRefresh,
  enabled
}: AIInsightsTabProps) {
  // Download and share handlers
  const handleDownloadPDF = () => {
    if (!insights) return;
    try {
      generateInsightsPDF(insights);
      toast.success('PDF downloaded successfully!');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF. Please try again.');
    }
  };

  const handleDownloadMarkdown = () => {
    if (!insights) return;
    try {
      const markdown = formatInsightsAsMarkdown(insights);
      downloadMarkdownFile(markdown);
      toast.success('Markdown file downloaded successfully!');
    } catch (error) {
      console.error('Error downloading markdown:', error);
      toast.error('Failed to download markdown. Please try again.');
    }
  };

  const handleCopyMarkdown = async () => {
    if (!insights) return;
    try {
      const markdown = formatInsightsAsMarkdown(insights);
      const success = await copyMarkdownToClipboard(markdown);
      if (success) {
        toast.success('Markdown copied to clipboard!');
      } else {
        toast.error('Failed to copy to clipboard.');
      }
    } catch (error) {
      console.error('Error copying markdown:', error);
      toast.error('Failed to copy markdown. Please try again.');
    }
  };

  // Severity colors for key findings
  const getSeverityConfig = (
    severity: 'critical' | 'warning' | 'info' | 'success'
  ) => {
    switch (severity) {
      case 'critical':
        return {
          bg: 'bg-red-50 border-red-200',
          icon: AlertCircle,
          iconColor: 'text-red-600',
          badge: 'bg-red-100 text-red-800 border-red-300'
        };
      case 'warning':
        return {
          bg: 'bg-yellow-50 border-yellow-200',
          icon: AlertTriangle,
          iconColor: 'text-yellow-600',
          badge: 'bg-yellow-100 text-yellow-800 border-yellow-300'
        };
      case 'success':
        return {
          bg: 'bg-green-50 border-green-200',
          icon: CheckCircle2,
          iconColor: 'text-green-600',
          badge: 'bg-green-100 text-green-800 border-green-300'
        };
      default:
        return {
          bg: 'bg-blue-50 border-blue-200',
          icon: Info,
          iconColor: 'text-blue-600',
          badge: 'bg-blue-100 text-blue-800 border-blue-300'
        };
    }
  };

  // Priority colors
  const getPriorityConfig = (priority: 'high' | 'medium' | 'low') => {
    switch (priority) {
      case 'high':
        return { bg: 'bg-red-100 text-red-800 border-red-200', icon: Flag };
      case 'medium':
        return {
          bg: 'bg-yellow-100 text-yellow-800 border-yellow-200',
          icon: Flag
        };
      case 'low':
        return { bg: 'bg-blue-100 text-blue-800 border-blue-200', icon: Flag };
    }
  };

  // Confidence badge colors
  const getConfidenceBadge = (confidence: 'high' | 'medium' | 'low') => {
    switch (confidence) {
      case 'high':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low':
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Direction icons and colors
  const getDirectionConfig = (direction: 'up' | 'down' | 'stable') => {
    switch (direction) {
      case 'up':
        return { icon: TrendingUp, color: 'text-green-600 bg-green-50' };
      case 'down':
        return { icon: TrendingDown, color: 'text-red-600 bg-red-50' };
      case 'stable':
        return { icon: BarChart3, color: 'text-blue-600 bg-blue-50' };
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className='flex flex-col items-center justify-center min-h-[500px] space-y-6'>
        <div className='relative'>
          <Sparkles className='h-16 w-16 text-primary animate-pulse' />
          <RefreshCw className='h-8 w-8 animate-spin text-primary absolute top-4 left-4' />
        </div>
        <div className='text-center space-y-2'>
          <h3 className='text-xl font-bold'>
            Generating Comprehensive AI Insights
          </h3>
          <p className='text-muted-foreground max-w-md'>
            Claude 4.5 Haiku is performing deep analysis of your admissions
            data...
          </p>
          <div className='flex items-center justify-center gap-2 text-sm text-muted-foreground pt-4'>
            <Clock className='h-4 w-4' />
            <span>This may take 5-10 seconds</span>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className='border-destructive'>
        <CardContent className='pt-6'>
          <Alert variant='destructive'>
            <AlertCircle className='h-5 w-5' />
            <AlertTitle className='text-lg font-semibold'>
              Error Generating Insights
            </AlertTitle>
            <AlertDescription className='mt-2 text-base'>
              {error.message}
            </AlertDescription>
          </Alert>
          <div className='mt-6 flex justify-center gap-3'>
            <Button onClick={onRefresh} variant='outline' size='lg'>
              <RefreshCw className='h-4 w-4 mr-2' />
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Initial state - no insights generated yet
  if (!enabled || !insights) {
    return (
      <Card className='border-2 border-dashed'>
        <CardContent className='pt-6'>
          <div className='flex flex-col items-center justify-center min-h-[500px] space-y-6'>
            <div className='relative'>
              <Sparkles className='h-20 w-20 text-primary' />
              <div className='absolute -top-2 -right-2 bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center text-xs font-bold'>
                AI
              </div>
            </div>
            <div className='text-center space-y-3 max-w-2xl'>
              <h3 className='text-2xl font-bold'>
                Advanced AI-Powered Insights
              </h3>
              <p className='text-muted-foreground text-lg'>
                Leverage Claude 4.5 Haiku to analyze your admissions data and
                generate comprehensive strategic insights, actionable
                recommendations, predictive analytics, and risk assessments.
              </p>
            </div>

            <div className='grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-4xl mt-6'>
              <div className='bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-lg border border-blue-200'>
                <Lightbulb className='h-10 w-10 text-blue-600 mb-3' />
                <h4 className='font-semibold mb-2'>Smart Recommendations</h4>
                <p className='text-sm text-muted-foreground'>
                  Get 5-8 prioritized actionable recommendations with
                  implementation steps
                </p>
              </div>
              <div className='bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-lg border border-purple-200'>
                <BarChart3 className='h-10 w-10 text-purple-600 mb-3' />
                <h4 className='font-semibold mb-2'>Predictive Analytics</h4>
                <p className='text-sm text-muted-foreground'>
                  Data-driven predictions with confidence levels and reasoning
                </p>
              </div>
              <div className='bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-lg border border-green-200'>
                <Target className='h-10 w-10 text-green-600 mb-3' />
                <h4 className='font-semibold mb-2'>Risk & Opportunity</h4>
                <p className='text-sm text-muted-foreground'>
                  Identify risks with mitigation strategies and growth
                  opportunities
                </p>
              </div>
            </div>

            <Button
              onClick={onGenerate}
              size='lg'
              className='mt-8 px-8 py-6 text-lg'
            >
              <Sparkles className='h-5 w-5 mr-2' />
              Generate Comprehensive Insights
            </Button>

            <Alert className='mt-6 max-w-2xl'>
              <Info className='h-4 w-4' />
              <AlertDescription>
                Analysis is based on your current analytics data and applied
                filters. Generation takes 5-10 seconds using Claude 4.5 Haiku.
              </AlertDescription>
            </Alert>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Display comprehensive insights
  return (
    <div className='space-y-6'>
      {/* Header with Action Buttons */}
      <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b'>
        <div className='flex items-center gap-3'>
          <div className='bg-gradient-to-br from-primary to-purple-600 p-2 rounded-lg'>
            <Sparkles className='h-6 w-6 text-white' />
          </div>
          <div>
            <h2 className='text-2xl font-bold'>AI-Generated Insights</h2>
            <p className='text-sm text-muted-foreground'>
              Powered by Claude 4.5 Haiku • Generated:{' '}
              {new Date(insights.generatedAt).toLocaleString()}
            </p>
          </div>
        </div>
        <div className='flex items-center gap-2 flex-wrap'>
          {/* Download Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='outline' size='lg' className='gap-2'>
                <Download className='h-4 w-4' />
                Download
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-56'>
              <DropdownMenuItem onClick={handleDownloadPDF}>
                <FileText className='h-4 w-4 mr-2' />
                Download as PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownloadMarkdown}>
                <FileText className='h-4 w-4 mr-2' />
                Download as Markdown
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Share Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='outline' size='lg' className='gap-2'>
                <Share2 className='h-4 w-4' />
                Share
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-56'>
              <DropdownMenuItem onClick={handleCopyMarkdown}>
                <Copy className='h-4 w-4 mr-2' />
                Copy as Markdown
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Regenerate Button */}
          <Button onClick={onRefresh} variant='default' size='lg' className='gap-2'>
            <RefreshCw className='h-4 w-4' />
            Regenerate
          </Button>
        </div>
      </div>

      {/* Executive Summary */}
      <Card className='border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-purple-500/5'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-xl'>
            <Award className='h-6 w-6 text-primary' />
            Executive Summary
          </CardTitle>
          <CardDescription>
            High-level overview of critical findings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className='text-base leading-relaxed'>{insights.summary}</p>
        </CardContent>
      </Card>

      {/* Key Findings */}
      {insights.keyFindings && insights.keyFindings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Layers className='h-5 w-5 text-blue-600' />
              Key Findings
              <Badge variant='secondary'>{insights.keyFindings.length}</Badge>
            </CardTitle>
            <CardDescription>
              Critical insights that require immediate attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              {insights.keyFindings.map((finding, index) => {
                const config = getSeverityConfig(finding.severity);
                const Icon = config.icon;

                return (
                  <div
                    key={index}
                    className={`border-2 rounded-lg p-4 space-y-3 ${config.bg} hover:shadow-lg transition-all`}
                  >
                    <div className='flex items-start justify-between gap-2'>
                      <div className='flex items-center gap-2 flex-1'>
                        <Icon
                          className={`h-5 w-5 ${config.iconColor} flex-shrink-0`}
                        />
                        <h4 className='font-semibold text-sm'>
                          {finding.title}
                        </h4>
                      </div>
                      <Badge
                        variant='outline'
                        className={`${config.badge} flex-shrink-0`}
                      >
                        {finding.severity.toUpperCase()}
                      </Badge>
                    </div>
                    <p className='text-sm leading-relaxed pl-7'>
                      {finding.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      <Card className='border-yellow-200 bg-yellow-50/30'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Lightbulb className='h-5 w-5 text-yellow-600' />
            Strategic Recommendations
            <Badge variant='secondary'>{insights.recommendations.length}</Badge>
          </CardTitle>
          <CardDescription>
            Prioritized action items with implementation roadmaps
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='space-y-4'>
            {insights.recommendations.map((rec, index) => {
              const config = getPriorityConfig(rec.priority);

              return (
                <div
                  key={index}
                  className='border-2 rounded-lg p-5 space-y-4 bg-white hover:shadow-xl transition-all'
                >
                  <div className='flex items-start justify-between gap-3'>
                    <div className='flex items-center gap-2'>
                      <div
                        className={`p-2 rounded ${
                          rec.priority === 'high'
                            ? 'bg-red-100'
                            : rec.priority === 'medium'
                            ? 'bg-yellow-100'
                            : 'bg-blue-100'
                        }`}
                      >
                        <Lightbulb className='h-4 w-4' />
                      </div>
                      <div>
                        <span className='font-bold text-base'>
                          {rec.category}
                        </span>
                        <Badge
                          variant='outline'
                          className={`ml-2 ${config.bg}`}
                        >
                          {rec.priority.toUpperCase()} PRIORITY
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className='space-y-3'>
                    <div>
                      <h5 className='font-semibold text-sm text-muted-foreground mb-1 flex items-center gap-2'>
                        <BarChart3 className='h-4 w-4' />
                        Data Insight
                      </h5>
                      <p className='text-sm leading-relaxed pl-6'>
                        {rec.insight}
                      </p>
                    </div>

                    <div>
                      <h5 className='font-semibold text-sm text-muted-foreground mb-1 flex items-center gap-2'>
                        <Target className='h-4 w-4' />
                        Recommended Action
                      </h5>
                      <p className='text-sm font-medium text-primary leading-relaxed pl-6'>
                        {rec.action}
                      </p>
                    </div>

                    {rec.expectedImpact && (
                      <div>
                        <h5 className='font-semibold text-sm text-muted-foreground mb-1 flex items-center gap-2'>
                          <TrendingUp className='h-4 w-4' />
                          Expected Impact
                        </h5>
                        <p className='text-sm text-green-700 font-medium leading-relaxed pl-6'>
                          {rec.expectedImpact}
                        </p>
                      </div>
                    )}

                    {rec.implementationSteps &&
                      rec.implementationSteps.length > 0 && (
                        <div>
                          <h5 className='font-semibold text-sm text-muted-foreground mb-2 flex items-center gap-2'>
                            <CheckCircle2 className='h-4 w-4' />
                            Implementation Steps
                          </h5>
                          <ol className='space-y-2 pl-6'>
                            {rec.implementationSteps.map((step, stepIndex) => (
                              <li
                                key={stepIndex}
                                className='text-sm flex items-start gap-2'
                              >
                                <span className='font-semibold text-primary min-w-[20px]'>
                                  {stepIndex + 1}.
                                </span>
                                <span className='leading-relaxed'>{step}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Predictions */}
      {insights.predictions && insights.predictions.length > 0 && (
        <Card className='border-purple-200 bg-purple-50/30'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <TrendingUp className='h-5 w-5 text-purple-600' />
              Predictive Analytics
              <Badge variant='secondary'>{insights.predictions.length}</Badge>
            </CardTitle>
            <CardDescription>
              Data-driven forecasts with confidence levels
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='space-y-4'>
              {insights.predictions.map((pred, index) => (
                <div
                  key={index}
                  className='border-2 rounded-lg p-5 space-y-3 bg-white hover:shadow-lg transition-all'
                >
                  <div className='flex items-center justify-between flex-wrap gap-2'>
                    <h4 className='font-bold text-base flex items-center gap-2'>
                      <BarChart3 className='h-5 w-5 text-purple-600' />
                      {pred.metric}
                    </h4>
                    <div className='flex gap-2'>
                      <Badge
                        variant='outline'
                        className={getConfidenceBadge(pred.confidence)}
                      >
                        {pred.confidence.toUpperCase()} CONFIDENCE
                      </Badge>
                      {pred.timeline && (
                        <Badge
                          variant='outline'
                          className='bg-blue-50 text-blue-700 border-blue-200'
                        >
                          <Clock className='h-3 w-3 mr-1' />
                          {pred.timeline}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <p className='text-sm font-medium leading-relaxed'>
                    {pred.prediction}
                  </p>

                  {pred.reasoning && (
                    <div className='bg-purple-50 border border-purple-200 rounded p-3'>
                      <h5 className='font-semibold text-xs text-muted-foreground mb-1'>
                        Reasoning:
                      </h5>
                      <p className='text-sm text-muted-foreground leading-relaxed'>
                        {pred.reasoning}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trends */}
      {insights.trends && insights.trends.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <TrendingUp className='h-5 w-5 text-blue-600' />
              Key Trends Analysis
              <Badge variant='secondary'>{insights.trends.length}</Badge>
            </CardTitle>
            <CardDescription>
              Identified patterns and their strategic implications
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              {insights.trends.map((trend, index) => {
                const config = getDirectionConfig(trend.direction);
                const DirectionIcon = config.icon;

                return (
                  <div
                    key={index}
                    className='border-2 rounded-lg p-4 space-y-3 bg-white hover:shadow-lg transition-all'
                  >
                    <div className='flex items-start gap-3'>
                      <div className={`p-2 rounded ${config.color}`}>
                        <DirectionIcon className='h-5 w-5' />
                      </div>
                      <div className='flex-1 space-y-2'>
                        <div className='flex items-center gap-2 flex-wrap'>
                          <h4 className='font-semibold text-sm'>
                            {trend.trend}
                          </h4>
                          {trend.significance && (
                            <Badge
                              variant='outline'
                              className={
                                trend.significance === 'high'
                                  ? 'bg-red-50 text-red-700 border-red-200'
                                  : trend.significance === 'medium'
                                  ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                  : 'bg-gray-50 text-gray-700 border-gray-200'
                              }
                            >
                              {trend.significance.toUpperCase()}
                            </Badge>
                          )}
                        </div>
                        <p className='text-sm text-muted-foreground leading-relaxed'>
                          {trend.impact}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Risk Assessment */}
      {insights.riskAssessment && insights.riskAssessment.length > 0 && (
        <Card className='border-red-200 bg-red-50/30'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <ShieldAlert className='h-5 w-5 text-red-600' />
              Risk Assessment
              <Badge variant='secondary'>
                {insights.riskAssessment.length}
              </Badge>
            </CardTitle>
            <CardDescription>
              Identified risks with mitigation strategies
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='space-y-4'>
              {insights.riskAssessment.map((risk, index) => (
                <div
                  key={index}
                  className='border-2 rounded-lg p-5 space-y-3 bg-white hover:shadow-lg transition-all'
                >
                  <div className='flex items-start justify-between gap-3 flex-wrap'>
                    <h4 className='font-bold text-base flex items-center gap-2'>
                      <AlertCircle className='h-5 w-5 text-red-600' />
                      {risk.risk}
                    </h4>
                    <div className='flex gap-2 flex-wrap'>
                      <Badge
                        variant='outline'
                        className={
                          risk.severity === 'high'
                            ? 'bg-red-100 text-red-800 border-red-300'
                            : risk.severity === 'medium'
                            ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                            : 'bg-blue-100 text-blue-800 border-blue-300'
                        }
                      >
                        {risk.severity.toUpperCase()} SEVERITY
                      </Badge>
                      <Badge
                        variant='outline'
                        className={
                          risk.likelihood === 'high'
                            ? 'bg-red-100 text-red-800 border-red-300'
                            : risk.likelihood === 'medium'
                            ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                            : 'bg-gray-100 text-gray-800 border-gray-300'
                        }
                      >
                        {risk.likelihood.toUpperCase()} LIKELIHOOD
                      </Badge>
                    </div>
                  </div>

                  <div className='bg-green-50 border border-green-200 rounded p-4'>
                    <h5 className='font-semibold text-sm text-green-900 mb-2 flex items-center gap-2'>
                      <CheckCircle2 className='h-4 w-4' />
                      Mitigation Strategy
                    </h5>
                    <p className='text-sm text-green-800 leading-relaxed'>
                      {risk.mitigation}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Opportunities */}
      {insights.opportunities && insights.opportunities.length > 0 && (
        <Card className='border-green-200 bg-green-50/30'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Zap className='h-5 w-5 text-green-600' />
              Growth Opportunities
              <Badge variant='secondary'>{insights.opportunities.length}</Badge>
            </CardTitle>
            <CardDescription>
              Identified opportunities to capitalize on
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='space-y-4'>
              {insights.opportunities.map((opp, index) => (
                <div
                  key={index}
                  className='border-2 rounded-lg p-5 space-y-3 bg-white hover:shadow-lg transition-all'
                >
                  <div className='flex items-start justify-between gap-3 flex-wrap'>
                    <h4 className='font-bold text-base flex items-center gap-2'>
                      <Zap className='h-5 w-5 text-green-600' />
                      {opp.opportunity}
                    </h4>
                    <Badge
                      variant='outline'
                      className={
                        opp.potential === 'high'
                          ? 'bg-green-100 text-green-800 border-green-300'
                          : opp.potential === 'medium'
                          ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                          : 'bg-blue-100 text-blue-800 border-blue-300'
                      }
                    >
                      {opp.potential.toUpperCase()} POTENTIAL
                    </Badge>
                  </div>

                  <div className='bg-blue-50 border border-blue-200 rounded p-4'>
                    <h5 className='font-semibold text-sm text-blue-900 mb-2 flex items-center gap-2'>
                      <Target className='h-4 w-4' />
                      Action Plan
                    </h5>
                    <p className='text-sm text-blue-800 leading-relaxed'>
                      {opp.actionPlan}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Competitive Insights */}
      {insights.competitiveInsights &&
        insights.competitiveInsights.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Award className='h-5 w-5 text-purple-600' />
                Competitive Insights
                <Badge variant='secondary'>
                  {insights.competitiveInsights.length}
                </Badge>
              </CardTitle>
              <CardDescription>
                Performance benchmarking and positioning
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className='space-y-4'>
                {insights.competitiveInsights.map((insight, index) => (
                  <div
                    key={index}
                    className='border-2 rounded-lg p-5 space-y-3 bg-gradient-to-br from-purple-50 to-blue-50 hover:shadow-lg transition-all'
                  >
                    <h4 className='font-bold text-base'>{insight.insight}</h4>

                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                      <div className='bg-white border rounded p-3'>
                        <h5 className='font-semibold text-xs text-muted-foreground mb-1'>
                          Comparison
                        </h5>
                        <p className='text-sm leading-relaxed'>
                          {insight.comparison}
                        </p>
                      </div>

                      <div className='bg-white border rounded p-3'>
                        <h5 className='font-semibold text-xs text-muted-foreground mb-1'>
                          Recommendation
                        </h5>
                        <p className='text-sm text-primary font-medium leading-relaxed'>
                          {insight.recommendation}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

      {/* Disclaimer */}
      <Alert className='border-2'>
        <Info className='h-4 w-4' />
        <AlertTitle className='font-semibold'>AI-Generated Analysis</AlertTitle>
        <AlertDescription>
          These insights are generated by Claude 3.5 Haiku based on current data
          patterns and should be used as strategic guidance alongside human
          expertise. Regular review and validation with domain experts and
          stakeholders is strongly recommended.
        </AlertDescription>
      </Alert>
    </div>
  );
}
