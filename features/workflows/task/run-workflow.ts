import { Stagehand } from "@browserbasehq/stagehand"
import { AbortTaskRunError, logger, metadata, task } from "@trigger.dev/sdk"

import {
  interpolate,
  type RunOutputs,
} from "@/features/workflows/lib/interpolate"
import { validateGraph } from "@/features/workflows/lib/validate-graph"
import { NodeInputError } from "@/features/workflows/nodes/node-contract"
import { executorFor } from "@/features/workflows/nodes/node-executor"
import type { WorkflowGraph } from "@/features/workflows/nodes/node-registry"

// WorkflowGraph is a type import and erases, so the canvas' React and lucide
// dependencies stay out of the task bundle. executorFor is a real import, but
// it reaches the executors without going through the registry manifest, which
// is the module that pulls in lucide.

export type RunWorkflowPayload = {
  workflowId: string
  graph: WorkflowGraph
}

/**
 * One node's live status. The whole list is published to run metadata under
 * "steps" and replaced on every change, so the canvas can colour a node by
 * looking its own id up rather than following the run's log.
 */
export type RunStep = {
  nodeId: string
  status: "pending" | "running" | "done" | "failed"
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
  run: async ({ workflowId, graph }: RunWorkflowPayload) => {
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
    const steps: RunStep[] = order.map((nodeId) => ({
      nodeId,
      status: "pending",
    }))

    // steps is mutated in place and re-published whole on every change. Held as
    // its own function so no transition can quietly forget to send it.
    function publishSteps() {
      metadata.set("steps", steps)
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

      // The session's replay on browserbase.com, so a run that went wrong can
      // be watched back rather than guessed at from the step reports alone.
      metadata.set("sessionUrl", opened.browserbaseSessionURL ?? null)
      logger.log("Opened browser session", {
        sessionId: opened.browserbaseSessionID,
      })

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

        try {
          const output = await executor(
            { stagehand: await browser() },
            resolved
          )

          outputs[nodeId] = output
          ran++

          steps[index].status = "done"
          publishSteps()

          logger.log(`Finished ${title}`, { nodeId, output })
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "The step failed."

          steps[index].status = "failed"
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
      return {
        workflowId,
        steps,
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
