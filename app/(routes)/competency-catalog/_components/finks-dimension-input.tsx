'use client';

// ============================================================================
// Fink's Dimension Input Component
// Six sliders/inputs for measuring human differentiation in the AI era
// ============================================================================

import { useState } from 'react';
import { Info, Sparkles } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import type { FinksDimensions } from '@/types/competency';

// ============================================================================
// CONSTANTS
// ============================================================================

interface DimensionConfig {
  key: keyof FinksDimensions;
  label: string;
  shortLabel: string;
  description: string;
  isAiProof: boolean;
  color: string;
  bgColor: string;
  borderColor: string;
  placeholder: string;
}

const DIMENSIONS: DimensionConfig[] = [
  {
    key: 'foundational_knowledge',
    label: 'Foundational Knowledge',
    shortLabel: 'Knowledge',
    description: 'Facts, terms, formulas, concepts, principles, theories',
    isAiProof: false,
    color: 'text-slate-700',
    bgColor: 'bg-slate-100',
    borderColor: 'border-slate-300',
    placeholder: 'AI has perfect recall - lowest priority'
  },
  {
    key: 'application',
    label: 'Application',
    shortLabel: 'Application',
    description: 'Critical/creative thinking, practical skills, managing projects',
    isAiProof: false,
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    borderColor: 'border-blue-300',
    placeholder: 'AI applies knowledge - medium priority'
  },
  {
    key: 'integration',
    label: 'Integration',
    shortLabel: 'Integration',
    description: 'Connecting ideas, people, realms of life; seeing patterns across disciplines',
    isAiProof: false,
    color: 'text-purple-700',
    bgColor: 'bg-purple-100',
    borderColor: 'border-purple-300',
    placeholder: 'Requires human context - high priority'
  },
  {
    key: 'human_dimension',
    label: 'Human Dimension',
    shortLabel: 'Human',
    description: 'Learning about oneself and others; understanding social contexts',
    isAiProof: true,
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-100',
    borderColor: 'border-emerald-300',
    placeholder: 'AI lacks self-awareness - CRITICAL'
  },
  {
    key: 'caring',
    label: 'Caring',
    shortLabel: 'Caring',
    description: 'Developing new feelings, interests, values; ethical judgment',
    isAiProof: true,
    color: 'text-rose-700',
    bgColor: 'bg-rose-100',
    borderColor: 'border-rose-300',
    placeholder: 'AI has no moral compass - CRITICAL'
  },
  {
    key: 'learning_to_learn',
    label: 'Learning How to Learn',
    shortLabel: 'Meta-Learning',
    description: 'Becoming self-directed learner; learning to ask/answer questions',
    isAiProof: true,
    color: 'text-amber-700',
    bgColor: 'bg-amber-100',
    borderColor: 'border-amber-300',
    placeholder: 'Adapting to AI evolution - CRITICAL'
  }
];

// ============================================================================
// PROPS
// ============================================================================

interface FinksDimensionInputProps {
  value: FinksDimensions;
  onChange: (dimensions: FinksDimensions) => void;
  disabled?: boolean;
  showDescriptions?: boolean;
  compact?: boolean;
  highlightAiProof?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function FinksDimensionInput({
  value,
  onChange,
  disabled = false,
  showDescriptions = true,
  compact = false,
  highlightAiProof = true
}: FinksDimensionInputProps) {
  const [focusedDimension, setFocusedDimension] = useState<keyof FinksDimensions | null>(null);

  const handleSliderChange = (key: keyof FinksDimensions, newValue: number[]) => {
    onChange({
      ...value,
      [key]: newValue[0]
    });
  };

  const handleInputChange = (key: keyof FinksDimensions, inputValue: string) => {
    const numValue = parseInt(inputValue);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 10) {
      onChange({
        ...value,
        [key]: numValue
      });
    }
  };

  const renderDimensionRow = (config: DimensionConfig) => {
    const currentValue = value[config.key];
    const isFocused = focusedDimension === config.key;

    return (
      <div
        key={config.key}
        className={`
          p-4 rounded-lg border-2 transition-all
          ${isFocused ? `${config.borderColor} bg-opacity-10 ${config.bgColor}` : 'border-transparent'}
          ${config.isAiProof && highlightAiProof ? 'ring-2 ring-offset-2 ring-primary/20' : ''}
        `}
        onMouseEnter={() => setFocusedDimension(config.key)}
        onMouseLeave={() => setFocusedDimension(null)}
      >
        <div className="flex items-start justify-between gap-4">
          {/* Label and Description */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Label
                htmlFor={`dimension-${config.key}`}
                className="font-semibold text-sm"
              >
                {config.label}
              </Label>
              {config.isAiProof && highlightAiProof && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="default" className="text-xs gap-1 bg-primary">
                        <Sparkles className="h-3 w-3" />
                        AI-Proof
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-semibold mb-1">Human Differentiation</p>
                      <p className="text-xs">{config.placeholder}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>{config.description}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {showDescriptions && !compact && (
              <p className="text-xs text-muted-foreground mb-3">
                {config.description}
              </p>
            )}
          </div>

          {/* Numeric Input */}
          <div className="w-16 shrink-0">
            <Input
              id={`dimension-${config.key}`}
              type="number"
              min={0}
              max={100}
              value={currentValue}
              onChange={(e) => handleInputChange(config.key, e.target.value)}
              disabled={disabled}
              className="text-center font-semibold"
              aria-label={`${config.label} value (0-100)`}
            />
          </div>
        </div>

        {/* Slider */}
        <div className="mt-3">
          <Slider
            value={[currentValue]}
            onValueChange={(newValue) => handleSliderChange(config.key, newValue)}
            max={100}
            step={1}
            disabled={disabled}
            className={`w-full ${config.isAiProof && highlightAiProof ? '[&_.bg-primary]:bg-primary' : ''}`}
            aria-label={`${config.label} slider`}
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>0</span>
            <span>50</span>
            <span>100</span>
          </div>
        </div>
      </div>
    );
  };

  const aiProofDimensions = DIMENSIONS.filter(d => d.isAiProof);
  const otherDimensions = DIMENSIONS.filter(d => !d.isAiProof);

  if (compact) {
    return (
      <div className="space-y-2">
        {DIMENSIONS.map(renderDimensionRow)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* AI-Proof Dimensions Section */}
      {highlightAiProof && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">AI-Proof Dimensions</CardTitle>
            </div>
            <CardDescription>
              Critical human capabilities that AI cannot replicate - highest priority for development
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {aiProofDimensions.map(renderDimensionRow)}
          </CardContent>
        </Card>
      )}

      {/* Other Dimensions Section */}
      {highlightAiProof ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Foundational & Applied Dimensions</CardTitle>
            <CardDescription>
              Important capabilities where AI provides augmentation - balance with AI-proof skills
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {otherDimensions.map(renderDimensionRow)}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {DIMENSIONS.map(renderDimensionRow)}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// COMPACT VARIANT FOR FORMS
// ============================================================================

export function FinksDimensionInputCompact({
  value,
  onChange,
  disabled = false
}: Pick<FinksDimensionInputProps, 'value' | 'onChange' | 'disabled'>) {
  return (
    <FinksDimensionInput
      value={value}
      onChange={onChange}
      disabled={disabled}
      showDescriptions={false}
      compact={true}
      highlightAiProof={true}
    />
  );
}

// ============================================================================
// SUMMARY DISPLAY (Read-Only)
// ============================================================================

interface FinksDimensionSummaryProps {
  dimensions: FinksDimensions;
  showLabels?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function FinksDimensionSummary({
  dimensions,
  showLabels = true,
  size = 'md'
}: FinksDimensionSummaryProps) {
  const sizeClasses = {
    sm: 'text-xs gap-1',
    md: 'text-sm gap-2',
    lg: 'text-base gap-3'
  };

  return (
    <div className={`flex flex-wrap ${sizeClasses[size]}`}>
      {DIMENSIONS.map((config) => {
        const value = dimensions[config.key];
        return (
          <TooltipProvider key={config.key}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant={config.isAiProof ? 'default' : 'secondary'}
                  className={`${config.color} ${config.bgColor} gap-1`}
                >
                  {config.isAiProof && <Sparkles className="h-3 w-3" />}
                  {showLabels && `${config.shortLabel}: `}
                  {value}/100
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-semibold">{config.label}</p>
                <p className="text-xs text-muted-foreground">{config.description}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
}
