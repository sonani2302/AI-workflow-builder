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
import type { WorkflowGraph } from "@/features/workflows/nodes/node-registry"

// WorkflowGraph is a type import and erases, so the canvas' React and lucide
// dependencies stay out of the task bundle. executorFor is a real import, but
// it reaches the executors without going through the registry manifest, which
// is the module that pulls in lucide.

export type RunWorkflowPayload = {
  workflowId: string
  graph: WorkflowGraph
}

/** One step's outcome, appended to run metadata as the run walks the graph. */
export type StepReport = {
  nodeId: string
  type: string
  title: string
  status: "completed" | "failed" | "skipped"
  output?: JsonObject
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

    // Set rather than left to accumulate, because metadata outlives an attempt:
    // a retry re-walks the same graph from the top, and appending to whatever
    // the failed attempt left behind would show every step twice.
    metadata
      .set("progress", {
        total: order.length,
        completed: 0,
        current: null,
      } satisfies RunProgress)
      .set("steps", [])
      .set("sessionUrl", null)

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

      const opened = new Stagehand({ env: "BROWSERBASE", apiKey, projectId })
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

    const steps: StepReport[] = []

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
        // run starts rather than doing work. Reported anyway so the UI's step
        // list matches the graph the user drew.
        if (!executor) {
          const report: StepReport = { nodeId, type, title, status: "skipped" }

          steps.push(report)
          metadata.append("steps", report)
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

        try {
          const output = await executor(
            { stagehand: await browser() },
            resolved
          )

          outputs[nodeId] = output

          const report: StepReport = {
            nodeId,
            type,
            title,
            status: "completed",
            output,
          }

          steps.push(report)
          metadata.append("steps", report)
          logger.log(`Finished ${title}`, { nodeId, output })
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "The step failed."

          // Recorded before rethrowing, so the UI can say which step stopped
          // the run rather than only that the run stopped.
          metadata.append("steps", {
            nodeId,
            type,
            title,
            status: "failed",
            error: message,
          } satisfies StepReport)

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

      const ran = steps.filter((step) => step.status === "completed").length

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
