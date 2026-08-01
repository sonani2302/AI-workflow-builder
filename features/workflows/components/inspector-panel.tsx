"use client"

import { Play } from "lucide-react"
import prettyMs from "pretty-ms"

import { NodeIcon } from "@/features/workflows/components/node-icon"
import type {
  ConsoleSelection,
  SelectedReplay,
  SelectedStep,
} from "@/features/workflows/components/logs-panel"
import { SessionReplay } from "@/features/workflows/components/session-replay"
import {
  stepClip,
  useRunHistory,
  type HistoricalRunStep,
} from "@/features/workflows/components/workflow-runs-provider"

// What the selected row amounts to. The console's other half: the list next to
// this says what a run did, and this says what came of the one row picked out of
// it — a step's output, or the recording of the whole run.
//
// Not to be confused with the sidebar's Inspector, which edits a node's fields
// on the canvas. That one is about what a step will do; this is about what it
// did.

/**
 * The frame both kinds of detail sit in: a header strip and a scrolling body.
 *
 * Shared so the pane does not change shape depending on what is selected. The
 * width comes from the resizable panel around it, and the divider from that
 * panel's handle, so neither is set here.
 */
function DetailShell({
  header,
  children,
}: {
  header: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex size-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-1.5 text-sm font-semibold">
        {header}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
    </div>
  )
}

/**
 * What to say when a step has neither an output nor an error to show, which is
 * a different sentence for each of the reasons that can happen.
 */
function emptyNote(step: HistoricalRunStep, isLive: boolean) {
  if (step.status === "pending") {
    return "The run did not reach this step."
  }

  if (step.status === "running") {
    // Or it was, until the run stopped without ever saying how this step ended
    // — cancelled, timed out, or killed mid-step. Both read the same from here,
    // and neither has anything to show.
    return isLive ? "Still running…" : "This step never finished."
  }

  // The trigger, which marks where the run starts rather than doing work.
  return "This step produced nothing."
}

/**
 * The selected step's result: its output as formatted JSON, its error if it
 * failed, or a note when it has neither.
 *
 * Takes the selection rather than the step, and looks it up in the run history
 * itself. That is what lets the panel follow a live step: the row is selected
 * once, and the output appears here as the run publishes it, without the click
 * having had to capture anything.
 */
function StepDetail({ selected }: { selected: SelectedStep }) {
  const history = useRunHistory()

  const entry = history.find(({ run }) => run.id === selected.runId)
  const step = entry?.steps.find(({ nodeId }) => nodeId === selected.nodeId)

  // Spun in the chip below, the same as the row in the list — and only while
  // the run is still going, since a run that stopped can leave a step showing
  // "running" that no longer is.
  const isRunning = step?.status === "running" && Boolean(entry?.isLive)

  // The part of the run's recording this step drove, on the steps that have one
  // — see stepClip for which those are. Null covers rather more than "no video",
  // so nothing is said in its place: a step that opened no page has no missing
  // replay to apologise for, and the pane is already showing what it did do.
  const clip = entry && step ? stepClip(entry, step) : null

  return (
    <DetailShell
      header={
        step ? (
          <>
            <NodeIcon type={step.type} running={isRunning} className="size-5" />
            <span className="min-w-0 flex-1 truncate">{step.title}</span>

            {/* The same duration the row shows, kept here so the output can be
                read without holding the list in view beside it. */}
            {step.durationMs === undefined ? null : (
              <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">
                {prettyMs(step.durationMs)}
              </span>
            )}
          </>
        ) : (
          "Output"
        )
      }
    >
      {/* Above the output rather than below it, because it is the part of this
          pane someone came looking for on a step that went wrong: the JSON says
          what the step reported, and the video says what the page was doing
          while it did. Keyed by the step as well as the session so moving
          between steps of one run starts a player aimed at the new clip — the
          component would re-aim an existing one, but the recording is fetched
          per mount and a fresh one is the simpler thing to reason about. */}
      {clip && entry?.sessionId ? (
        <SessionReplay
          key={`${entry.sessionId}:${selected.nodeId}`}
          sessionId={entry.sessionId}
          clip={clip}
          className="mb-3"
        />
      ) : null}

      {!step ? (
        // The selected step is gone from the history — a graph re-run without
        // that node, or a run that has aged out of the subscription.
        <p className="text-xs text-muted-foreground">
          This step is no longer in the run history.
        </p>
      ) : step.error ? (
        // The message as the run recorded it, wrapped rather than truncated:
        // this is the one thing on the page worth reading in full.
        <p className="text-xs whitespace-pre-wrap text-destructive">
          {step.error}
        </p>
      ) : step.output ? (
        // Indented JSON rather than a rendering per output shape: every node
        // type reports its own, and the registry declares the paths a later
        // step can read, so what matters here is seeing the shape those paths
        // walk. break-all because a step's output is mostly URLs and
        // selectors, which have nowhere to wrap on their own.
        <pre className="font-mono text-xs break-all whitespace-pre-wrap">
          {JSON.stringify(step.output, null, 2)}
        </pre>
      ) : (
        <p className="text-xs text-muted-foreground">
          {emptyNote(step, Boolean(entry?.isLive))}
        </p>
      )}
    </DetailShell>
  )
}

/**
 * The selected run's recording.
 *
 * Looks the session id up in the history rather than taking it from the click,
 * for the same reason StepDetail looks its step up: the row that opened this is
 * one row in a list that keeps updating, and a captured id would be a copy that
 * stops agreeing with it.
 */
function ReplayDetail({ selected }: { selected: SelectedReplay }) {
  const history = useRunHistory()

  const entry = history.find(({ run }) => run.id === selected.runId)

  return (
    <DetailShell
      header={
        <>
          {/* The muted chip from the row in the list, so the pane is visibly
              about the same thing that was clicked. */}
          <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Play className="size-3" />
          </span>

          <span className="min-w-0 flex-1 truncate">Replay</span>

          {/* Which run this is, since the pane no longer names a step and every
              run's replay row says the same word. */}
          {entry ? (
            <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">
              {entry.run.createdAt.toLocaleTimeString()}
            </span>
          ) : null}
        </>
      }
    >
      {/* Both misses are reachable even though the row is only offered on a run
          that has a recording: the selection outlives the row it came from, so a
          run can age out of the subscription while its replay is still open. */}
      {!entry ? (
        <p className="text-xs text-muted-foreground">
          This run is no longer in the run history.
        </p>
      ) : !entry.sessionId ? (
        <p className="text-xs text-muted-foreground">
          This run has no recording.
        </p>
      ) : (
        // Keyed by session so switching runs starts a new player rather than
        // pointing the existing one at a different recording — the component
        // handles a changed id, but a fresh mount is the honest reading of
        // "a different run's replay" and costs nothing here.
        <SessionReplay key={entry.sessionId} sessionId={entry.sessionId} />
      )}
    </DetailShell>
  )
}

/**
 * The console's output pane: whichever kind of row is selected beside it.
 *
 * Split in two rather than one component branching inside itself, because the
 * two share only their frame — a step's detail follows a step through a live run,
 * and a replay is one finished recording. Keeping them apart is also what lets
 * each take a selection it can actually use, instead of one shape with fields
 * that are only sometimes there.
 */
export function InspectorPanel({ selected }: { selected: ConsoleSelection }) {
  return selected.kind === "replay" ? (
    <ReplayDetail selected={selected} />
  ) : (
    <StepDetail selected={selected} />
  )
}
