// lib/services/learners-council/classifier-service.ts
// LC-004: Smart OD Categorization - AI-Ready Classification Service
// Phase 1: Rule-based keyword matching
// Future: Swap RuleBasedClassifier for AIClassifier without refactoring

// ============================================================================
// INTERFACES
// ============================================================================

export interface ClassificationResult {
  category: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  confidence: number; // 0-1
  suggested_route?: string;
}

export interface IClassifier {
  classify(input: string): ClassificationResult;
}

// ============================================================================
// PHASE 1: RULE-BASED CLASSIFIER
// ============================================================================

interface ClassificationRule {
  keywords: string[];
  category: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
}

export class RuleBasedClassifier implements IClassifier {
  private rules: ClassificationRule[] = [
    {
      keywords: ['exam', 'test', 'quiz', 'assessment', 'evaluation', 'viva'],
      category: 'academic',
      priority: 'high',
    },
    {
      keywords: ['event', 'function', 'cultural', 'fest', 'celebration', 'ceremony'],
      category: 'events',
      priority: 'normal',
    },
    {
      keywords: ['meeting', 'conference', 'workshop', 'seminar', 'webinar', 'training'],
      category: 'professional',
      priority: 'normal',
    },
    {
      keywords: ['sports', 'tournament', 'match', 'competition', 'athletics', 'games'],
      category: 'sports',
      priority: 'normal',
    },
    {
      keywords: ['hostel', 'mess', 'food', 'accommodation', 'room', 'canteen'],
      category: 'campus_welfare',
      priority: 'low',
    },
    {
      keywords: ['placement', 'interview', 'recruitment', 'company', 'internship', 'job'],
      category: 'placements',
      priority: 'high',
    },
    {
      keywords: ['nss', 'ncc', 'community', 'service', 'volunteer', 'outreach', 'rural'],
      category: 'extension',
      priority: 'normal',
    },
    {
      keywords: ['research', 'paper', 'journal', 'publication', 'lab', 'project'],
      category: 'research',
      priority: 'normal',
    },
    {
      keywords: ['medical', 'health', 'hospital', 'doctor', 'sick', 'emergency'],
      category: 'medical',
      priority: 'urgent',
    },
  ];

  classify(input: string): ClassificationResult {
    const lower = input.toLowerCase();
    let bestMatch: {
      category: string;
      priority: 'low' | 'normal' | 'high' | 'urgent';
      matchCount: number;
    } | null = null;

    for (const rule of this.rules) {
      const matchCount = rule.keywords.filter((k) => lower.includes(k)).length;
      if (matchCount > 0 && (!bestMatch || matchCount > bestMatch.matchCount)) {
        bestMatch = {
          category: rule.category,
          priority: rule.priority,
          matchCount,
        };
      }
    }

    if (bestMatch) {
      return {
        category: bestMatch.category,
        priority: bestMatch.priority,
        confidence: Math.min(bestMatch.matchCount / 3, 1), // cap at 1.0
      };
    }

    return { category: 'general', priority: 'normal', confidence: 0 };
  }
}

// ============================================================================
// SINGLETON + STATIC HELPER
// ============================================================================

/** Singleton classifier instance for use across the app */
export const classifier = new RuleBasedClassifier();

/** Convenience function — classify a reason string */
export function classifyODRequest(reason: string): ClassificationResult {
  return classifier.classify(reason);
}
