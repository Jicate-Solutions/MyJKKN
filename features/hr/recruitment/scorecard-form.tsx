'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSubmitScorecard } from '@/hooks/hr/use-recruitment-interviews';
import {
  SCORECARD_RECOMMENDATION_LABELS,
  type ScorecardRecommendation,
} from '@/types/hr-recruitment';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

// ---- Rating star/button component ----
function RatingPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`w-9 h-9 rounded-md text-sm font-medium border transition-colors ${
              n <= value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-input hover:bg-muted'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- Recommendation radio group ----
const RECOMMENDATIONS: ScorecardRecommendation[] = [
  'strong_hire',
  'hire',
  'neutral',
  'no_hire',
  'strong_no_hire',
];

const RECOMMENDATION_COLORS: Record<ScorecardRecommendation, string> = {
  strong_hire:    'border-green-500 bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-200',
  hire:           'border-emerald-400 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200',
  neutral:        'border-gray-400 bg-gray-50 text-gray-700 dark:bg-gray-800/30 dark:text-gray-300',
  no_hire:        'border-orange-400 bg-orange-50 text-orange-800 dark:bg-orange-900/20 dark:text-orange-200',
  strong_no_hire: 'border-red-500 bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-200',
};

interface ScorecardFormProps {
  interviewId: string;
  onSuccess?: () => void;
}

export function ScorecardForm({ interviewId, onSuccess }: ScorecardFormProps) {
  const submit = useSubmitScorecard();

  const [ratingOverall, setRatingOverall] = useState(0);
  const [ratingTechnical, setRatingTechnical] = useState(0);
  const [ratingCommunication, setRatingCommunication] = useState(0);
  const [ratingCultureFit, setRatingCultureFit] = useState(0);
  const [recommendation, setRecommendation] = useState<ScorecardRecommendation | ''>('');
  const [strengths, setStrengths] = useState('');
  const [concerns, setConcerns] = useState('');

  const canSubmit =
    ratingOverall > 0 &&
    recommendation !== '' &&
    !submit.isPending;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      await submit.mutateAsync({
        interview_id: interviewId,
        rating_overall: ratingOverall,
        rating_technical: ratingTechnical || null,
        rating_communication: ratingCommunication || null,
        rating_culture_fit: ratingCultureFit || null,
        recommendation: recommendation as ScorecardRecommendation,
        strengths: strengths.trim() || null,
        concerns: concerns.trim() || null,
      });
      toast.success('Scorecard submitted');
      onSuccess?.();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Submit Your Scorecard</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Ratings */}
        <RatingPicker
          label="Overall Rating (required)"
          value={ratingOverall}
          onChange={setRatingOverall}
        />
        <RatingPicker
          label="Technical Skills"
          value={ratingTechnical}
          onChange={setRatingTechnical}
        />
        <RatingPicker
          label="Communication"
          value={ratingCommunication}
          onChange={setRatingCommunication}
        />
        <RatingPicker
          label="Culture Fit"
          value={ratingCultureFit}
          onChange={setRatingCultureFit}
        />

        {/* Recommendation */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Recommendation (required)</Label>
          <div className="flex flex-wrap gap-2">
            {RECOMMENDATIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRecommendation(r)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border-2 transition-all ${
                  recommendation === r
                    ? RECOMMENDATION_COLORS[r]
                    : 'border-transparent bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {SCORECARD_RECOMMENDATION_LABELS[r]}
              </button>
            ))}
          </div>
        </div>

        {/* Comments */}
        <div className="space-y-1.5">
          <Label htmlFor="strengths" className="text-sm font-medium">Strengths</Label>
          <Textarea
            id="strengths"
            placeholder="What stood out positively?"
            value={strengths}
            onChange={(e) => setStrengths(e.target.value)}
            rows={3}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="concerns" className="text-sm font-medium">Concerns</Label>
          <Textarea
            id="concerns"
            placeholder="Any reservations or areas of weakness?"
            value={concerns}
            onChange={(e) => setConcerns(e.target.value)}
            rows={3}
          />
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full"
        >
          {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit Scorecard
        </Button>
      </CardContent>
    </Card>
  );
}
