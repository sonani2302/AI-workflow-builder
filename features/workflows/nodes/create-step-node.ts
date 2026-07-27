import type { XYPosition } from "@xyflow/react"

import {
  nodeRegistry,
  type NodeType,
  type StepNodeType,
} from "@/features/workflows/nodes/node-registry"

// Roughly what a step measures once React Flow has rendered it. Only used to
// offset a new node by half its footprint, so it lands centered on a point
// instead of hanging below and to the right of it.
export const stepNodeSize = { width: 200, height: 52 }

/**
 * Numbers a node after the highest number its type already uses, so several
 * nodes of one type stay easy to tell apart ("Open URL 1", "Open URL 2").
 * Reading the numbers back off the titles rather than counting the nodes is
 * what stops deleting "Open URL 1" from minting a second "Open URL 2".
 */
function nextTitle(type: NodeType, existing: StepNodeType[]) {
  const highest = existing.reduce((max, node) => {
    if (node.data.type !== type) {
      return max
    }

    return Math.max(max, Number(/(\d+)$/.exec(node.data.title)?.[1] ?? 0))
  }, 0)

  return `${nodeRegistry[type].label} ${highest + 1}`
}

/**
 * Builds a node from its registry entry, so kind, title and the shape of
 * values follow the manifest rather than being repeated at each call site.
 * Pass the nodes already on the canvas to have this one numbered after them.
 */
export function createStepNode(
  id: string,
  type: NodeType,
  position: XYPosition,
  existing: StepNodeType[] = []
): StepNodeType {
  const definition = nodeRegistry[type]

  return {
    id,
    type: "step",
    position,
    data: {
      type,
      kind: definition.kind,
      title: nextTitle(type, existing),
      values: Object.fromEntries(
        definition.fields.map((field) => [field.key, ""])
      ),
    },
  }
}
