"use client"

import { Play } from "lucide-react"
import prettyMs from "pretty-ms"

import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { NodeIcon } from "@/features/workflows/components/node-icon"
import {
  useRunHistory,
  useWorkflowRuns,
  type HistoricalRunStep,
  type RunHistoryEntry,
} from "@/features/workflows/components/workflow-runs-provider"

// Every run of this workflow, each with its steps under it. Reads the canvas'
// shared subscription rather than opening one of its own, so the console and the
// nodes out on the canvas are always describing the same runs.

/**
 * Which step is being looked at, named by the run it belongs to as well as the
 * node — the same node has a step in every run of the workflow, so a node id
 * alone would select one row in each of them.
 */
export type SelectedStep = { kind: "step"; runId: string; nodeId: string }

/**
 * A run's recording, which is the one row in this list that stands for a whole
 * run rather than a step of it — so it is named by the run alone, with no node.
 */
export type SelectedReplay = { kind: "replay"; runId: string }

/**
 * Whatever the console is currently showing in its output pane.
 *
 * A union rather than a step with an optional flag, because the two are read
 * differently at the other end: one is looked up among a run's steps, the other
 * is the run's session id. Making them separate shapes means the panel cannot
 * reach for a node id that a replay does not have.
 */
export type ConsoleSelection = SelectedStep | SelectedReplay

/**
 * One string that names a selection, whichever kind it is.
 *
 * Comparing selections is the only thing anything needs to do with them — is
 * this row the selected one, and does clicking it mean deselect — and a key does
 * that for both kinds without either caller having to branch on the kind first.
 * The prefix is what keeps the two namespaces apart, so a run's replay can never
 * collide with one of its steps.
 */
export function selectionKey(selection: ConsoleSelection) {
  return selection.kind === "step"
    ? `step:${selection.runId}:${selection.nodeId}`
    : `replay:${selection.runId}`
}

/** Whether these two name the same row. */
function isSameSelection(a: ConsoleSelection | null, b: ConsoleSelection) {
  return a !== null && selectionKey(a) === selectionKey(b)
}

/**
 * The shared look of a selectable row in this list.
 *
 * Held as one string rather than written out per row, because the replay row is
 * meant to read as a peer of the step rows — same height, same hover, same
 * selected state — and two copies of that would drift apart the first time one
 * of them was adjusted.
 */
const ROW_CLASS =
  "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground"

// One step: the node's own icon and title, and how long it took.
function StepRow({
  step,
  isLive,
  isSelected,
  onClick,
}: {
  step: HistoricalRunStep
  /** Whether the run this step belongs to is still going. */
  isLive: boolean
  isSelected: boolean
  onClick: () => void
}) {
  // Only spins while the run is still going. A finished run leaves its last
  // statuses standing and one of them can be "running" — the step it stopped
  // on, or one cut short when the run was cancelled or timed out — and spinning
  // on that forever would claim work is still happening. Same reasoning as the
  // node on the canvas, which is why the two agree.
  const isRunning = step.status === "running" && isLive
  const isFailed = step.status === "failed"

  // Dimmed because the run never got this far, rather than because it went
  // wrong. A step left showing "running" by a run that stopped is not this: it
  // did start, so it reads as an ordinary step that simply never reported a
  // duration.
  const neverRan = step.status === "pending"

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className={cn(
        ROW_CLASS,
        isSelected && "bg-accent text-accent-foreground",
        neverRan && "opacity-50"
      )}
    >
      {/* The spinner goes inside the chip, in the icon's place, so a running
          step keeps its accent colour and the row does not gain a second mark
          that has to be lined up with the first. */}
      <NodeIcon type={step.type} running={isRunning} className="size-5" />

      {/* The title the run recorded rather than the node's current one, so a
          run keeps describing the graph it actually walked. */}
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-medium",
          isFailed && "text-destructive"
        )}
      >
        {step.title}
      </span>

      {/* Nothing on the right until there is a duration to put there: a step
          still going has not got one yet, and the chip is already saying so. */}
      {step.durationMs === undefined ? null : (
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {prettyMs(step.durationMs)}
        </span>
      )}
    </button>
  )
}

// The run's recording, sitting at the end of its steps.
function ReplayRow({
  isSelected,
  onClick,
}: {
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className={cn(ROW_CLASS, isSelected && "bg-accent text-accent-foreground")}
    >
      {/* The chip is shaped like a step's, so the row lines up with the ones
          above it, but deliberately muted rather than given an accent colour:
          every colour in this list belongs to a node, and this row is not one.
          It is the run's own recording, which is why it sits at the end rather
          than among the steps in the order they ran. */}
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Play className="size-3.5" />
      </span>

      <span className="min-w-0 flex-1 truncate font-medium">Replay</span>

      {/* Nothing on the right. A step earns a duration by being one thing that
          took a measurable time; the recording spans the whole run, and the run
          header two lines up is already showing that. */}
    </button>
  )
}

// One run: a header saying how it went, then its steps.
function RunGroup({
  entry,
  selected,
  onSelect,
}: {
  entry: RunHistoryEntry
  selected: ConsoleSelection | null
  onSelect: (selection: ConsoleSelection) => void
}) {
  const { run, steps, isLive, sessionId } = entry

  // Both halves of the condition are checked, though the first nearly implies
  // the second: a session id only ever arrives with the run's output, and a run
  // that has not finished has no output yet. Saying "and it has finished" here
  // anyway keeps the rule where the row is built, rather than resting on where
  // the id happens to be read from today.
  //
  // A run with no id at all is the ordinary case for a graph whose steps needed
  // no browser, and for one that ended by throwing — neither gets a row.
  const hasReplay = Boolean(sessionId) && !isLive

  return (
    <li className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2 px-1.5 py-0.5">
        {/* The run's own booleans rather than a list of status strings, to keep
            in step with the ones Trigger.dev adds. */}
        <Badge
          variant={
            run.isFailed || run.isCancelled
              ? "destructive"
              : run.isSuccess
                ? "default"
                : "secondary"
          }
          className="gap-1.5"
        >
          {isLive && <Spinner className="size-3" />}
          {run.status}
        </Badge>

        <span className="truncate text-xs text-muted-foreground">
          {run.createdAt.toLocaleTimeString()}
        </span>

        {/* The run's total, which is more than its steps add up to: it also
            covers queueing and opening the browser session. Held back while the
            run is live, when it is still climbing. */}
        {!isLive && run.durationMs > 0 ? (
          <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
            {prettyMs(run.durationMs)}
          </span>
        ) : null}
      </div>

      {steps.length === 0 && !hasReplay ? (
        // The gap between a run being queued and its first metadata arriving.
        <p className="px-1.5 py-1 text-xs text-muted-foreground">
          No steps yet
        </p>
      ) : (
        <ul className="flex flex-col">
          {steps.map((step) => {
            const id: ConsoleSelection = {
              kind: "step",
              runId: run.id,
              nodeId: step.nodeId,
            }

            return (
              <li key={step.nodeId}>
                <StepRow
                  step={step}
                  isLive={isLive}
                  isSelected={isSameSelection(selected, id)}
                  onClick={() => onSelect(id)}
                />
              </li>
            )
          })}

          {/* Inside the same list as the steps rather than after it, so it is
              one of the run's rows and not a second thing under them. */}
          {hasReplay ? (
            <li>
              <ReplayRow
                isSelected={isSameSelection(selected, {
                  kind: "replay",
                  runId: run.id,
                })}
                onClick={() => onSelect({ kind: "replay", runId: run.id })}
              />
            </li>
          ) : null}
        </ul>
      )}
    </li>
  )
}

/**
 * The console's list of runs, newest first, with each run's steps under it.
 *
 * Reports clicks rather than holding the selection itself, so the panel around
 * it can show the selected step's output beside this list.
 */
export function LogsPanel({
  selected,
  onSelect,
}: {
  selected: ConsoleSelection | null
  onSelect: (selection: ConsoleSelection) => void
}) {
  const { error } = useWorkflowRuns()
  const history = useRunHistory()

  return (
    // size-full rather than flex-1: this fills a resizable panel, which sets
    // its own width and is not a flex container for what it holds.
    <div className="flex size-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-1.5 text-sm font-semibold">
        Runs
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {/* Said out loud rather than left to look like an empty history: a
            subscription that could not be opened has no runs to show either,
            and "No runs yet" would be the wrong reading of it. */}
        {error ? (
          <p className="px-1.5 py-1 text-xs text-destructive">
            {error.message}
          </p>
        ) : history.length === 0 ? (
          <p className="px-1.5 py-1 text-xs text-muted-foreground">
            No runs yet
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {history.map((entry) => (
              <RunGroup
                key={entry.run.id}
                entry={entry}
                selected={selected}
                onSelect={onSelect}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
