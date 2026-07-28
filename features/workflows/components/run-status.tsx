"use client"

import { useRealtimeRun } from "@trigger.dev/react-hooks"
import { Check, ExternalLink, Minus, X } from "lucide-react"

import type {
  RunProgress,
  runWorkflowTask,
  StepReport,
} from "@/features/workflows/task/run-workflow"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

/** Terminal statuses that mean the run stopped without completing. */
const FAILED_STATUSES = [
  "FAILED",
  "CRASHED",
  "SYSTEM_FAILURE",
  "CANCELED",
  "EXPIRED",
  "TIMED_OUT",
]

const STEP_ICON = {
  completed: Check,
  failed: X,
  skipped: Minus,
} as const

/**
 * Live status of a single task run. Subscribes over Trigger.dev realtime, so it
 * updates without polling and needs no refresh of the surrounding page.
 *
 * The status alone only says a run is in progress. What the task writes to its
 * metadata as it goes — which step it is on, how each one ended — is what makes
 * that legible, so this reads the two together.
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
    // metadata is deliberately not skipped — it is what drives the progress
    // below, and this is the subscription that delivers it.
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

  // Metadata is free-form JSON on the wire, so the shapes the task writes are
  // named here rather than inferred. Every read stays optional — the first
  // frames of a run arrive before the task has set any of this.
  const meta = run.metadata as
    | {
        progress?: RunProgress
        steps?: StepReport[]
        sessionUrl?: string | null
      }
    | undefined

  const progress = meta?.progress
  const steps = meta?.steps ?? []
  const sessionUrl = meta?.sessionUrl

  return (
    <div className="flex w-56 flex-col items-end gap-1.5">
      <Badge
        variant={
          isFailed ? "destructive" : isFinished ? "default" : "secondary"
        }
        className="gap-1.5"
      >
        {!isFinished && <Spinner className="size-3" />}
        {run.status}
      </Badge>

      {progress && progress.total > 0 ? (
        <div className="flex w-full flex-col gap-1">
          <Progress
            value={(progress.completed / progress.total) * 100}
            className="gap-1"
          />

          <p className="flex w-full items-baseline justify-between gap-2 text-xs text-muted-foreground">
            {/* The step being worked on while running, and nothing once the
                run is over — "current" is null by then either way. */}
            <span className="truncate">{progress.current?.title ?? ""}</span>
            <span className="shrink-0 tabular-nums">
              {progress.completed}/{progress.total}
            </span>
          </p>
        </div>
      ) : null}

      {steps.length > 0 ? (
        <ul className="flex w-full flex-col gap-0.5">
          {steps.map((step) => {
            const Icon = STEP_ICON[step.status]

            return (
              <li
                key={step.nodeId}
                className="flex items-center gap-1.5 text-xs"
                // The message is the only place a failure's reason is shown in
                // full, since the row itself truncates.
                title={step.error ?? step.title}
              >
                <Icon
                  className={cn(
                    "size-3 shrink-0",
                    step.status === "failed"
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}
                />
                <span
                  className={cn(
                    "truncate",
                    step.status === "failed"
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}
                >
                  {step.title}
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}

      {sessionUrl ? (
        <a
          href={sessionUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          <ExternalLink className="size-3" />
          Watch session
        </a>
      ) : null}

      {run.output ? (
        <p className="text-xs text-muted-foreground">{run.output.message}</p>
      ) : null}
    </div>
  )
}
