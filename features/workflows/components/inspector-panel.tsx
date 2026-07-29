"use client"

import prettyMs from "pretty-ms"

import { NodeIcon } from "@/features/workflows/components/node-icon"
import type { SelectedStep } from "@/features/workflows/components/logs-panel"
import { useRunHistory } from "@/features/workflows/components/workflow-runs-provider"
import type { RunStep } from "@/features/workflows/task/run-workflow"

// What one step of one run produced. The console's other half: the list next to
// this says which steps there were, and this says what came of the selected one.
//
// Not to be confused with the sidebar's Inspector, which edits a node's fields
// on the canvas. That one is about what a step will do; this is about what it
// did.

/**
 * What to say when a step has neither an output nor an error to show, which is
 * a different sentence for each of the reasons that can happen.
 */
function emptyNote(step: RunStep, isLive: boolean) {
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
export function InspectorPanel({ selected }: { selected: SelectedStep }) {
  const history = useRunHistory()

  const entry = history.find(({ run }) => run.id === selected.runId)
  const step = entry?.steps.find(({ nodeId }) => nodeId === selected.nodeId)

  // Spun in the chip below, the same as the row in the list — and only while
  // the run is still going, since a run that stopped can leave a step showing
  // "running" that no longer is.
  const isRunning = step?.status === "running" && Boolean(entry?.isLive)

  return (
    // The width comes from the resizable panel around it, and the divider from
    // that panel's handle, so neither is set here.
    <div className="flex size-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-1.5 text-sm font-semibold">
        {step ? (
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
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
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
      </div>
    </div>
  )
}
