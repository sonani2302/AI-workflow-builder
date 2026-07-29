import type { Edge, Node } from "@xyflow/react"
import {
  Globe,
  MousePointerClick,
  Pointer,
  type LucideIcon,
} from "lucide-react"

export type StepNodeKind = "trigger" | "action"

// One editable field on a node, rendered as an input in the inspector later.
export type NodeField = {
  key: string
  label: string
  placeholder?: string
  // Opts the field into a textarea rather than a single-line input, for values
  // that run long or carry their own line breaks — a prompt, a body, a script.
  // The choice belongs here so it travels with the field, rather than the
  // editor keeping its own list of which keys are large.
  multiline?: boolean
}

// One value a node leaves behind for the nodes after it. path is where the
// value sits in that node's output, and is the half a placeholder is built
// from: "{{ <node id>.<path> }}". label is what a picker shows instead.
//
// Declared rather than read off a run, because the editor has to offer these
// while the canvas is being drawn — which is before any output exists.
export type NodeOutput = {
  path: string
  label: string
}

// A node type's manifest entry. Add a node by adding an entry to nodeRegistry.
export type NodeDefinition = {
  type: string
  kind: StepNodeKind
  label: string
  icon: LucideIcon
  accent: string // Tailwind classes for the icon chip color
  fields: NodeField[]
  outputs: NodeOutput[]
}

export const nodeRegistry = {
  start: {
    type: "start",
    kind: "trigger",
    label: "Start",
    icon: MousePointerClick,
    accent: "bg-blue-500 text-white",
    fields: [],
    // A trigger marks where a run starts rather than doing work, so there is
    // nothing for a later node to read off it.
    outputs: [],
  },
  "open-url": {
    type: "open-url",
    kind: "action",
    label: "Open URL",
    icon: Globe,
    accent: "bg-emerald-500 text-white",
    fields: [{ key: "url", label: "URL", placeholder: "https://youtube.com" }],
    outputs: [
      { path: "url", label: "URL" },
      { path: "title", label: "Title" },
    ],
  },
  act: {
    type: "act",
    kind: "action",
    label: "Act",
    icon: Pointer,
    accent: "bg-violet-500 text-white",
    // One field, and multi-line because what goes in it is a sentence rather
    // than a value — "click the sign in button", and sometimes rather more
    // than that when the page needs saying which one.
    fields: [
      {
        key: "instruction",
        label: "Instruction",
        placeholder: "Click the sign in button",
        multiline: true,
      },
    ],
    outputs: [
      { path: "success", label: "Success" },
      { path: "message", label: "Message" },
      { path: "url", label: "URL" },
    ],
  },
} satisfies Record<string, NodeDefinition>

export type NodeType = keyof typeof nodeRegistry

/**
 * The node types that do something when a run reaches them, which is every
 * type but the trigger. Read back off the registry rather than listed a second
 * time here, so adding a node to the manifest above is all it takes for the
 * executor registry to start demanding a handler for it.
 */
export type ActionNodeType = {
  [K in NodeType]: (typeof nodeRegistry)[K]["kind"] extends "action" ? K : never
}[NodeType]

// Plain JSON only (synced through Liveblocks later). type keys into the registry;
// kind and title are denormalized so the server can read them without the registry.
export type StepNodeData = {
  type: NodeType
  kind: StepNodeKind
  title: string
  values: Record<string, string>
}

export type StepNodeType = Node<StepNodeData, "step">

/**
 * A workflow's canvas as it is stored on the row: the same nodes and edges
 * React Flow renders, so a saved graph loads straight back onto the canvas
 * without a translation step.
 *
 * Edge stays React Flow's own type rather than a narrowed one. Nothing here
 * owns a custom edge yet, and the fields it carries beyond source and target
 * — type, markerEnd, the handles — are exactly what the canvas needs back.
 */
export type WorkflowGraph = {
  nodes: StepNodeType[]
  edges: Edge[]
}
