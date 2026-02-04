import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Step {
  id: number
  label: string
  icon?: React.ReactNode
}

interface StepIndicatorProps {
  steps: Step[]
  currentStep: number
  completedSteps?: number[]
  className?: string
}

export function StepIndicator({ steps, currentStep, completedSteps = [], className }: StepIndicatorProps) {
  const isCompleted = (stepId: number) => completedSteps.includes(stepId) || stepId < currentStep
  const isCurrent = (stepId: number) => stepId === currentStep

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center flex-1">
            {/* Step Circle */}
            <div className="flex flex-col items-center flex-1">
              <div
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300',
                  isCompleted(step.id)
                    ? 'bg-primary border-primary text-primary-foreground'
                    : isCurrent(step.id)
                    ? 'bg-primary border-primary text-primary-foreground ring-4 ring-primary/20'
                    : 'bg-background border-muted text-muted-foreground'
                )}
              >
                {isCompleted(step.id) ? (
                  <Check className="w-5 h-5" />
                ) : step.icon ? (
                  step.icon
                ) : (
                  <span className="text-sm font-semibold">{step.id}</span>
                )}
              </div>
              <span
                className={cn(
                  'mt-2 text-xs font-medium transition-colors',
                  isCompleted(step.id) || isCurrent(step.id)
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connector Line */}
            {index < steps.length - 1 && (
              <div
                className={cn(
                  'h-0.5 flex-1 mx-2 transition-colors duration-300',
                  isCompleted(step.id) ? 'bg-primary' : 'bg-muted'
                )}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
