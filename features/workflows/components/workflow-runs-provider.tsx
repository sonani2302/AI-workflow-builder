"use client"

import { createContext, useContext, useMemo } from "react"
import { useRealtimeRunsWithTag } from "@trigger.dev/react-hooks"
import type { RealtimeRun } from "@trigger.dev/core/v3"

import { workflowRunsTag } from "@/features/workflows/lib/run-tag"
import type { NodeType } from "@/features/workflows/nodes/node-registry"
import type {
  RunStep,
  runWorkflowTask,
} from "@/features/workflows/task/run-workflow"

// One subscription to a workflow's runs, held above the canvas so every node
// reads the same live state. Subscribing per node would open a socket each and
// have them disagree while the updates landed at different moments.

// Exported because the console shows a run's own details — when it started, its
// status, how long it took — and a component taking one needs to say so.
export type WorkflowRun = RealtimeRun<typeof runWorkflowTask>

type WorkflowRunsValue = {
  runs: WorkflowRun[]
  error: Error | undefined
}

const WorkflowRunsContext = createContext<WorkflowRunsValue | null>(null)

export function WorkflowRunsProvider({
  workflowId,
  accessToken,
  children,
}: {
  workflowId: string
  /**
   * Scoped to read this workflow's tag, not one run — the subscription below
   * follows every run of the workflow, including ones started before this page
   * was opened. Mint it on the server with auth.createPublicToken.
   */
  accessToken: string
  children: React.ReactNode
}) {
  // By tag rather than by run id, because the canvas has no id to go on until a
  // run exists: the tag is known from the workflow alone, so the subscription
  // can be standing before anything is queued and pick a new run up on its own.
  const { runs, error } = useRealtimeRunsWithTag<typeof runWorkflowTask>(
    workflowRunsTag(workflowId),
    {
      accessToken,
      // Without a token the hook throws rather than sitting idle, so a page
      // rendered before one is minted is held back instead of crashing.
      enabled: Boolean(accessToken),
    }
  )

  const value = useMemo(() => ({ runs, error }), [runs, error])

  return <WorkflowRunsContext value={value}>{children}</WorkflowRunsContext>
}

export function useWorkflowRuns() {
  const value = useContext(WorkflowRunsContext)

  if (!value) {
    throw new Error(
      "useWorkflowRuns must be used inside a WorkflowRunsProvider"
    )
  }

  return value
}

/**
 * The newest run of this workflow, or null before one has ever been started.
 *
 * Everything that shows a run reads it from here rather than from a run id of
 * its own, so the badge in the sidebar and the nodes on the canvas can never
 * end up describing two different runs — which is exactly what happens when a
 * second run is started while the first is still going.
 */
export function useLatestRun(): WorkflowRun | null {
  const { runs } = useWorkflowRuns()

  return useMemo(
    () =>
      // Newest by createdAt rather than by position: the hook makes no promise
      // about the order runs arrive in, and a run updating mid-list could move
      // it.
      runs.reduce<WorkflowRun | null>(
        (newest, run) =>
          !newest || run.createdAt > newest.createdAt ? run : newest,
        null
      ),
    [runs]
  )
}

/** Whether a run has not finished yet. */
export function isRunLive(run: WorkflowRun) {
  // The run's own booleans rather than a list of status strings to keep in step
  // with the ones Trigger.dev adds.
  return run.isQueued || run.isExecuting
}

/**
 * A step as the console reads it, rather than as the task writes it.
 *
 * The difference is what the console is allowed to assume. RunStep describes
 * what a run records *today*, and there its type and title are always there. But
 * the console reads runs that have already happened, and a stored run is only
 * ever the shape it was written in — steps recorded before a step carried its
 * own type and title have neither, however confidently RunStep types them.
 *
 * So the type is admitted as possibly unknown, and every reader has to face
 * that. It is a real state, not a defect: the run genuinely did not record which
 * node it was.
 */
export type HistoricalRunStep = Omit<RunStep, "type" | "title"> & {
  type: NodeType | null
  title: string
}

/**
 * One run's steps, however that run happens to be carrying them.
 *
 * Output first, then metadata. They carry the same list, but by different
 * routes: metadata is streamed as the run walks the graph and is the only
 * source while it is still moving, and the output is delivered once at the end
 * and kept. Preferring the output means a finished run reads the same on a page
 * opened an hour later as it did live, without depending on the last flush
 * having gone out before the run ended.
 *
 * Normalised on the way out, and this is the place for it: everything downstream
 * gets one shape it can rely on, instead of each panel having to know which
 * fields a run of a given age left out.
 */
export function runSteps(run: WorkflowRun): HistoricalRunStep[] {
  // The metadata side needs the cast because metadata is an open record — the
  // task writes progress and sessionUrl under there too, and none of it comes
  // back typed. The output side is the task's own return type and does not.
  const steps =
    run.output?.steps ?? (run.metadata?.steps as RunStep[] | undefined) ?? []

  return steps.map((step) => ({
    ...step,
    // Both of these are asserted by RunStep and absent in practice on an old
    // enough run, so both are read as if optional. Falling back to the node id
    // for the title because that is the one thing every step has ever carried,
    // and a blank row would be worse than a raw id.
    type: step.type ?? null,
    title: step.title ?? step.nodeId,
  }))
}

/**
 * The Browserbase session this run drove, or null if there is nothing to play.
 *
 * Output only, unlike runSteps above, which falls back to metadata so a live run
 * has something to show. There is deliberately no such fallback here: the run
 * knows its session id from the moment it opens the session, but Browserbase
 * only finishes writing the recording once that session closes at the end of the
 * run. An id read live would therefore be a real id with no replay behind it,
 * and a player handed one would fail rather than wait. Coming in with the output
 * means the id and the recording become available together.
 *
 * Null on three different runs, and a panel should treat them alike: one still
 * going, one whose steps needed no browser, and one that ended by throwing —
 * a run that fails returns no output at all, so its session is only reachable
 * from the sessionUrl in metadata.
 */
export function runSessionId(run: WorkflowRun): string | null {
  return run.output?.sessionId ?? null
}

/**
 * The newest run's per-node statuses, and whether it is still going.
 */
export function useLatestRunSteps(): {
  steps: HistoricalRunStep[]
  isLive: boolean
} {
  const latest = useLatestRun()

  return useMemo(
    () =>
      latest
        ? { steps: runSteps(latest), isLive: isRunLive(latest) }
        : { steps: [], isLive: false },
    [latest]
  )
}

/** A run and what it did, which is what the console lists. */
export type RunHistoryEntry = {
  run: WorkflowRun
  steps: HistoricalRunStep[]
  isLive: boolean
  /** The session to replay, once there is one — see runSessionId. */
  sessionId: string | null
}

/**
 * Every run of this workflow, newest first, each with its steps.
 *
 * Sorted here rather than in the panel for the same reason useLatestRun picks
 * by createdAt: the hook makes no promise about the order runs arrive in, so a
 * list left as it comes would reshuffle itself as a live run updates. Newest
 * first because that is the run someone opening the console is looking for.
 */
export function useRunHistory(): RunHistoryEntry[] {
  const { runs } = useWorkflowRuns()

  return useMemo(
    () =>
      // A copy before sorting: runs belongs to the hook, and sorting in place
      // would be reaching into its state.
      [...runs]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((run) => ({
          run,
          steps: runSteps(run),
          isLive: isRunLive(run),
          sessionId: runSessionId(run),
        })),
    [runs]
  )
}
