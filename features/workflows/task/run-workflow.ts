import { Stagehand } from "@browserbasehq/stagehand"
import { AbortTaskRunError, logger, metadata, task } from "@trigger.dev/sdk"

import {
  interpolate,
  type RunOutputs,
} from "@/features/workflows/lib/interpolate"
import { validateGraph } from "@/features/workflows/lib/validate-graph"
import {
  NodeInputError,
  type JsonObject,
} from "@/features/workflows/nodes/node-contract"
import { executorFor } from "@/features/workflows/nodes/node-executor"
import type {
  NodeType,
  WorkflowGraph,
} from "@/features/workflows/nodes/node-registry"

// WorkflowGraph is a type import and erases, so the canvas' React and lucide
// dependencies stay out of the task bundle. executorFor is a real import, but
// it reaches the executors without going through the registry manifest, which
// is the module that pulls in lucide.

export type RunWorkflowPayload = {
  workflowId: string
  graph: WorkflowGraph
}

/**
 * One node's live status, and what it did once it has been there. The whole
 * list is published to run metadata under "steps" and replaced on every change,
 * so the canvas can colour a node by looking its own id up rather than
 * following the run's log.
 *
 * A step carries its own type and title rather than only the id it can be
 * looked up by, because the console reads a run rather than the canvas: a run
 * from an hour ago describes the graph as it was then, and the node it named
 * may since have been retitled or deleted off the canvas altogether.
 */
export type RunStep = {
  nodeId: string
  /** Keys into the node registry, which is where its icon comes from. */
  type: NodeType
  title: string
  status: "pending" | "running" | "done" | "failed"
  /**
   * How long the step's own work took, in milliseconds. Absent until it
   * finishes, and absent on the trigger, which does no work to time.
   */
  durationMs?: number
  /** What the executor returned, on a step that got that far. */
  output?: JsonObject
  /** Why it stopped, on a step that threw. */
  error?: string
}

/** Where the run has got to, replaced in run metadata on every step. */
export type RunProgress = {
  total: number
  completed: number
  current: { nodeId: string; title: string } | null
}

export const runWorkflowTask = task({
  id: "run-workflow",
  maxDuration: 300,
  run: async ({ workflowId, graph }: RunWorkflowPayload, { ctx }) => {
    // Checked again here rather than trusting the editor and the action that
    // queued this. The run outlives the click that started it, the payload is
    // whatever the browser sent, and a retry replays that same payload.
    const validation = validateGraph(graph)

    if (!validation.ok) {
      // A graph that does not validate now will not validate on the next
      // attempt either, so stop rather than spend the retries on it.
      throw new AbortTaskRunError(
        `Cannot run workflow ${workflowId}: ${validation.issues
          .map((issue) => issue.message)
          .join(" ")}`
      )
    }

    // The point of sorting rather than only checking for a cycle: a canvas is
    // a graph, and this is the one order that respects every connection on it.
    const { order } = validation
    const byId = new Map(graph.nodes.map((node) => [node.id, node]))

    // Every node the run is about to walk, all pending, published before any of
    // them starts. The canvas gets the shape of the run up front this way, so a
    // node can show as waiting rather than appearing only once it is reached.
    //
    // Rebuilt rather than added to, because metadata outlives an attempt: a
    // retry re-walks the same graph from the top, and a list carried over from
    // the failed attempt would still be holding its stale statuses.
    const steps: RunStep[] = order.map((nodeId) => {
      // order is toposort over these very node ids, so this cannot miss.
      const { type, title } = byId.get(nodeId)!.data

      return { nodeId, type, title, status: "pending" }
    })

    // steps is mutated in place and re-published whole on every change. Held as
    // its own function so no transition can quietly forget to send it.
    //
    // A fresh copy every time, and that is the whole reason this works: setting
    // a key drops the write when the new metadata deep-equals what is already
    // stored, and the stored value is this very array. Mutating it and handing
    // the same reference back makes the two sides of that comparison the same
    // object, so every change after the first would be discarded and the canvas
    // would sit on "pending" for the length of the run.
    //
    // A shallow copy is enough even though a step now carries an output object:
    // an output is set once, from what the executor returned, and never touched
    // again, so there is no later change for the shared reference to hide.
    function publishSteps() {
      metadata.set(
        "steps",
        steps.map((step) => ({ ...step }))
      )
    }

    metadata
      .set("progress", {
        total: order.length,
        completed: 0,
        current: null,
      } satisfies RunProgress)
      .set("sessionUrl", null)

    publishSteps()

    logger.log("Starting workflow", { workflowId, steps: order.length })

    // Opened on the first step that needs it rather than up front. A Browserbase
    // session is billed for the time it is held, and a graph whose steps all
    // turn out to need no browser should not pay for one.
    let stagehand: Stagehand | null = null

    // The session's own id, kept aside for the return below. A replay is fetched
    // by session id — not by the URL already published to metadata, which points
    // at browserbase.com and is only good for opening their dashboard — so this
    // is the one handle a player of our own can be built on.
    //
    // Stays null on a run whose steps all turned out to need no browser, which
    // is a real outcome rather than a failure to record one.
    let sessionId: string | null = null

    async function browser() {
      if (stagehand) {
        return stagehand
      }

      const apiKey = process.env.BROWSERBASE_API_KEY
      const projectId = process.env.BROWSERBASE_PROJECT_ID

      // Missing credentials are a deployment problem, not a transient one, so
      // this stops the run instead of retrying into the same wall three times.
      if (!apiKey || !projectId) {
        throw new AbortTaskRunError(
          "Set BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID for this environment to run browser steps."
        )
      }

      const opened = new Stagehand({
        env: "BROWSERBASE",
        apiKey,
        projectId,
        // Stagehand logs through pino, which reaches its worker thread by
        // resolving a file path at run time. The Trigger build bundles the
        // package into one chunk, that path stops existing, and the logger
        // throws while the constructor is still running — before a session is
        // ever opened, which is why a failure here leaves nothing behind on
        // Browserbase to look at. disablePino is Stagehand's own way out of
        // exactly this, and the lines go to the run's log instead of being lost.
        disablePino: true,
        logger: ({ message, level, category }) =>
          logger.debug(`[stagehand] ${message}`, { level, category }),
      })

      await opened.init()
      stagehand = opened
      sessionId = opened.browserbaseSessionID ?? null

      // The session's replay on browserbase.com, so a run that went wrong can
      // be watched back rather than guessed at from the step reports alone.
      metadata.set("sessionUrl", opened.browserbaseSessionURL ?? null)
      logger.log("Opened browser session", { sessionId })

      return opened
    }

    // Counted separately from the steps list because the trigger is in that
    // list too, and "Ran 3 steps" would be one more than anything actually did.
    let ran = 0

    // What each node produced, keyed by its id, so a later step can be pointed
    // at it. Filled in as the run goes and only ever read backwards: order is
    // toposort, so by the time a node runs, everything it could reference has
    // already put its output in here.
    const outputs: RunOutputs = {}

    try {
      for (const [index, nodeId] of order.entries()) {
        // order is toposort over these very node ids, so this cannot miss.
        const node = byId.get(nodeId)!
        const { type, title, values } = node.data

        metadata.set("progress", {
          total: order.length,
          completed: index,
          current: { nodeId, title },
        } satisfies RunProgress)

        const executor = executorFor(type)

        // The trigger is on the canvas and in the order, but it marks where the
        // run starts rather than doing work. Straight to done, with no running
        // in between, so the canvas does not leave it looking like it is waiting
        // on something for the length of the run.
        if (!executor) {
          steps[index].status = "done"
          publishSteps()
          continue
        }

        // A field can name an earlier node's output — "{{ n2.title }}" — and
        // this is where that becomes the value itself. Done per run rather than
        // once on the canvas, because what it resolves to is whatever this run
        // produced, and the next run will resolve the same field differently.
        const resolved = Object.fromEntries(
          Object.entries(values).map(([key, value]) => [
            key,
            interpolate(value, outputs),
          ])
        )

        // The resolved values rather than what was typed, so the log says what
        // the step actually ran with.
        logger.log(`Step ${index + 1}/${order.length}: ${title}`, {
          nodeId,
          type,
          values: resolved,
        })

        steps[index].status = "running"
        publishSteps()

        // Forced out now rather than left to the background flush. The next
        // change to this node is "done", and metadata is sent as it stands when
        // the flush happens — so without this, a step that finishes quickly
        // would go out already finished and the canvas would never see it run.
        await metadata.flush()

        // After the flush above rather than before it, so what gets timed is
        // the step's own work and not the wait on a metadata round trip that
        // has nothing to do with it. Opening the browser session is inside the
        // window on purpose: the first step really does wait for that, and
        // hiding it would leave a step reported as fast that took ten seconds.
        const startedAt = Date.now()

        try {
          // browser is passed rather than called, so a step that needs no page
          // opens no session — see the note on it above. The run id rather than
          // the attempt's: a step that must not happen twice needs a name that
          // survives a retry, and ctx.run.id is the same on every attempt.
          const output = await executor(
            { browser, runId: ctx.run.id, nodeId },
            resolved
          )

          outputs[nodeId] = output
          ran++

          steps[index].status = "done"
          steps[index].durationMs = Date.now() - startedAt
          steps[index].output = output
          publishSteps()

          logger.log(`Finished ${title}`, { nodeId, output })
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "The step failed."

          steps[index].status = "failed"
          steps[index].durationMs = Date.now() - startedAt
          // The message rather than the error itself: what reaches the console
          // has been through JSON on the way out, and an Error serializes to an
          // empty object.
          steps[index].error = message
          publishSteps()

          // Forced out before the throw below, which is the last thing that
          // happens in this run. A run that ends by throwing returns no output,
          // so what has been flushed is all the canvas will ever get — leave
          // this to the background and the node stays showing as running.
          await metadata.flush()

          // A later step reads the page an earlier one left, so carrying on
          // past a failure would run the rest against a browser that never
          // reached the state they were drawn to expect.
          if (error instanceof NodeInputError) {
            throw new AbortTaskRunError(`${title}: ${message}`)
          }

          throw error
        }
      }

      metadata.set("progress", {
        total: order.length,
        completed: order.length,
        current: null,
      } satisfies RunProgress)

      logger.log("Finished workflow", { workflowId, steps: steps.length })

      // Returned as well as published. A run's output is delivered once and
      // kept, so this is the finished state arriving by a route that does not
      // depend on the last flush having gone out before the run ended.
      //
      // The session id rides out here rather than going to metadata like the
      // rest, and the timing is the whole reason. Browserbase finishes writing a
      // recording after the session closes, and the session closes in the
      // finally below — after this return is built but before the output is
      // delivered. So an id that arrives with the output arrives at a moment
      // when there is something to play, whereas one published mid-run would
      // reach a panel while the recording was still being written and have it
      // ask for a replay that does not exist yet.
      return {
        workflowId,
        steps,
        sessionId,
        message: `Ran ${ran} step${ran === 1 ? "" : "s"}`,
      }
    } finally {
      // Closed on the way out whichever way the run ended, so a failed step
      // does not leave a browser running until Browserbase times it out. The
      // catch keeps a cleanup problem from replacing the error that got here.
      //
      // The cast is load-bearing, not clutter: browser() is the only thing that
      // assigns stagehand, and control flow analysis does not follow an
      // assignment made inside a nested function. It still reads the variable as
      // null here, so the check below narrows it to never rather than to a
      // session, and the call would not compile without this.
      if (stagehand) {
        await (stagehand as Stagehand)
          .close()
          .catch((error: unknown) =>
            logger.warn("Could not close browser session", { error })
          )
      }
    }
  },
})
