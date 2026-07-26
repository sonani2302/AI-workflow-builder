/**
 * Canvas column of the workflow editor, filling the space above the logs.
 */
export function Canvas({ workflowId }: { workflowId: string }) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-1">
      <span className="text-sm font-medium">Canvas</span>
      <span className="font-mono text-xs text-muted-foreground">
        {workflowId}
      </span>
    </div>
  )
}
