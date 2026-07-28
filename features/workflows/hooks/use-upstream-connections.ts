"use client"

import { useStore, type Edge } from "@xyflow/react"

import {
  nodeRegistry,
  type NodeType,
  type StepNodeType,
} from "@/features/workflows/nodes/node-registry"

// What a field can be filled in from: everything produced anywhere above the
// node being edited, offered as something to insert rather than a node id to
// be typed out by hand.

export type UpstreamConnection = {
  /** Ready to drop into a field as-is, e.g. "{{ n2.title }}". */
  token: string
  /** How to name it in a picker, e.g. "Open URL 1 · Title". */
  label: string
  /** The node that produces it, so a picker can group by source. */
  nodeId: string
  /** That node's type, which is what its icon is looked up from. */
  type: NodeType
}

/**
 * Every node reachable by following edges backwards from one node.
 *
 * The mirror of reachableFrom in validate-graph, which walks the same edges the
 * other way. Both build the adjacency map from scratch rather than sharing one,
 * because the direction is the whole difference between them.
 */
function ancestorsOf(nodeId: string, edges: Edge[]) {
  const incoming = new Map<string, string[]>()

  for (const edge of edges) {
    const sources = incoming.get(edge.target)

    if (sources) {
      sources.push(edge.source)
    } else {
      incoming.set(edge.target, [edge.source])
    }
  }

  const seen = new Set<string>()
  const queue = [nodeId]

  // Breadth first over the reversed edges, so this reaches a node's parents,
  // their parents, and so on — not just the one hop above it.
  while (queue.length > 0) {
    for (const source of incoming.get(queue.pop()!) ?? []) {
      if (!seen.has(source)) {
        seen.add(source)
        queue.push(source)
      }
    }
  }

  // A cycle walks back round to the node it started from. Nothing is upstream
  // of itself, and a step cannot read an output it has not produced yet, so the
  // starting node never belongs in the result — the canvas can hold a cycle
  // while it is being drawn, whatever validation says about running it.
  seen.delete(nodeId)

  return seen
}

function collect(
  nodeId: string,
  nodes: StepNodeType[],
  edges: Edge[]
): UpstreamConnection[] {
  if (!nodeId) {
    return []
  }

  const ancestors = ancestorsOf(nodeId, edges)
  const connections: UpstreamConnection[] = []

  // Walked in canvas order rather than in the order the search found them, so
  // the list a picker shows keeps one arrangement as edges come and go.
  for (const node of nodes) {
    if (!ancestors.has(node.id)) {
      continue
    }

    const { type, title } = node.data

    // The registry is what says which of a node's outputs may be referenced.
    // Reading it here rather than a finished run is the point: the canvas is
    // still being drawn, so no output exists yet to look at.
    for (const output of nodeRegistry[type].outputs) {
      connections.push({
        token: `{{ ${node.id}.${output.path} }}`,
        label: `${title} · ${output.label}`,
        nodeId: node.id,
        type,
      })
    }
  }

  return connections
}

/** Whether two results say the same thing, field by field. */
function sameConnections(a: UpstreamConnection[], b: UpstreamConnection[]) {
  return (
    a.length === b.length &&
    a.every(
      (connection, index) =>
        connection.token === b[index].token &&
        connection.label === b[index].label &&
        connection.type === b[index].type
    )
  )
}

/**
 * Every output a node could reference, from anywhere above it in the graph.
 *
 * Recomputes as edges are made and broken, because it is derived from the store
 * the canvas writes those to. The comparison is what keeps that from costing
 * anything: the selector runs whenever the store moves, but a result equal to
 * the last one does not re-render the caller — so dragging a node around, which
 * touches the store constantly and changes none of this, stays free.
 *
 * Pass the selected node's id, or "" for no selection, which yields nothing.
 */
export function useUpstreamConnections(nodeId: string): UpstreamConnection[] {
  return useStore(
    (state) => collect(nodeId, state.nodes as StepNodeType[], state.edges),
    sameConnections
  )
}
