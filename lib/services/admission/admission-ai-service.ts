import Anthropic from '@anthropic-ai/sdk';
import {
  AdmissionDashboardAnalytics,
  AdmissionAIInsights
} from '@/types/admission';

/**
 * AdmissionAIService
 *
 * Service for generating AI-powered insights from admissions analytics data
 * using Claude 3.5 Haiku API.
 *
 * Features:
 * - Comprehensive analysis of admissions analytics
 * - Actionable recommendations with implementation steps
 * - Data-driven predictions with reasoning
 * - Risk assessment and mitigation strategies
 * - Opportunity identification and action plans
 * - Competitive insights and benchmarking
 */
export class AdmissionAIService {
  private static anthropic: Anthropic | null = null;

  /**
   * Initialize Anthropic client
   */
  private static getClient(): Anthropic {
    if (!this.anthropic) {
      const apiKey = process.env.CLAUDE_API_KEY;

      if (!apiKey || apiKey === 'your-api-key-here') {
        throw new Error(
          'CLAUDE_API_KEY is not configured. Please add your API key to .env file.'
        );
      }

      this.anthropic = new Anthropic({
        apiKey: apiKey
      });
    }

    return this.anthropic;
  }

  /**
   * Generate AI insights from analytics data
   *
   * @param analytics - Complete dashboard analytics data
   * @returns AI-generated insights with recommendations, predictions, and trends
   */
  static async generateInsights(
    analytics: AdmissionDashboardAnalytics
  ): Promise<AdmissionAIInsights> {
    try {
      const client = this.getClient();

      // Prepare analytics summary for AI
      const analyticsSummary = this.prepareAnalyticsSummary(analytics);

      // Build comprehensive prompt
      const prompt = this.buildAnalysisPrompt(analyticsSummary, analytics);

      // Call Claude API with Claude 3.5 Haiku
      const response = await client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 4096,
        temperature: 0.7,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      // Extract text content from response
      const textContent = response.content.find((c) => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text content in Claude response');
      }

      // Log response length for debugging

      // Parse AI response into structured insights
      const insights = this.parseAIResponse(textContent.text);

      return {
        ...insights,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('[admission/ai-service] Error generating insights:', error);
      throw error;
    }
  }

  /**
   * Prepare concise analytics summary for AI prompt
   */
  private static prepareAnalyticsSummary(
    analytics: AdmissionDashboardAnalytics
  ): string {
    const {
      overview,
      statusBreakdown,
      demographics,
      academicPerformance,
      institutionDistribution,
      geographic,
      referenceSources,
      timeTrends
    } = analytics;

    const total = overview.totalAdmissions || 1; // Avoid division by zero

    return `
## ADMISSIONS ANALYTICS SUMMARY

### Combined Overview
- Combined Total: ${overview.combinedTotal} (Admissions + Direct Students)
- Total Applications: ${overview.totalAdmissions}
- Total Students: ${overview.totalStudents}
- Onboarded (Active): ${overview.onboarded} (${overview.onboardingRate.toFixed(1)}%)
- Direct Students: ${overview.directStudents}

### Admission Pipeline
- Pending: ${overview.pending} (${(total > 0 ? (overview.pending / total) * 100 : 0).toFixed(1)}%)
- Approved: ${overview.approved} (${(total > 0 ? (overview.approved / total) * 100 : 0).toFixed(1)}%)
- Rejected: ${overview.rejected} (${(total > 0 ? (overview.rejected / total) * 100 : 0).toFixed(1)}%)
- Waitlisted: ${overview.waitlisted} (${(total > 0 ? (overview.waitlisted / total) * 100 : 0).toFixed(1)}%)
- Enrolled: ${overview.enrolled} (${(total > 0 ? (overview.enrolled / total) * 100 : 0).toFixed(1)}%)
- Conversion Rate: ${overview.conversionRate.toFixed(1)}%
- Average Processing Time: ${overview.avgProcessingDays.toFixed(1)} days

### Demographics
- Gender: ${demographics.gender.map((g) => `${g.label}: ${g.count}`).join(', ')}
- Religion: ${demographics.religion
      .slice(0, 3)
      .map((r) => `${r.label}: ${r.count}`)
      .join(', ')}
- Community: ${demographics.community
      .slice(0, 3)
      .map((c) => `${c.label}: ${c.count}`)
      .join(', ')}
- First Graduate: ${demographics.firstGraduate
      .map((fg) => `${fg.label}: ${fg.count}`)
      .join(', ')}

### Academic Performance
- Average 10th Marks: ${academicPerformance.averageMarks.tenth.toFixed(1)}%
- Average 12th Marks: ${academicPerformance.averageMarks.twelfth.toFixed(1)}%
${
  academicPerformance.averageMarks.neet
    ? `- Average NEET Score: ${academicPerformance.averageMarks.neet.toFixed(
        1
      )}`
    : ''
}

### Top Institutions & Programs
- Institutions: ${institutionDistribution.institutions
      .slice(0, 3)
      .map((i) => `${i.name} (${i.count})`)
      .join(', ')}
- Degrees: ${institutionDistribution.degrees
      .slice(0, 3)
      .map((d) => `${d.name} (${d.count})`)
      .join(', ')}
- Departments: ${institutionDistribution.departments
      .slice(0, 3)
      .map((d) => `${d.name} (${d.count})`)
      .join(', ')}

### Geographic Distribution
- Top States: ${geographic.states
      .slice(0, 5)
      .map((s) => `${s.state} (${s.count})`)
      .join(', ')}
- Top Districts: ${geographic.districts
      .slice(0, 5)
      .map((d) => `${d.district} (${d.count})`)
      .join(', ')}

### Reference Sources
${referenceSources
  .slice(0, 5)
  .map((r) => `- ${r.type}: ${r.count} (${r.percentage.toFixed(1)}%)`)
  .join('\n')}

### Time Trends
- Daily Average (last 7 days): ${(
      timeTrends.daily.slice(-7).reduce((sum, d) => sum + d.count, 0) /
      Math.min(7, timeTrends.daily.length)
    ).toFixed(1)} applications/day
- Monthly Trend: ${
      timeTrends.monthly.length > 1
        ? timeTrends.monthly[timeTrends.monthly.length - 1].count >
          timeTrends.monthly[timeTrends.monthly.length - 2].count
          ? 'Increasing'
          : 'Decreasing'
        : 'Stable'
    }
- Peak Period: ${timeTrends.peakPeriods[0]?.period || 'N/A'} with ${
      timeTrends.peakPeriods[0]?.count || 0
    } applications
    `.trim();
  }

  /**
   * Build comprehensive analysis prompt for Claude 3.5 Haiku
   */
  private static buildAnalysisPrompt(
    summary: string,
    analytics: AdmissionDashboardAnalytics
  ): string {
    return `You are a senior educational admissions strategist and data analyst with 15+ years of experience in higher education analytics. Analyze the following admissions data and provide deep, actionable insights that drive strategic decision-making.

${summary}

Provide a comprehensive analysis in the following JSON format:

{
  "summary": "A compelling 3-4 sentence executive summary highlighting the most critical findings, key opportunities, and urgent concerns",

  "keyFindings": [
    {
      "title": "Short, impactful title",
      "description": "Detailed explanation of this finding with specific data points",
      "severity": "critical|warning|info|success"
    }
  ],

  "recommendations": [
    {
      "category": "Category (e.g., 'Marketing & Outreach', 'Process Optimization', 'Quality Enhancement', 'Resource Allocation', 'Student Success')",
      "priority": "high|medium|low",
      "insight": "Deep analysis of what the data reveals and why it matters",
      "action": "Clear, specific, actionable recommendation with measurable outcomes",
      "expectedImpact": "Quantifiable expected impact (e.g., '15-20% increase in conversions', 'Reduce processing time by 3 days')",
      "implementationSteps": [
        "Step 1: Specific action",
        "Step 2: Specific action",
        "Step 3: Specific action"
      ]
    }
  ],

  "predictions": [
    {
      "metric": "Specific metric (e.g., 'Q2 Application Volume', 'Conversion Rate', 'Enrollment Numbers')",
      "prediction": "Detailed prediction with specific numbers/percentages where possible",
      "confidence": "high|medium|low",
      "timeline": "Time frame (e.g., 'Next 30 days', 'Next quarter', 'Next academic year')",
      "reasoning": "Data-driven explanation of why this prediction is being made"
    }
  ],

  "trends": [
    {
      "trend": "Detailed description of the observed trend with specifics",
      "direction": "up|down|stable",
      "impact": "Comprehensive analysis of potential impact on admissions goals, enrollment, and institutional objectives",
      "significance": "high|medium|low"
    }
  ],

  "riskAssessment": [
    {
      "risk": "Specific risk identified in the data",
      "severity": "high|medium|low",
      "likelihood": "high|medium|low",
      "mitigation": "Detailed mitigation strategy with specific actions"
    }
  ],

  "opportunities": [
    {
      "opportunity": "Specific opportunity identified in the data",
      "potential": "high|medium|low",
      "actionPlan": "Detailed action plan to capitalize on this opportunity"
    }
  ],

  "competitiveInsights": [
    {
      "insight": "Insight about performance relative to industry benchmarks",
      "comparison": "How this compares to typical institutions (if applicable)",
      "recommendation": "How to improve competitive position"
    }
  ]
}

Analysis Guidelines:
1. **Be Data-Driven**: Reference specific numbers, percentages, and trends from the data
2. **Be Strategic**: Think beyond tactics to long-term institutional goals
3. **Be Specific**: Avoid generic advice; provide concrete, actionable steps
4. **Be Comprehensive**: Cover all aspects - quality, quantity, efficiency, diversity, and success
5. **Be Realistic**: Recommendations should be implementable with reasonable resources
6. **Key Findings**: Provide 3-4 critical findings that leadership needs to know
7. **Recommendations**: Provide 4-5 prioritized recommendations with implementation steps (keep steps concise)
8. **Predictions**: Make 2-3 data-driven predictions with clear reasoning
9. **Trends**: Identify 3-4 significant trends with impact analysis
10. **Risk Assessment**: Identify 2-3 risks with mitigation strategies
11. **Opportunities**: Highlight 2-3 opportunities with action plans
12. **Competitive Insights**: Provide 1-2 competitive insights if applicable

Focus Areas:
- Conversion funnel optimization
- Processing efficiency and timeline reduction
- Demographic diversity and inclusion
- Academic quality and standards
- Geographic reach and market penetration
- Reference source effectiveness
- Seasonal patterns and capacity planning
- Student success indicators
- ROI and resource allocation
- Competitive positioning

CRITICAL JSON FORMATTING RULES:
1. Return ONLY valid JSON, nothing else
2. Use double quotes for all strings
3. Escape all quotes inside strings with backslash (\")
4. Do not include markdown code blocks
5. Ensure all strings are properly terminated
6. Keep each string field under 500 characters to avoid truncation
7. Keep implementation steps to 3-4 short bullet points
8. Do not use special characters that need escaping (avoid apostrophes, use "and" instead of "&")
9. Test your JSON is valid before returning
10. Keep total response under 6000 tokens

Analyze now and return ONLY the JSON object:`;
  }

  /**
   * Parse Claude's JSON response into structured insights
   */
  private static parseAIResponse(
    responseText: string
  ): Omit<AdmissionAIInsights, 'generatedAt'> {
    try {
      // Remove markdown code blocks if present
      let cleanedText = responseText.trim();
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText
          .replace(/^```json\n?/, '')
          .replace(/\n?```$/, '');
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }

      // Try to extract JSON if there's text before/after
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedText = jsonMatch[0];
      }

      // Try to parse
      let parsed;
      try {
        parsed = JSON.parse(cleanedText);
      } catch (parseError) {
        // If parsing fails, try to fix common issues
        console.error(
          '[admission/ai-service] Initial JSON parse failed, attempting to fix...'
        );

        // Remove any trailing commas
        cleanedText = cleanedText.replace(/,(\s*[}\]])/g, '$1');

        // Try parsing again
        parsed = JSON.parse(cleanedText);
      }

      // Validate structure
      if (!parsed.summary) {
        throw new Error('Invalid AI response structure - missing summary');
      }

      // Parse and validate key findings
      const keyFindings = Array.isArray(parsed.keyFindings)
        ? parsed.keyFindings.map((finding: any) => ({
            title: String(finding.title || ''),
            description: String(finding.description || ''),
            severity: ['critical', 'warning', 'info', 'success'].includes(
              finding.severity?.toLowerCase()
            )
              ? finding.severity.toLowerCase()
              : 'info'
          }))
        : [];

      // Parse and validate recommendations
      const recommendations = Array.isArray(parsed.recommendations)
        ? parsed.recommendations.map((rec: any) => ({
            category: String(rec.category || 'General'),
            priority: ['high', 'medium', 'low'].includes(
              rec.priority?.toLowerCase()
            )
              ? rec.priority.toLowerCase()
              : 'medium',
            insight: String(rec.insight || ''),
            action: String(rec.action || ''),
            expectedImpact: String(rec.expectedImpact || ''),
            implementationSteps: Array.isArray(rec.implementationSteps)
              ? rec.implementationSteps.map((step: any) => String(step))
              : []
          }))
        : [];

      // Parse and validate predictions
      const predictions = Array.isArray(parsed.predictions)
        ? parsed.predictions.map((pred: any) => ({
            metric: String(pred.metric || ''),
            prediction: String(pred.prediction || ''),
            confidence: ['high', 'medium', 'low'].includes(
              pred.confidence?.toLowerCase()
            )
              ? pred.confidence.toLowerCase()
              : 'medium',
            timeline: String(pred.timeline || ''),
            reasoning: String(pred.reasoning || '')
          }))
        : [];

      // Parse and validate trends
      const trends = Array.isArray(parsed.trends)
        ? parsed.trends.map((trend: any) => ({
            trend: String(trend.trend || ''),
            direction: ['up', 'down', 'stable'].includes(
              trend.direction?.toLowerCase()
            )
              ? trend.direction.toLowerCase()
              : 'stable',
            impact: String(trend.impact || ''),
            significance: ['high', 'medium', 'low'].includes(
              trend.significance?.toLowerCase()
            )
              ? trend.significance.toLowerCase()
              : 'medium'
          }))
        : [];

      // Parse and validate risk assessment
      const riskAssessment = Array.isArray(parsed.riskAssessment)
        ? parsed.riskAssessment.map((risk: any) => ({
            risk: String(risk.risk || ''),
            severity: ['high', 'medium', 'low'].includes(
              risk.severity?.toLowerCase()
            )
              ? risk.severity.toLowerCase()
              : 'medium',
            likelihood: ['high', 'medium', 'low'].includes(
              risk.likelihood?.toLowerCase()
            )
              ? risk.likelihood.toLowerCase()
              : 'medium',
            mitigation: String(risk.mitigation || '')
          }))
        : [];

      // Parse and validate opportunities
      const opportunities = Array.isArray(parsed.opportunities)
        ? parsed.opportunities.map((opp: any) => ({
            opportunity: String(opp.opportunity || ''),
            potential: ['high', 'medium', 'low'].includes(
              opp.potential?.toLowerCase()
            )
              ? opp.potential.toLowerCase()
              : 'medium',
            actionPlan: String(opp.actionPlan || '')
          }))
        : [];

      // Parse and validate competitive insights
      const competitiveInsights = Array.isArray(parsed.competitiveInsights)
        ? parsed.competitiveInsights.map((insight: any) => ({
            insight: String(insight.insight || ''),
            comparison: String(insight.comparison || ''),
            recommendation: String(insight.recommendation || '')
          }))
        : [];

      return {
        summary: String(parsed.summary),
        keyFindings,
        recommendations,
        predictions,
        trends,
        riskAssessment,
        opportunities,
        competitiveInsights
      };
    } catch (error) {
      console.error('[admission/ai-service] Error parsing AI response:', error);
      console.error(
        '[admission/ai-service] Raw response length:',
        responseText.length
      );
      console.error(
        '[admission/ai-service] Raw response (first 1000 chars):',
        responseText.substring(0, 1000)
      );
      console.error(
        '[admission/ai-service] Raw response (last 1000 chars):',
        responseText.substring(Math.max(0, responseText.length - 1000))
      );

      // Return fallback insights
      return {
        summary:
          'Unable to generate comprehensive AI insights at this time. Please try again later.',
        keyFindings: [
          {
            title: 'Analysis Error',
            description:
              'The AI analysis encountered an error while processing your data.',
            severity: 'warning'
          }
        ],
        recommendations: [
          {
            category: 'System',
            priority: 'high',
            insight: 'AI analysis encountered an error',
            action: 'Please check the API configuration and try again',
            expectedImpact: 'N/A',
            implementationSteps: []
          }
        ],
        predictions: [],
        trends: [],
        riskAssessment: [],
        opportunities: [],
        competitiveInsights: []
      };
    }
  }

  /**
   * Validate API key configuration
   */
  static isConfigured(): boolean {
    const apiKey = process.env.CLAUDE_API_KEY;
    return !!apiKey && apiKey !== 'your-api-key-here';
  }

  /**
   * Get configuration status message
   */
  static getConfigStatus(): { configured: boolean; message: string } {
    const configured = this.isConfigured();

    return {
      configured,
      message: configured
        ? 'Claude API is configured and ready'
        : 'Claude API key not configured. Add CLAUDE_API_KEY to your .env file.'
    };
  }
}
