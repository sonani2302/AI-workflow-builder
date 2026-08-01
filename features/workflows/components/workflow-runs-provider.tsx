"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import * as Sentry from "@sentry/nextjs"
import { useRealtimeRunsWithTag } from "@trigger.dev/react-hooks"
import type { RealtimeRun } from "@trigger.dev/core/v3"

import { refreshRunsTokenAction } from "@/features/workflows/actions"
import { workflowRunsTag } from "@/features/workflows/lib/run-tag"
import type { NodeType } from "@/features/workflows/nodes/node-registry"
import type {
  RunStep,
  runWorkflowTask,
} from "@/features/workflows/task/run-workflow"

// One subscription to a workflow's runs, held above the canvas so every node
// reads the same live state. Subscribing per node would open a socket each and
// have them disagree while the updates landed at different moments.

/**
 * How long to hold a token before minting the next one.
 *
 * Under RUNS_TOKEN_EXPIRATION, and by a wide enough margin that a slow or
 * failed renewal has room for another attempt before the one in hand runs out.
 * Renewing is a round trip and a resubscribe, so the margin is bought at a
 * price worth paying once an hour and not more often.
 */
const REFRESH_RUNS_TOKEN_AFTER_MS = 45 * 60 * 1000

/**
 * How long a queued run may go unreported before the subscription is assumed
 * dead and rebuilt.
 *
 * The one moment this page can *prove* the subscription has stopped working:
 * a run has been accepted, so it certainly exists, and the stream that promised
 * to carry it has not. Everything else about a quiet subscription looks exactly
 * like a workflow nobody is running.
 *
 * Long enough not to fire on an ordinary slow hop — a run usually lands within
 * a second — and short enough that the recovery happens while the run it is
 * chasing is still going.
 */
const QUEUED_RUN_GRACE_MS = 8_000

/**
 * How long the tab must have been hidden before returning to it rebuilds the
 * subscription.
 *
 * A stream is most likely to have been dropped while nobody was watching —
 * a sleeping machine, a backgrounded tab whose socket the browser reclaimed.
 * The threshold is what keeps ordinary tab-switching from reconnecting on every
 * glance.
 */
const RESUBSCRIBE_AFTER_HIDDEN_MS = 30_000

// Exported because the console shows a run's own details — when it started, its
// status, how long it took — and a component taking one needs to say so.
export type WorkflowRun = RealtimeRun<typeof runWorkflowTask>

type WorkflowRunsValue = {
  runs: WorkflowRun[]
  error: Error | undefined
  /**
   * A run that has been queued but that the subscription has not reported yet,
   * or null.
   *
   * There is a real gap between the two: the action returns a run id as soon as
   * Trigger.dev accepts the run, and the tag subscription takes a moment longer
   * to carry it back. Held here rather than in whichever component started the
   * run, because more than one place has to cover that gap — the button, which
   * must offer Stop straight away, and the console, which must show the run
   * straight away — and two copies would disagree about when it had closed.
   */
  queuedRunId: string | null
  /** Called with the id the run action returned. */
  setQueuedRunId: (runId: string) => void
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
   * was opened. Mint it on the server with createRunsToken.
   *
   * The first one only. It expires, and this component mints its replacements —
   * see the effect below.
   */
  accessToken: string
  children: React.ReactNode
}) {
  // The token actually in use, which is the server's to begin with and this
  // component's from the first renewal on.
  const [token, setToken] = useState(accessToken)

  // Which prop the state above came from, so a server render carrying a
  // different token replaces it. Navigating from one workflow to another
  // renders this same provider with a new id and a new token rather than
  // mounting a fresh one, and without this the subscription would move to the
  // new workflow holding the old workflow's credential.
  const [tokenSource, setTokenSource] = useState(accessToken)

  if (tokenSource !== accessToken) {
    setTokenSource(accessToken)
    setToken(accessToken)
  }

  /**
   * Whether the subscription below is meant to be running.
   *
   * This is the reconnect, and it works the way it does because of how the hook
   * is built. useRealtimeRunsWithTag opens its stream in an effect keyed on
   * `[tag, stop, enabled]` and then iterates it to exhaustion — so when that
   * stream ends, for any reason, nothing starts another. No error is raised
   * either: the loop simply finishes, `error` stays undefined, and the canvas
   * goes quiet while runs carry on perfectly well on the server.
   *
   * Of those three keys, `enabled` is the only one this side can move. Turning
   * it off runs the hook's cleanup, which aborts the dead stream; turning it
   * back on re-runs the effect, which opens a new one with whatever token is
   * current. So a resubscribe here is a deliberate off-and-on again.
   */
  const [subscribed, setSubscribed] = useState(true)

  const resubscribe = useCallback(() => setSubscribed(false), [])

  useEffect(() => {
    if (subscribed) {
      return
    }

    // A timeout rather than setting it back in this same effect body: the hook
    // has to see the false in a completed render for its cleanup to run, and
    // flipping it synchronously would coalesce the two into one render that
    // never tears the old stream down.
    const timer = setTimeout(() => setSubscribed(true), 0)

    return () => clearTimeout(timer)
  }, [subscribed])

  // By tag rather than by run id, because the canvas has no id to go on until a
  // run exists: the tag is known from the workflow alone, so the subscription
  // can be standing before anything is queued and pick a new run up on its own.
  const { runs, error } = useRealtimeRunsWithTag<typeof runWorkflowTask>(
    workflowRunsTag(workflowId),
    {
      accessToken: token,
      // Without a token the hook throws rather than sitting idle, so a page
      // rendered before one is minted is held back instead of crashing. The
      // second half is the reconnect described above.
      enabled: Boolean(token) && subscribed,
    }
  )

  useEffect(() => {
    // Reset per token rather than measured from mount, so the elapsed time
    // below is always "since the one in hand was minted".
    let mintedAt = Date.now()
    let cancelled = false

    async function renew() {
      try {
        const next = await refreshRunsTokenAction(workflowId)

        if (!cancelled) {
          mintedAt = Date.now()
          setToken(next)

          // Without this the new token would sit unused. The hook reads it
          // through an api client it rebuilds on change, but its subscription
          // effect does not depend on that client — so the stream carries on
          // with the credential it opened on, and expires anyway.
          resubscribe()
        }
      } catch (renewError) {
        // Reported rather than surfaced. The token in hand is still good for
        // the rest of its hour, so one failed renewal is not yet a broken
        // canvas — but a run of these is the subscription about to go quiet,
        // which is exactly the silence this whole mechanism exists to prevent.
        Sentry.logger.warn("Could not refresh the runs token", {
          workflow_id: workflowId,
          reason: renewError instanceof Error ? renewError.message : "unknown",
        })
      }
    }

    const timer = setInterval(renew, REFRESH_RUNS_TOKEN_AFTER_MS)

    // When the tab was last hidden, so returning to it can tell a glance
    // elsewhere from an afternoon away.
    let hiddenAt: number | null = null

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now()

        return
      }

      const away = hiddenAt === null ? 0 : Date.now() - hiddenAt

      hiddenAt = null

      // A timer does not run while the machine is asleep, so a laptop shut for
      // two hours wakes with an expired token and an interval that thinks it
      // has minutes to go. Coming back is the moment to check the clock rather
      // than the timer.
      if (Date.now() - mintedAt >= REFRESH_RUNS_TOKEN_AFTER_MS) {
        // Renewing resubscribes on its own, so this covers both.
        void renew()
      } else if (away >= RESUBSCRIBE_AFTER_HIDDEN_MS) {
        // The token is fine; the stream may not be. Sockets are the first thing
        // a browser reclaims from a background tab.
        resubscribe()
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [workflowId, accessToken, resubscribe])

  const [queuedRunId, setQueuedRunId] = useState<string | null>(null)

  // Cleared the moment the subscription knows about the run, whatever it has to
  // say about it. Waiting for it to be *live* would strand a run that failed on
  // its first instant, which arrives already finished — the question this
  // answers is "has the subscription caught up", not "is it still going".
  //
  // Adjusted during render rather than in an effect, which is React's own way
  // to reconcile state with something that has changed underneath it: an effect
  // would let one render go out with both the placeholder and the real run in
  // the list.
  if (queuedRunId && runs.some(({ id }) => id === queuedRunId)) {
    setQueuedRunId(null)
  }

  // A run was accepted and the stream has not mentioned it. Given long enough,
  // that is proof the subscription is no longer working — the run exists, so
  // there is nothing else for the silence to mean.
  //
  // One attempt per queued run rather than a loop: the effect is keyed on the
  // id, which the clearing above removes the moment the rebuilt subscription
  // reports it. If the rebuild does not help, the next run starts this over,
  // which is better than reconnecting every few seconds for as long as the tab
  // stays open.
  useEffect(() => {
    if (!queuedRunId) {
      return
    }

    const timer = setTimeout(() => {
      Sentry.logger.warn("Queued run never arrived; resubscribing", {
        workflow_id: workflowId,
        run_id: queuedRunId,
        waited_ms: QUEUED_RUN_GRACE_MS,
      })

      resubscribe()
    }, QUEUED_RUN_GRACE_MS)

    return () => clearTimeout(timer)
  }, [queuedRunId, workflowId, resubscribe])

  const value = useMemo(
    () => ({ runs, error, queuedRunId, setQueuedRunId }),
    [runs, error, queuedRunId]
  )

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
 * When that session opened, which is where its recording starts.
 *
 * Output only, and for the same reason as the id above rather than merely to
 * match it: the two are only ever read together, and a start time without a
 * recording to measure against is nothing anyone can use.
 *
 * Read as if optional because a run recorded before the task stamped this has a
 * session id and no start time, and there is no honest way to guess one — the
 * run's own createdAt is earlier than the session by however long it spent
 * queued. Those runs keep their whole-run replay and get no per-step clips,
 * which is the truthful outcome.
 */
export function runSessionStartedAt(run: WorkflowRun): number | null {
  return run.output?.sessionStartedAt ?? null
}

/**
 * Which part of a run's recording belongs to one step, as milliseconds from the
 * start of the video, or null when the step has no part of it.
 *
 * Null on every step that should not offer a replay, and the cases are worth
 * naming because they are all ordinary rather than faults:
 *
 * - the trigger, and any step the run never reached — neither ever started;
 * - a step still running, which has no end yet;
 * - a step that touched no page, which would otherwise be handed the previous
 *   step's view of the browser sitting idle;
 * - a run with no recording, or one old enough not to have stamped its session
 *   start.
 *
 * The start is clamped at zero because the first browser step of a run opens the
 * session inside its own window: it begins before there is anything to record,
 * so its slice is the recording from the top rather than a negative offset.
 */
export function stepClip(
  entry: RunHistoryEntry,
  step: HistoricalRunStep
): { startMs: number; endMs: number } | null {
  const { sessionId, sessionStartedAt } = entry

  if (!sessionId || sessionStartedAt === null) {
    return null
  }

  if (
    !step.usedBrowser ||
    step.startedAt === undefined ||
    step.durationMs === undefined
  ) {
    return null
  }

  const endMs = step.startedAt + step.durationMs - sessionStartedAt

  // A step whose window closed before the recording began. Not reachable by the
  // clock alone — a step that used the browser cannot have finished before the
  // session it opened existed — but the two timestamps are written at different
  // points in the run, and a clip running backwards is worse than none.
  if (endMs <= 0) {
    return null
  }

  return { startMs: Math.max(0, step.startedAt - sessionStartedAt), endMs }
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
  /** Where that session's recording starts — see runSessionStartedAt. */
  sessionStartedAt: number | null
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
          sessionStartedAt: runSessionStartedAt(run),
        })),
    [runs]
  )
}
