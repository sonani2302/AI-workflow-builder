import toposort from "toposort"
import type { Edge } from "@xyflow/react"

import type { WorkflowGraph } from "@/features/workflows/nodes/node-registry"

// Checks a canvas for the things that would stop it running, before anything
// is queued. No React and no database here on purpose: the editor can call it
// to show problems as they are made, and the server can call it again before
// a run, off the same rules.

export type GraphIssueCode =
  | "empty"
  | "dangling-edge"
  | "no-trigger"
  | "multiple-triggers"
  | "trigger-has-input"
  | "cycle"
  | "unreachable"

export type GraphIssue = {
  code: GraphIssueCode
  /** Written to be shown as-is. */
  message: string
  /** What the issue points at, so the canvas can highlight it. */
  nodeIds: string[]
  edgeIds: string[]
}

export type GraphValidation =
  | {
      ok: true
      /**
       * Node ids from the trigger onwards. This is the run order, and the
       * reason validation sorts rather than only looking for a cycle.
       */
      order: string[]
    }
  | { ok: false; issues: GraphIssue[] }

// "1 step" / "2 steps", so the messages below read as sentences either way.
function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`
}

/**
 * toposort names the node it looped back to inside the message it throws,
 * which is the only handle it offers on where a cycle is. Parsed defensively:
 * the wording is the library's own, not an API it promises.
 */
function cycleNodeFrom(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  return /node was:\s*"(.*)"/.exec(message)?.[1]
}

/** Every node reachable by following edges forward from one starting node. */
function reachableFrom(startId: string, edges: Edge[]) {
  const outgoing = new Map<string, string[]>()

  for (const edge of edges) {
    const targets = outgoing.get(edge.source)

    if (targets) {
      targets.push(edge.target)
    } else {
      outgoing.set(edge.source, [edge.target])
    }
  }

  const seen = new Set([startId])
  const queue = [startId]

  while (queue.length > 0) {
    for (const next of outgoing.get(queue.pop()!) ?? []) {
      if (!seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }

  return seen
}

/**
 * Validates a workflow's canvas, collecting every problem rather than stopping
 * at the first, so one pass through the editor can fix all of them.
 *
 * On success it returns the order the steps should run in.
 */
export function validateGraph({ nodes, edges }: WorkflowGraph): GraphValidation {
  if (nodes.length === 0) {
    return {
      ok: false,
      issues: [
        {
          code: "empty",
          message: "This workflow has no steps.",
          nodeIds: [],
          edgeIds: [],
        },
      ],
    }
  }

  const issues: GraphIssue[] = []
  const nodeIds = new Set(nodes.map((node) => node.id))

  // An edge onto a node that is gone makes toposort throw about an unknown
  // node, which would surface as "this graph does not sort" and hide whatever
  // else is wrong. Reported here, then held out of everything below so the
  // remaining checks still run against a graph that hangs together.
  const dangling = edges.filter(
    (edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target)
  )

  if (dangling.length > 0) {
    issues.push({
      code: "dangling-edge",
      message: `Remove ${plural(dangling.length, "connection")} pointing at a step that is not on the canvas.`,
      nodeIds: [],
      edgeIds: dangling.map((edge) => edge.id),
    })
  }

  const danglingIds = new Set(dangling.map((edge) => edge.id))
  const sound = edges.filter((edge) => !danglingIds.has(edge.id))

  const triggers = nodes.filter((node) => node.data.kind === "trigger")

  if (triggers.length === 0) {
    issues.push({
      code: "no-trigger",
      message: "This workflow has no trigger, so nothing would start it.",
      nodeIds: [],
      edgeIds: [],
    })
  } else if (triggers.length > 1) {
    issues.push({
      code: "multiple-triggers",
      message: `This workflow has ${plural(triggers.length, "trigger")}, and can only have one.`,
      nodeIds: triggers.map((node) => node.id),
      edgeIds: [],
    })
  }

  // The canvas gives a trigger no target handle, so this only catches a graph
  // that arrived some other way — a saved row, or an edge that outlived the
  // node it pointed at being replaced by a trigger.
  const triggerIds = new Set(triggers.map((node) => node.id))
  const intoTrigger = sound.filter((edge) => triggerIds.has(edge.target))

  if (intoTrigger.length > 0) {
    issues.push({
      code: "trigger-has-input",
      message:
        "A trigger starts the workflow, so nothing can connect into one.",
      nodeIds: intoTrigger.map((edge) => edge.target),
      edgeIds: intoTrigger.map((edge) => edge.id),
    })
  }

  // toposort.array over every node, not just the connected ones, so the order
  // it returns covers the whole canvas.
  let order: string[] | null = null

  try {
    order = toposort.array(
      nodes.map((node) => node.id),
      sound.map((edge): [string, string] => [edge.source, edge.target])
    )
  } catch (error) {
    const node = cycleNodeFrom(error)

    issues.push({
      code: "cycle",
      message: "These steps loop back on themselves, so a run would never end.",
      nodeIds: node && nodeIds.has(node) ? [node] : [],
      edgeIds: [],
    })
  }

  // Only meaningful against a single starting point. With no trigger or with
  // several, the run order is already the problem to fix first.
  if (triggers.length === 1) {
    const reachable = reachableFrom(triggers[0].id, sound)
    const stranded = nodes.filter((node) => !reachable.has(node.id))

    if (stranded.length > 0) {
      issues.push({
        code: "unreachable",
        message: `${plural(stranded.length, "step")} not connected to the trigger, and would never run.`,
        nodeIds: stranded.map((node) => node.id),
        edgeIds: [],
      })
    }
  }

  // order is only null when the cycle above pushed an issue, so the second
  // half of this never decides the result on its own — it is what lets the
  // success branch promise a non-null order.
  if (issues.length > 0 || !order) {
    return { ok: false, issues }
  }

  return { ok: true, order }
}
