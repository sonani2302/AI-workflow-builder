import { AbortTaskRunError, logger, task } from "@trigger.dev/sdk"

import { validateGraph } from "@/features/workflows/lib/validate-graph"
import type { WorkflowGraph } from "@/features/workflows/nodes/node-registry"

// Only toposort comes along at runtime — WorkflowGraph is a type import and
// erases, which keeps the canvas' React and lucide dependencies out of the
// task bundle.

export type RunWorkflowPayload = {
  workflowId: string
  graph: WorkflowGraph
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

    logger.log("Starting workflow", { workflowId, steps: order.length })

    const steps = order.map((id, index) => {
      // order is toposort over these very node ids, so this cannot miss.
      const node = byId.get(id)!
      const { type, title, values } = node.data

      // Standing in for the real work until each node type has a handler of
      // its own. values is logged so the run shows what a step was given.
      logger.log(`Step ${index + 1}/${order.length}: ${title}`, {
        nodeId: id,
        type,
        values,
      })

      return { nodeId: id, type, title }
    })

    logger.log("Finished workflow", { workflowId, steps: steps.length })

    return {
      workflowId,
      steps,
      message: `Ran ${steps.length} step${steps.length === 1 ? "" : "s"}`,
    }
  },
})
