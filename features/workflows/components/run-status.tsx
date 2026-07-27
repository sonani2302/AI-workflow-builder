"use client"

import { useRealtimeRun } from "@trigger.dev/react-hooks"

import type { runWorkflowTask } from "@/features/workflows/task/run-workflow"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"

/** Terminal statuses that mean the run stopped without completing. */
const FAILED_STATUSES = [
  "FAILED",
  "CRASHED",
  "SYSTEM_FAILURE",
  "CANCELED",
  "EXPIRED",
  "TIMED_OUT",
]

/**
 * Live status of a single task run. Subscribes over Trigger.dev realtime, so it
 * updates without polling and needs no refresh of the surrounding page.
 */
export function RunStatus({
  runId,
  accessToken,
}: {
  runId: string
  accessToken: string
}) {
  // Typing the hook with the task makes run.output the task's return value.
  const { run, error } = useRealtimeRun<typeof runWorkflowTask>(runId, {
    accessToken,
    // The payload is the whole graph we just sent, so skip shipping it back.
    skipColumns: ["payload"],
  })

  if (error) {
    return <p className="text-xs text-destructive">{error.message}</p>
  }

  if (!run) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Spinner className="size-3" />
        Connecting…
      </p>
    )
  }

  const isFailed = FAILED_STATUSES.includes(run.status)
  const isFinished = isFailed || run.status === "COMPLETED"

  return (
    <div className="flex flex-col items-center gap-1.5">
      <Badge
        variant={
          isFailed ? "destructive" : isFinished ? "default" : "secondary"
        }
        className="gap-1.5"
      >
        {!isFinished && <Spinner className="size-3" />}
        {run.status}
      </Badge>

      {run.output ? (
        <p className="text-xs text-muted-foreground">{run.output.message}</p>
      ) : null}
    </div>
  )
}
