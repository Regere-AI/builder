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
      <div className="relative flex items-center justify-between">
        {/* Background connector line */}
        <div className="absolute top-5 left-0 right-0 h-0.5 bg-muted -z-10" />
        
        {/* Progress connector line */}
        <div
          className="absolute top-5 left-0 h-0.5 bg-primary transition-all duration-300 -z-10"
          style={{
            width: `${((currentStep - 1) / (steps.length - 1)) * 100}%`,
          }}
        />

        {steps.map((step, index) => (
          <div key={step.id} className="relative flex flex-col items-center flex-1">
            {/* Step Circle */}
            <div
              className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 relative z-10',
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
            {/* Step Label */}
            <span
              className={cn(
                'mt-2 text-xs font-medium transition-colors text-center',
                isCompleted(step.id) || isCurrent(step.id)
                  ? 'text-foreground'
                  : 'text-muted-foreground'
              )}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
