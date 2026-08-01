"use client"

import { useCallback, useMemo, useState, useSyncExternalStore } from "react"
import {
  format,
  formatDistanceToNowStrict,
  isToday,
  isYesterday,
} from "date-fns"
import { ChevronRight, Play } from "lucide-react"
import prettyMs from "pretty-ms"

import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { NodeIcon } from "@/features/workflows/components/node-icon"
import {
  stepClip,
  useRunHistory,
  useWorkflowRuns,
  type HistoricalRunStep,
  type RunHistoryEntry,
  type WorkflowRun,
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

/**
 * Rerenders on an interval, so "2 minutes ago" becomes "3 minutes ago" without
 * anything else having to change.
 *
 * The value is a count of intervals since the epoch, not a time — nothing reads
 * it as one. What it has to be is stable between ticks, which a raw Date.now()
 * is not: useSyncExternalStore compares snapshots to decide whether to rerender,
 * and a value that differs on every call never settles.
 *
 * Null on the server, and that is the point of using a store rather than state
 * set in an effect: the server has no clock to tick, so it renders no relative
 * times, and the client's first render agrees with it before the first tick
 * changes anything. Callers show the absolute time regardless, so what is
 * missing until then is the chattier half of the line rather than the fact.
 */
function useClockTick(intervalMs: number) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const id = setInterval(onChange, intervalMs)

      return () => clearInterval(id)
    },
    [intervalMs]
  )

  const getSnapshot = useCallback(
    () => Math.floor(Date.now() / intervalMs),
    [intervalMs]
  )

  return useSyncExternalStore<number | null>(subscribe, getSnapshot, () => null)
}

/**
 * How a run went, in the words and colour this list uses for it.
 *
 * Derived from the run's own booleans rather than switching on the status
 * string, to keep in step with the ones Trigger.dev adds — a status this does
 * not know still lands on a sensible label because the booleans covering it are
 * the ones being read.
 */
function runOutcome(run: WorkflowRun, isLive: boolean) {
  if (isLive) {
    return {
      label: run.isExecuting ? "Running" : "Queued",
      dot: "bg-primary",
      text: "text-foreground",
    }
  }

  if (run.isCancelled) {
    return {
      label: "Canceled",
      dot: "bg-muted-foreground",
      text: "text-muted-foreground",
    }
  }

  if (run.isFailed) {
    return { label: "Failed", dot: "bg-destructive", text: "text-destructive" }
  }

  if (run.isSuccess) {
    return {
      label: "Completed",
      dot: "bg-emerald-500",
      text: "text-foreground",
    }
  }

  // Anything Trigger.dev reports that none of the booleans above claim. Shown
  // as-is rather than guessed at, so a status this predates still says
  // something true.
  return {
    label: run.status,
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
  }
}

/**
 * One day's heading and the runs under it.
 *
 * queued is declared here rather than only on the group that carries it, so the
 * two ways a section is built — walked out of the history, or made to hold a
 * run that has only just been queued — are the same type to everything reading
 * them.
 */
type DaySection = {
  label: string
  entries: RunHistoryEntry[]
  queued?: boolean
}

/** "Today", "Yesterday", or the date, to head the runs that happened on it. */
function dayLabel(date: Date) {
  if (isToday(date)) {
    return "Today"
  }

  if (isYesterday(date)) {
    return "Yesterday"
  }

  return format(date, "EEE d MMM")
}

// One step: its place in the run, the node's own icon and title, and how long
// it took.
function StepRow({
  step,
  index,
  isLive,
  hasClip,
  isSelected,
  onClick,
}: {
  step: HistoricalRunStep
  /** Which step of the run this is, counting from one. */
  index: number
  /** Whether the run this step belongs to is still going. */
  isLive: boolean
  /**
   * Whether selecting this step shows a replay of it as well as its output.
   *
   * Only to mark the row. The row does one thing whether or not there is a clip
   * — it selects the step — and the pane beside it decides what that step has
   * worth showing, so this is a sign rather than a second action.
   */
  hasClip: boolean
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
      {/* The order the run walked, which the list alone only implies. Worth its
          own column on a graph whose node titles repeat — two steps both called
          "Open URL 1" are told apart by where they came in the run. */}
      <span className="w-3 shrink-0 text-right text-[10px] text-muted-foreground tabular-nums">
        {index}
      </span>

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

      {/* Before the duration and small enough not to compete with it: this says
          there is something to watch here, and the run's own Replay row below
          is what says the word. An icon rather than a label because it repeats
          on every browser step of every run, and the title beside it is the
          thing worth reading. */}
      {hasClip ? (
        <Play aria-hidden className="size-3 shrink-0 text-muted-foreground" />
      ) : null}

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
      className={cn(
        ROW_CLASS,
        isSelected && "bg-accent text-accent-foreground"
      )}
    >
      {/* Lines up with the step numbers rather than sitting under the icons, so
          the column stays straight and this row reads as one of the run's. */}
      <span className="w-3 shrink-0" />

      {/* The chip is shaped like a step's, so the row lines up with the ones
          above it, but deliberately muted rather than given an accent colour:
          every colour in this list belongs to a node, and this row is not one.
          It is the run's own recording, which is why it sits at the end rather
          than among the steps in the order they ran. */}
      <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Play className="size-3" />
      </span>

      <span className="min-w-0 flex-1 truncate font-medium">
        Replay whole run
      </span>

      {/* Nothing on the right. A step earns a duration by being one thing that
          took a measurable time; the recording spans the whole run, and the run
          header two lines up is already showing that. */}
    </button>
  )
}

/**
 * A run that has been queued and that the subscription has not carried back
 * yet — see queuedRunId on the provider.
 *
 * Shaped like a run's header and deliberately not foldable: there is nothing
 * under it to fold, and giving it a chevron that does nothing would be worse
 * than leaving it off. It is replaced by the real run's group the moment one
 * arrives, which is usually a second or two.
 */
function QueuedRunRow() {
  return (
    <li className="rounded-md border border-border bg-card/40">
      <div className="flex items-start gap-2 px-2 py-1.5">
        {/* Where the chevron sits on a real run, left empty so this row lines
            up with the ones that will appear under it. */}
        <span className="mt-0.5 size-3.5 shrink-0" />

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <Spinner className="size-3 shrink-0" />

            <span className="truncate text-xs font-semibold">Starting…</span>
          </span>

          {/* No clock time: the run has one, but this side does not know it —
              what it knows is that the run was accepted. Saying when it was
              queued from this browser's clock would be a second guess at a
              timestamp the next render replaces anyway. */}
          <span className="text-[11px] text-muted-foreground">
            Waiting for the first step…
          </span>
        </span>
      </div>
    </li>
  )
}

/**
 * One run: a header saying when it ran and how it went, and its steps under it.
 *
 * The steps fold away because a console holding a day's runs is mostly a list of
 * runs, not a list of every step of every one of them — open, the newest run's
 * detail is there without a click, and the ones below it stay scannable.
 */
function RunGroup({
  entry,
  tick,
  isOpen,
  onToggle,
  selected,
  onSelect,
}: {
  entry: RunHistoryEntry
  /**
   * Null until the clock is running — see useClockTick. Only tested against
   * null here; a relative time is worked out from the run's own createdAt.
   */
  tick: number | null
  isOpen: boolean
  onToggle: () => void
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

  const outcome = runOutcome(run, isLive)

  const ranSteps = steps.filter(({ status }) => status !== "pending").length

  return (
    <li className="rounded-md border border-border bg-card/40">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/50"
      >
        <ChevronRight
          aria-hidden
          className={cn(
            "mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform",
            isOpen && "rotate-90"
          )}
        />

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            {/* A spinner while it is going and a dot once it has stopped, in
                the same place, so a run settling does not shift the line. */}
            {isLive ? (
              <Spinner className="size-3 shrink-0" />
            ) : (
              <span
                aria-hidden
                className={cn("size-2 shrink-0 rounded-full", outcome.dot)}
              />
            )}

            {/* Trigger.dev's own status in the tooltip, since the label above
                is this list's wording rather than theirs. */}
            <span
              title={run.status}
              className={cn("truncate text-xs font-semibold", outcome.text)}
            >
              {outcome.label}
            </span>

            {/* The run's total, which is more than its steps add up to: it also
                covers queueing and opening the browser session. Held back while
                the run is live, when it is still climbing. */}
            {!isLive && run.durationMs > 0 ? (
              <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                {prettyMs(run.durationMs)}
              </span>
            ) : null}
          </span>

          {/* When it ran, twice over: the clock time it started, which is exact
              and stays put, and how long ago that was, which is what someone
              scanning for "the one I just ran" is actually matching on. The day
              is on the heading above rather than repeated here. */}
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="tabular-nums">
              {format(run.createdAt, "HH:mm:ss")}
            </span>

            {tick === null ? null : (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">
                  {formatDistanceToNowStrict(run.createdAt, {
                    addSuffix: true,
                  })}
                </span>
              </>
            )}

            {ranSteps > 0 ? (
              <>
                <span aria-hidden>·</span>
                <span className="shrink-0">
                  {ranSteps} step{ranSteps === 1 ? "" : "s"}
                </span>
              </>
            ) : null}
          </span>
        </span>
      </button>

      {isOpen ? (
        <div className="px-1.5 pb-1.5">
          {/* Why it stopped, on the runs that carry a reason. Above the steps
              rather than below them because on a run that failed before its
              first step this is the only thing there is to read, and on one
              that got further it is still the headline. */}
          {!isLive && run.error?.message ? (
            <p className="mb-1 rounded-md bg-destructive/10 px-2 py-1 text-[11px] whitespace-pre-wrap text-destructive">
              {run.error.message}
            </p>
          ) : null}

          {steps.length === 0 && !hasReplay ? (
            <p className="px-1.5 py-1 text-xs text-muted-foreground">
              {isLive
                ? // The gap between a run being queued and its first metadata
                  // arriving.
                  "Waiting for the first step…"
                : run.error
                  ? // The message above has already said what happened, so this
                    // only has to say why there is nothing under it.
                    "The run stopped before any step ran."
                  : "This run recorded no steps."}
            </p>
          ) : (
            <ul className="flex flex-col border-l border-border pl-1.5">
              {steps.map((step, index) => {
                const id: ConsoleSelection = {
                  kind: "step",
                  runId: run.id,
                  nodeId: step.nodeId,
                }

                return (
                  <li key={step.nodeId}>
                    <StepRow
                      step={step}
                      index={index + 1}
                      isLive={isLive}
                      hasClip={stepClip(entry, step) !== null}
                      isSelected={isSameSelection(selected, id)}
                      onClick={() => onSelect(id)}
                    />
                  </li>
                )
              })}

              {/* Inside the same list as the steps rather than after it, so it
                  is one of the run's rows and not a second thing under them. */}
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
        </div>
      ) : null}
    </li>
  )
}

/**
 * The console's list of runs, newest first, grouped by the day they ran, with
 * each run's steps under it.
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
  const { error, queuedRunId } = useWorkflowRuns()
  const history = useRunHistory()

  // The provider clears the id as soon as the run is in runs, so this is only
  // ever true over the gap. Checked against the history as well, rather than
  // trusting that alone, so the two can never both be showing the same run.
  const showQueued =
    queuedRunId !== null && !history.some(({ run }) => run.id === queuedRunId)

  // A minute is the resolution the labels below are written at — they count in
  // minutes, hours, and days — so ticking faster would rerender the list
  // without changing a word of it.
  const tick = useClockTick(60_000)

  // Only the runs whose fold has been clicked, rather than the open state of
  // every run. What is not in here follows the rule below — newest open, rest
  // closed — and that is what keeps the list tidy as runs arrive: a run held
  // open by its own state would stay open forever once a newer one pushed it
  // down, and after five runs everything would be open again, which is the
  // thing that made this list hard to read in the first place.
  const [toggled, setToggled] = useState<Record<string, boolean>>({})

  const newestRunId = history[0]?.run.id

  // Runs arrive newest first, so a day is a run of neighbours rather than
  // something to sort into: this walks them once and starts a new group each
  // time the date changes.
  const days = useMemo(() => {
    const groups: DaySection[] = []

    for (const entry of history) {
      const label = dayLabel(entry.run.createdAt)
      const last = groups.at(-1)

      if (last?.label === label) {
        last.entries.push(entry)
      } else {
        groups.push({ label, entries: [entry] })
      }
    }

    return groups
  }, [history])

  // The queued run belongs under today's heading, since it is happening now.
  // Which means either joining the group that is already there, or — on the
  // first run of a day — bringing that heading into being.
  const sections = useMemo(() => {
    if (!showQueued) {
      return days
    }

    if (days[0]?.label === "Today") {
      return [{ ...days[0], queued: true }, ...days.slice(1)]
    }

    return [{ label: "Today", entries: [], queued: true }, ...days]
  }, [days, showQueued])

  return (
    // size-full rather than flex-1: this fills a resizable panel, which sets
    // its own width and is not a flex container for what it holds.
    //
    // The background is set here rather than left to whatever is behind the
    // panel, because the day headings below are sticky and opaque: they have to
    // paint the same colour as the list they sit over, and inheriting it means
    // guessing at it.
    <div className="flex size-full min-h-0 flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-1.5 text-sm font-semibold">
        Runs
        {history.length > 0 ? (
          <span className="text-xs font-normal text-muted-foreground tabular-nums">
            {history.length}
          </span>
        ) : null}
      </div>

      {/* No padding of its own: the day headings inside are sticky, and padding
          here would inset them, leaving a strip down each side for the runs to
          scroll through beside them. The padding lives on the lists instead, so
          a heading can span the full width and cover what passes under it. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Said out loud rather than left to look like an empty history: a
            subscription that could not be opened has no runs to show either,
            and "No runs yet" would be the wrong reading of it. */}
        {error ? (
          <p className="p-3 text-xs text-destructive">{error.message}</p>
        ) : history.length === 0 && !showQueued ? (
          <p className="p-3 text-xs text-muted-foreground">No runs yet</p>
        ) : (
          sections.map(({ label, entries, queued }) => (
            <section key={label}>
              {/* Sticky so the day a run belongs to is still on screen once
                  scrolling has carried its heading off the top — without it, a
                  long history reads as a list of times with no dates.
                  Fully opaque, and that is the whole job: a translucent one let
                  the run scrolling underneath show through the words. The rule
                  underneath is what separates a day from the one above it, in
                  place of the gap that used to. */}
              <h3 className="sticky top-0 z-10 border-b border-border bg-background px-3 py-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {label}
              </h3>

              <ul className="flex flex-col gap-1 p-1.5">
                {/* Above the rest, which is where the run it stands for will
                    appear: the list is newest first, and nothing is newer than
                    a run that has only just been accepted. */}
                {queued ? <QueuedRunRow /> : null}

                {entries.map((entry) => {
                  const { id } = entry.run

                  return (
                    <RunGroup
                      key={id}
                      entry={entry}
                      tick={tick}
                      // The newest run open and the rest folded away, until
                      // someone says otherwise. That is the one being looked at
                      // nine times out of ten — it is the run just started from
                      // the canvas — and it means starting a new run opens it
                      // and folds the previous one away on its own.
                      isOpen={toggled[id] ?? id === newestRunId}
                      onToggle={() =>
                        setToggled((open) => ({
                          ...open,
                          [id]: !(open[id] ?? id === newestRunId),
                        }))
                      }
                      selected={selected}
                      onSelect={onSelect}
                    />
                  )
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
