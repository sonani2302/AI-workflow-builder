"use client"

import { useCallback } from "react"
import { useTheme } from "next-themes"
import {
  addEdge,
  Background,
  Controls,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react"

// Placeholder graph until workflows carry their own nodes and edges.
const initialNodes: Node[] = [
  { id: "n1", position: { x: 0, y: 0 }, data: { label: "Node 1" } },
  { id: "n2", position: { x: 0, y: 120 }, data: { label: "Node 2" } },
]

const initialEdges: Edge[] = [{ id: "n1-n2", source: "n1", target: "n2" }]

/**
 * Canvas column of the workflow editor, filling the space above the logs.
 */
export function Canvas({ workflowId }: { workflowId: string }) {
  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const { resolvedTheme } = useTheme()

  const onConnect = useCallback(
    (connection: Connection) => setEdges((edges) => addEdge(connection, edges)),
    [setEdges]
  )

  // React Flow needs a parent with a real width and height; the surrounding
  // ResizablePanel supplies both, so size-full is enough here.
  return (
    <div className="size-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        fitView
      >
        <Background />
        <Controls />
        <Panel
          position="top-left"
          className="font-mono text-xs text-muted-foreground"
        >
          {workflowId}
        </Panel>
      </ReactFlow>
    </div>
  )
}
