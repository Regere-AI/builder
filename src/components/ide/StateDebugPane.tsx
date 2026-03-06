import { useState } from 'react'
import { ChevronDown, ChevronRight, Database } from 'lucide-react'
import { useJsonRenderState } from '@/lib/json-render/zustand-store'
import { cn } from '@/lib/utils'

interface StateDebugPaneProps {
  /** When true, pane is shown only when there is JSON/spec UI (e.g. collapsed by default). */
  defaultCollapsed?: boolean
  className?: string
  /** Optional label. */
  label?: string
}

/**
 * Toggle pane that shows the current json-render state (the value passed to StateProvider / JSONUIProvider).
 * Useful for debugging bindings and action state.
 */
export function StateDebugPane({
  defaultCollapsed = true,
  className,
  label = 'State',
}: StateDebugPaneProps) {
  const [open, setOpen] = useState(!defaultCollapsed)
  const state = useJsonRenderState()
  const isEmpty = Object.keys(state).length === 0
  const stateJson = isEmpty ? '{}' : JSON.stringify(state, null, 2)

  return (
    <div
      className={cn(
        'rounded-md border border-[#3e3e3e] bg-[#1e1e1e] overflow-hidden',
        className
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm text-gray-300 hover:bg-[#2d2d2d] border-b border-[#3e3e3e]"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="w-4 h-4 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 shrink-0" />
        )}
        <Database className="w-4 h-4 shrink-0 text-gray-500" />
        <span>{label}</span>
        {isEmpty && (
          <span className="text-xs text-gray-500 ml-1">(empty)</span>
        )}
      </button>
      {open && (
        <pre className="p-2 text-xs text-gray-400 overflow-auto max-h-[200px] font-mono whitespace-pre break-all border-t border-[#3e3e3e]">
          {stateJson}
        </pre>
      )}
    </div>
  )
}
