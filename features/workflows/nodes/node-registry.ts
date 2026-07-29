import type { Edge, Node } from "@xyflow/react"
import {
  Bot,
  Globe,
  Mail,
  MousePointerClick,
  Pointer,
  ScanEye,
  ScanText,
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
  // Whether an organization has to be on the pro plan to add this node. Said
  // here rather than by the toolbar naming the types it locks, so making a
  // second node premium is a line in its own entry — the same reason kind and
  // fields live here. Absent means free, which is what almost every node is.
  premium?: boolean
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
  extract: {
    type: "extract",
    kind: "action",
    label: "Extract",
    icon: ScanText,
    accent: "bg-amber-500 text-white",
    // Multi-line for the same reason act's is: what is being asked for takes a
    // sentence to describe, and often a qualifying clause about which part of
    // the page to take it from.
    fields: [
      {
        key: "instruction",
        label: "Instruction",
        placeholder: "The price of the first result",
        multiline: true,
      },
    ],
    // One reading, because the node asks for no schema and so gets the default
    // one back. Anything finer-grained would have to be describable from the
    // canvas first.
    outputs: [{ path: "extraction", label: "Extraction" }],
  },
  observe: {
    type: "observe",
    kind: "action",
    label: "Observe",
    icon: ScanEye,
    accent: "bg-sky-500 text-white",
    fields: [
      {
        key: "instruction",
        label: "Instruction",
        placeholder: "The buttons that add an item to the cart",
        multiline: true,
      },
    ],
    // The whole list, and a count to branch on. A chip drops the list in as
    // JSON, which is the only honest reading of it — a step wanting one match
    // can say so by hand, since a placeholder walks paths: "{{ <id>.matches[0]
    // .selector }}".
    outputs: [
      { path: "matches", label: "Matches" },
      { path: "count", label: "Match count" },
    ],
  },
  agent: {
    type: "agent",
    kind: "action",
    label: "Agent",
    icon: Bot,
    accent: "bg-rose-500 text-white",
    // The one paid node. It is handed a goal rather than a move, so it decides
    // its own steps and keeps a browser and a model busy for as long as that
    // takes — where every other action is one bounded call. That is what is
    // being charged for.
    premium: true,
    // Multi-line, and for a stronger reason than the others: this field holds a
    // goal rather than a single move, so it runs to several lines and often
    // wants a condition on the end — what to do, and what done looks like.
    fields: [
      {
        key: "instruction",
        label: "Instruction",
        placeholder:
          "Find the cheapest flight to Lisbon next month and open its booking page",
        multiline: true,
      },
    ],
    // No list of the steps it took: it is long, it varies run to run, and there
    // is nothing in it a later field would want to name. What is worth reading
    // is whether the goal was met, what it says about that, and whether it got
    // to its own end rather than being stopped at the step cap.
    outputs: [
      { path: "success", label: "Success" },
      { path: "message", label: "Message" },
      { path: "completed", label: "Completed" },
    ],
  },
  "send-email": {
    type: "send-email",
    kind: "action",
    label: "Send Email",
    icon: Mail,
    accent: "bg-indigo-500 text-white",
    // The first action here that is not about a page at all, which is why it
    // reads as three plain fields rather than an instruction: there is no model
    // to interpret them, so what is typed is what gets sent.
    //
    // No "from" field. Resend will only send from a domain the account has
    // verified, so the address is not a free choice and belongs in the executor
    // rather than on the canvas, where it would look like one.
    fields: [
      { key: "to", label: "To", placeholder: "someone@example.com" },
      {
        key: "subject",
        label: "Subject",
        placeholder: "Your workflow finished",
      },
      {
        key: "body",
        label: "Body",
        placeholder: "What the email should say",
        // Multi-line for the plainest reason of any field here: it is the body
        // of an email, and the line breaks typed into it are kept — it goes out
        // as text rather than as markup.
        multiline: true,
      },
    ],
    // Just the id. What a send has to say for itself is that it happened and
    // what it can be looked up by afterwards — the recipient and the subject
    // come back too, but a later step wanting either already has them on the
    // node it typed them into.
    outputs: [{ path: "id", label: "Email ID" }],
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
