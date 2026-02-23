'use client'

import {
  Circle,
  CircleDot,
  Clock,
  CircleCheck,
  Send,
  Check,
} from 'lucide-react'

interface SubmissionWorkflowProps {
  currentStatus: string
}

const steps = [
  {
    key: 'draft',
    label: 'Draft',
    icon: Circle,
    description: 'Submission created',
  },
  {
    key: 'data_collection',
    label: 'Data Collection',
    icon: CircleDot,
    description: 'Gathering metrics & evidence',
  },
  {
    key: 'in_review',
    label: 'In Review',
    icon: Clock,
    description: 'Under internal review',
  },
  {
    key: 'approved',
    label: 'Approved',
    icon: CircleCheck,
    description: 'Approved for submission',
  },
  {
    key: 'submitted',
    label: 'Submitted',
    icon: Send,
    description: 'Submitted to regulatory body',
  },
]

export function SubmissionWorkflow({ currentStatus }: SubmissionWorkflowProps) {
  const currentIndex = steps.findIndex((s) => s.key === currentStatus)

  return (
    <div className="w-full">
      {/* Desktop View */}
      <div className="hidden sm:flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = index < currentIndex
          const isCurrent = index === currentIndex
          const isPending = index > currentIndex
          const Icon = step.icon

          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-initial">
              {/* Step */}
              <div className="flex flex-col items-center text-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                    isCompleted
                      ? 'bg-emerald-500 border-emerald-500'
                      : isCurrent
                      ? 'bg-blue-500 border-blue-500'
                      : 'bg-background border-muted-foreground/30'
                  }`}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5 text-white" />
                  ) : (
                    <Icon
                      className={`h-5 w-5 ${
                        isCurrent ? 'text-white' : 'text-muted-foreground/50'
                      }`}
                    />
                  )}
                </div>
                <p
                  className={`text-xs mt-2 font-medium ${
                    isCompleted
                      ? 'text-emerald-600'
                      : isCurrent
                      ? 'text-blue-600'
                      : 'text-muted-foreground'
                  }`}
                >
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 max-w-[100px]">
                  {step.description}
                </p>
              </div>

              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 mt-[-28px] ${
                    index < currentIndex ? 'bg-emerald-500' : 'bg-muted-foreground/20'
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Mobile View - Vertical */}
      <div className="sm:hidden space-y-3">
        {steps.map((step, index) => {
          const isCompleted = index < currentIndex
          const isCurrent = index === currentIndex
          const Icon = step.icon

          return (
            <div key={step.key} className="flex items-center gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                    isCompleted
                      ? 'bg-emerald-500 border-emerald-500'
                      : isCurrent
                      ? 'bg-blue-500 border-blue-500'
                      : 'bg-background border-muted-foreground/30'
                  }`}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4 text-white" />
                  ) : (
                    <Icon
                      className={`h-4 w-4 ${
                        isCurrent ? 'text-white' : 'text-muted-foreground/50'
                      }`}
                    />
                  )}
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`w-0.5 h-4 ${
                      index < currentIndex ? 'bg-emerald-500' : 'bg-muted-foreground/20'
                    }`}
                  />
                )}
              </div>
              <div>
                <p
                  className={`text-sm font-medium ${
                    isCompleted
                      ? 'text-emerald-600'
                      : isCurrent
                      ? 'text-blue-600'
                      : 'text-muted-foreground'
                  }`}
                >
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
