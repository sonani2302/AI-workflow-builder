"use client"

import { useCallback } from "react"
import { useTheme } from "next-themes"
import {
  addEdge,
  Background,
  Controls,
  MarkerType,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type DefaultEdgeOptions,
  type Edge,
  type Node,
} from "@xyflow/react"

// Placeholder graph until workflows carry their own nodes and edges.
const initialNodes: Node[] = [
  { id: "n1", position: { x: 0, y: 0 }, data: { label: "Node 1" } },
  { id: "n2", position: { x: 0, y: 160 }, data: { label: "Node 2" } },
]

const initialEdges: Edge[] = [{ id: "n1-n2", source: "n1", target: "n2" }]

// Right-angled connectors with rounded corners, plus an arrow head so the
// direction of the workflow reads at a glance.
const defaultEdgeOptions: DefaultEdgeOptions = {
  type: "smoothstep",
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
}

// React Flow reads these custom properties at the root of the flow, so pointing
// them at the app's design tokens themes the canvas in both light and dark
// without a separate stylesheet.
const canvasTheme = [
  "[--xy-background-pattern-dots-color:var(--border)]",
  "[--xy-node-background-color:var(--card)]",
  "[--xy-node-color:var(--card-foreground)]",
  "[--xy-node-border:1px_solid_var(--border)]",
  "[--xy-node-border-radius:var(--radius)]",
  "[--xy-node-boxshadow-hover:0_0_0_1px_var(--ring)]",
  "[--xy-node-boxshadow-selected:0_0_0_2px_var(--ring)]",
  "[--xy-handle-background-color:var(--primary)]",
  "[--xy-handle-border-color:var(--background)]",
  "[--xy-edge-stroke:var(--muted-foreground)]",
  "[--xy-edge-stroke-selected:var(--primary)]",
  "[--xy-edge-stroke-width:1.5]",
  "[--xy-controls-button-background-color:var(--card)]",
  "[--xy-controls-button-background-color-hover:var(--muted)]",
  "[--xy-controls-button-color:var(--card-foreground)]",
  "[--xy-controls-button-border-color:var(--border)]",
].join(" ")

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
        className={canvasTheme}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        defaultEdgeOptions={defaultEdgeOptions}
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        maxZoom={1}
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
