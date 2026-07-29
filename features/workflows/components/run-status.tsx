"use client"

import { ExternalLink } from "lucide-react"

import type { RunProgress } from "@/features/workflows/task/run-workflow"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import {
  useLatestRun,
  useWorkflowRuns,
} from "@/features/workflows/components/workflow-runs-provider"

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
 * Live status of this workflow's newest run.
 *
 * Reads the canvas' shared subscription rather than opening one of its own on
 * the run this browser happened to start. That is what stops the badge here and
 * the nodes out on the canvas describing two different runs when a second run
 * begins before the first has finished — and it saves a socket and a token.
 *
 * How far along the run is, and which step it is on, comes from what the task
 * writes to its metadata as it goes. The per-node statuses it also publishes
 * under "steps" are not read here: they are keyed by node id, which belongs to
 * the canvas, where a node can colour itself.
 */
export function RunStatus() {
  const { error } = useWorkflowRuns()
  const run = useLatestRun()

  if (error) {
    return <p className="text-xs text-destructive">{error.message}</p>
  }

  // Nothing to report until this workflow has been run at least once. A run
  // from an earlier sitting still counts: the nodes already show where it got
  // to, so the badge saying so too is the consistent answer.
  if (!run) {
    return null
  }

  const isFailed = FAILED_STATUSES.includes(run.status)
  const isFinished = isFailed || run.status === "COMPLETED"

  // Metadata is free-form JSON on the wire, so the shapes the task writes are
  // named here rather than inferred. Every read stays optional — the first
  // frames of a run arrive before the task has set any of this.
  const meta = run.metadata as
    | {
        progress?: RunProgress
        sessionUrl?: string | null
      }
    | undefined

  const progress = meta?.progress
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
