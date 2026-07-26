"use client"

import { useSyncExternalStore } from "react"
import { useTheme } from "next-themes"
import { Cursors, useLiveblocksFlow } from "@liveblocks/react-flow"
import {
  Background,
  Controls,
  MarkerType,
  Panel,
  ReactFlow,
  type DefaultEdgeOptions,
  type Edge,
  type NodeTypes,
  type XYPosition,
} from "@xyflow/react"

import { StepNode } from "@/features/workflows/components/step-node"
import {
  nodeRegistry,
  type NodeType,
  type StepNodeType,
} from "@/features/workflows/nodes/node-registry"

// Every node is rendered by StepNode; which entry it draws comes from
// data.type. Must stay a module constant, or React Flow remounts all nodes on
// each render.
const nodeTypes: NodeTypes = { step: StepNode }

/**
 * Builds a node from its registry entry, so kind, title and the shape of
 * values follow the manifest rather than being repeated at each call site.
 */
function createStepNode(
  id: string,
  type: NodeType,
  position: XYPosition
): StepNodeType {
  const definition = nodeRegistry[type]

  return {
    id,
    type: "step",
    position,
    data: {
      type,
      kind: definition.kind,
      title: definition.label,
      values: Object.fromEntries(
        definition.fields.map((field) => [field.key, ""])
      ),
    },
  }
}

// Placeholder graph until workflows carry their own nodes and edges. Laid out
// left to right, because the handles sit on the sides of a step.
const initialNodes: StepNodeType[] = [
  createStepNode("n1", "start", { x: 0, y: 0 }),
  createStepNode("n2", "open-url", { x: 320, y: 0 }),
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

// Reports false while rendering on the server and during the first client
// render, then true once React has hydrated. Kept as module constants so the
// store identity stays stable across renders.
const subscribeToNothing = () => () => {}
const hydratedOnClient = () => true
const hydratedOnServer = () => false

/**
 * Canvas column of the workflow editor, filling the space above the logs.
 */
export function Canvas({ workflowId }: { workflowId: string }) {
  // Liveblocks owns the nodes and edges now, so they sync across everyone in
  // the room. The initial graph only seeds an empty room. suspense: true
  // matches the ClientSideSuspense that Room renders above this.
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, onDelete } =
    useLiveblocksFlow<StepNodeType, Edge>({
      suspense: true,
      nodes: { initial: initialNodes },
      edges: { initial: initialEdges },
    })

  const { resolvedTheme } = useTheme()
  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    hydratedOnClient,
    hydratedOnServer
  )

  // React Flow bakes this class into its wrapper on the first render, and
  // next-themes cannot know the theme until after hydration. Holding at "light"
  // until hydrated keeps the server and first client render identical, then the
  // store above re-renders with the real theme.
  const colorMode = hydrated && resolvedTheme === "dark" ? "dark" : "light"

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
        onDelete={onDelete}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        colorMode={colorMode}
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

        {/* Last child so other users' cursors draw above the canvas chrome. */}
        <Cursors />
      </ReactFlow>
    </div>
  )
}
