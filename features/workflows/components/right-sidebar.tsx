"use client"

import { useState, useTransition } from "react"
import { MoreHorizontal, Play, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  useNodesData,
  useReactFlow,
  useStore,
  useStoreApi,
} from "@xyflow/react"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ResizablePanel } from "@/components/ui/resizable"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import {
  deleteWorkflowAction,
  runWorkflowAction,
} from "@/features/workflows/actions"
import { RunStatus } from "@/features/workflows/components/run-status"
import { validateGraph } from "@/features/workflows/lib/validate-graph"
import {
  createStepNode,
  stepNodeSize,
} from "@/features/workflows/nodes/create-step-node"
import {
  nodeRegistry,
  type NodeDefinition,
  type NodeField,
  type NodeType,
  type StepNodeKind,
  type StepNodeType,
} from "@/features/workflows/nodes/node-registry"

// This file builds up to the RightSidebar component exported at the bottom: a
// header with workflow actions (delete, run), then two tabs — a Toolbar for
// adding nodes and an Editor for tweaking the selected node. Each helper below is
// defined just above the block that uses it.

// ---------------------------------------------------------------------------
// Shared pieces — used by both the Toolbar and the Editor.
// ---------------------------------------------------------------------------

// The accent-colored icon chip, mirroring the node on the canvas.
function NodeIcon({ type, className }: { type: NodeType; className?: string }) {
  const def = nodeRegistry[type]
  const Icon = def.icon
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-md",
        def.accent,
        className
      )}
    >
      <Icon className="size-3.5" />
    </span>
  )
}

// A titled, scrollable panel. Each tab renders its content inside one.
function Section({
  title,
  icon,
  children,
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-y border-border bg-card px-3 py-1.5 text-sm font-semibold">
        {icon}
        {title}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Editor tab — edits the fields of the selected node.
// ---------------------------------------------------------------------------

// A single editor field for a node property. Which control it renders comes
// from the field's own definition, so a node type opts into a textarea in the
// registry and the editor never grows a list of which keys are the large ones.
function FieldControl({
  field,
  value,
  onChange,
}: {
  field: NodeField
  value: string
  onChange: (value: string) => void
}) {
  if (field.multiline) {
    // Textarea carries field-sizing-content, so it starts at a few lines and
    // grows with what is typed instead of scrolling inside a fixed box.
    return (
      <Textarea
        id={field.key}
        value={value}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  return (
    <Input
      id={field.key}
      value={value}
      placeholder={field.placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

// What the editor needs of a node. Deliberately not the whole node: leaving
// out position is what keeps dragging one from re-rendering this panel on
// every frame. Matches what useNodesData hands back.
type SelectedNode = Pick<StepNodeType, "id" | "type" | "data">

// The Editor tab: one input per field on the selected node, or an empty state.
function Inspector({ node }: { node: SelectedNode | null }) {
  const { updateNodeData } = useReactFlow<StepNodeType>()

  if (!node) {
    return (
      <Section title="Editor">
        <p className="p-3 text-sm text-muted-foreground">No node selected</p>
      </Section>
    )
  }

  const { type, title, values } = node.data
  const def: NodeDefinition = nodeRegistry[type]

  return (
    <Section title={title} icon={<NodeIcon type={type} />}>
      <div className="flex flex-col gap-3 p-3">
        {def.fields.length === 0 ? (
          <p className="text-xs text-muted-foreground">No properties</p>
        ) : (
          def.fields.map((field) => (
            <div key={field.key} className="flex flex-col gap-1.5">
              <Label htmlFor={field.key} className="text-xs">
                {field.label}
              </Label>
              <FieldControl
                field={field}
                value={values[field.key] ?? ""}
                onChange={(value) =>
                  // The callback form reads the node as it stands now rather
                  // than as this render closed over it, so a keystroke cannot
                  // undo an edit someone else made in between. Merging over
                  // the current values keeps the node's other fields, which a
                  // bare { values: { [key]: value } } would drop.
                  updateNodeData(node.id, (current) => ({
                    values: { ...current.data.values, [field.key]: value },
                  }))
                }
              />
            </div>
          ))
        )}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Toolbar tab — adds nodes to the canvas, grouped by kind.
// ---------------------------------------------------------------------------

// The Toolbar's groups, one accordion section per node kind.
const sections: { kind: StepNodeKind; label: string }[] = [
  { kind: "trigger", label: "Triggers" },
  { kind: "action", label: "Actions" },
]

// Every node type from the registry, filtered into the groups below.
const definitions = Object.values(nodeRegistry)

// The Toolbar tab: a button per node type that adds it to the canvas.
function Palette() {
  // The ReactFlowProvider around the workflow page puts this sidebar and the
  // canvas on one store, so these read and write the same graph even though
  // the palette renders outside the canvas.
  const { addNodes, getNodes, getViewport } = useReactFlow<StepNodeType>()
  const store = useStoreApi()

  const add = (type: NodeType) => {
    const nodes = getNodes()

    // A workflow starts in exactly one place, so a second trigger is an error
    // rather than a node.
    if (
      nodeRegistry[type].kind === "trigger" &&
      nodes.some((node) => node.data.kind === "trigger")
    ) {
      toast.error("This workflow already has a trigger")
      return
    }

    // A click on the palette carries no position over the canvas, so the node
    // goes to the middle of whatever the viewport currently shows. width and
    // height are the canvas' own size, which only the store knows.
    const { width, height } = store.getState()
    const { x, y, zoom } = getViewport()
    const position = {
      x: (width / 2 - x) / zoom - stepNodeSize.width / 2,
      y: (height / 2 - y) / zoom - stepNodeSize.height / 2,
    }

    // addNodes rather than a local state update: React Flow turns it into an
    // "add" change, which the canvas hands to Liveblocks, so the node reaches
    // storage and everyone else in the room.
    addNodes(createStepNode(crypto.randomUUID(), type, position, nodes))
  }

  return (
    <Section title="Toolbar">
      <Accordion
        multiple
        defaultValue={sections.map((s) => s.kind)}
        className="px-3 py-2"
      >
        {sections.map((section) => (
          <AccordionItem
            key={section.kind}
            value={section.kind}
            className="not-last:border-b-0"
          >
            <AccordionTrigger className="py-2 text-xs font-medium text-muted-foreground hover:no-underline">
              {section.label}
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-0.5">
              {definitions
                .filter((def) => def.kind === section.kind)
                .map((def) => (
                  <Button
                    key={def.type}
                    variant="ghost"
                    onClick={() => add(def.type as NodeType)}
                    className="justify-start gap-2.5 px-1.5 text-xs"
                  >
                    <NodeIcon type={def.type as NodeType} />
                    {def.label}
                  </Button>
                ))}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Header — workflow-level actions shown above the tabs.
// ---------------------------------------------------------------------------

// The "..." menu for workflow-level actions.
function ActionsMenu({ workflowId }: { workflowId: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleDelete = () => {
    startTransition(async () => {
      try {
        // Redirects to "/" on success, so nothing below it runs and the dialog
        // leaves with the page rather than needing to be closed.
        await deleteWorkflowAction(workflowId)
      } catch (error) {
        setConfirmOpen(false)
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not delete the workflow"
        )
      }
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="icon" variant="ghost" />}>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-48">
          <DropdownMenuItem
            variant="destructive"
            className="text-xs [&_svg:not([class*='size-'])]:size-3.5"
            // onClick, not onSelect: the item renders a div, whose onSelect is
            // the native text-selection event and never fires on a click.
            // Letting the menu close on click is fine now — the delete lives
            // behind the dialog, so nothing is in flight yet.
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 />
            Delete workflow
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Sibling of the menu rather than nested inside it: the menu unmounts
          its content on close, which would take the dialog with it. */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2 className="text-destructive" />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete this workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              The workflow and everything on its canvas go, for everyone in the
              organization. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {/* Both disabled while the delete is in flight: the request is
                already away, so closing the dialog would not call it back. */}
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={handleDelete}
            >
              {isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// Kicks off a run of the current workflow.
function RunButton({ workflowId }: { workflowId: string }) {
  const { getNodes, getEdges } = useReactFlow<StepNodeType>()
  const [isPending, startTransition] = useTransition()
  const [handle, setHandle] = useState<{
    runId: string
    accessToken: string
  } | null>(null)

  const handleRun = () => {
    // The store is the source of truth, not the row: the canvas lives in
    // Liveblocks storage until a save writes it to the graph column.
    const graph = { nodes: getNodes(), edges: getEdges() }

    // Checked here first so an obvious mistake comes back without a round
    // trip. The action checks it again before queueing, and the task once
    // more when it runs.
    const validation = validateGraph(graph)

    if (!validation.ok) {
      const [first, ...rest] = validation.issues

      // One toast rather than one per issue: a graph with four problems would
      // otherwise bury the canvas under four of these.
      toast.error(first.message, {
        description:
          rest.length > 0
            ? `And ${rest.length} more problem${rest.length === 1 ? "" : "s"} to fix.`
            : undefined,
      })

      return
    }

    // The pending flag also guards against a double click queueing two runs.
    startTransition(async () => {
      try {
        setHandle(await runWorkflowAction(workflowId, graph))
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not start the run"
        )
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        size="sm"
        variant="secondary"
        onClick={handleRun}
        disabled={isPending}
      >
        <Play fill="primary" />
        Run
      </Button>

      {/* Keyed by run id so each new run remounts with a fresh subscription. */}
      {handle ? (
        <RunStatus
          key={handle.runId}
          runId={handle.runId}
          accessToken={handle.accessToken}
        />
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The sidebar itself — header on top, then the Toolbar / Editor tabs.
// ---------------------------------------------------------------------------

export function RightSidebar({ workflowId }: { workflowId: string }) {
  const [tab, setTab] = useState("toolbar")

  // React Flow keeps the selection on the nodes themselves, so the store is
  // where a click on the canvas becomes readable out here. Liveblocks writes
  // it with setLocal, which keeps it this user's selection rather than the
  // room's. The editor edits one node, so a multi-selection takes the first.
  const selectedId = useStore(
    (state) => state.nodes.find((node) => node.selected)?.id ?? ""
  )

  // Subscribes to that node's data alone, so an edit re-renders the editor but
  // a drag does not. An id no node holds — "" when the selection is empty —
  // comes back as null, which Inspector renders as its empty state.
  const selected = useNodesData<StepNodeType>(selectedId)

  // Clicking a node opens the editor on it. Adjusted during render rather than
  // in an effect, so the Toolbar never paints once before the switch.
  //
  // Tracking the last id, instead of switching whenever anything is selected,
  // is what makes this a nudge rather than a lock: the tab moves when the
  // selection moves — including from one node straight to another — and you
  // can still go back to the Toolbar with a node selected. Deselecting leaves
  // the editor open on its empty state rather than yanking the tab away.
  const [lastSelectedId, setLastSelectedId] = useState(selectedId)

  if (selectedId !== lastSelectedId) {
    setLastSelectedId(selectedId)

    if (selectedId) {
      setTab("editor")
    }
  }

  return (
    <ResizablePanel
      className="bg-background"
      defaultSize="16rem"
      minSize="14rem"
      maxSize="36rem"
      groupResizeBehavior="preserve-pixel-size"
    >
      <Tabs value={tab} onValueChange={setTab} className="size-full gap-0">
        {/* items-start, not items-center: the run status grows under the Run
            button and would otherwise drag the "..." menu down with it. */}
        <div className="flex items-start justify-between border-b border-border p-2">
          <ActionsMenu workflowId={workflowId} />
          <RunButton workflowId={workflowId} />
        </div>
        <TabsList className="m-2 w-fit bg-background">
          <TabsTrigger
            value="toolbar"
            className="flex-none rounded-sm data-active:bg-accent! data-active:text-accent-foreground! data-active:shadow-none! dark:data-active:border-transparent!"
          >
            Toolbar
          </TabsTrigger>
          <TabsTrigger
            value="editor"
            className="flex-none rounded-sm data-active:bg-accent! data-active:text-accent-foreground! data-active:shadow-none! dark:data-active:border-transparent!"
          >
            Editor
          </TabsTrigger>
        </TabsList>
        <TabsContent value="toolbar" className="flex min-h-0 flex-col">
          <Palette />
        </TabsContent>
        <TabsContent value="editor" className="flex min-h-0 flex-col">
          <Inspector node={selected} />
        </TabsContent>
      </Tabs>
    </ResizablePanel>
  )
}
