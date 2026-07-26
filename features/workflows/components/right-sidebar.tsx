"use client"

import { useState, useTransition } from "react"
import { Play } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { runWorkflowAction } from "@/features/workflows/actions"
import { RunStatus } from "@/features/workflows/components/run-status"

/**
 * Inspector column of the workflow editor, docked to the right of the canvas.
 */
export function RightSidebar({ workflowId }: { workflowId: string }) {
  const [isPending, startTransition] = useTransition()
  const [handle, setHandle] = useState<{
    runId: string
    accessToken: string
  } | null>(null)

  // The pending flag also guards against a double click queueing two runs.
  const handleRun = () => {
    startTransition(async () => {
      try {
        setHandle(await runWorkflowAction(workflowId))
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not start the run"
        )
      }
    })
  }

  return (
    <div className="flex size-full flex-col items-center justify-center gap-3">
      <Button onClick={handleRun} disabled={isPending}>
        <Play />
        Run
      </Button>

      {/* Keyed by run id so each new run remounts with a fresh subscription. */}
      {handle ? (
        <RunStatus
          key={handle.runId}
          runId={handle.runId}
          accessToken={handle.accessToken}
        />
      ) : null}
    </div>
  )
}
