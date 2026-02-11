import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  className?: string
  disabled?: boolean
}

export function Select({ value, options, onChange, className, disabled }: SelectProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const selectRef = React.useRef<HTMLDivElement>(null)

  const selectedOption = options.find(opt => opt.value === value) || options[0]

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleSelect = (optionValue: string) => {
    onChange(optionValue)
    setIsOpen(false)
  }

  return (
    <div ref={selectRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          'flex items-center gap-1 h-8 px-2 bg-transparent border-0 rounded text-xs text-gray-300',
          'hover:bg-[#2a2d2e] transition-colors',
          'focus-visible:outline-none',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          isOpen && 'bg-[#2a2d2e]'
        )}
      >
        <span className="text-left">{selectedOption.label}</span>
        <ChevronDown 
          className={cn(
            'w-3 h-3 text-gray-400 transition-transform',
            isOpen && 'rotate-180'
          )} 
        />
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-1 w-full bg-[#252526] border border-[#3e3e3e] rounded-md shadow-lg z-50 overflow-hidden">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleSelect(option.value)}
              className={cn(
                'w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-[#2a2d2e] transition-colors',
                value === option.value && 'bg-[#2a2d2e] text-[#007acc]'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
