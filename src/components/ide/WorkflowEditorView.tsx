interface WorkflowEditorViewProps {
  /** Raw workflow JSON string from the .workflow.json file */
  json: string
}

export function WorkflowEditorView({ json }: WorkflowEditorViewProps) {
  return (
    <div className="flex-1 flex items-center justify-center p-8 text-gray-400 text-lg">
      WIP
    </div>
  )
}
