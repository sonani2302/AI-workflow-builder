"use client"

import { useRef, useState, useTransition } from "react"
import { Lock, MoreHorizontal, Play, Square, Trash2 } from "lucide-react"
import * as Sentry from "@sentry/nextjs"
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
  cancelRunAction,
  deleteWorkflowAction,
  runWorkflowAction,
} from "@/features/workflows/actions"
import { NodeIcon } from "@/features/workflows/components/node-icon"
import { RunStatus } from "@/features/workflows/components/run-status"
import {
  isRunLive,
  useLatestRun,
} from "@/features/workflows/components/workflow-runs-provider"
import { useProPlan } from "@/features/workflows/hooks/use-pro-plan"
import { useUpstreamConnections } from "@/features/workflows/hooks/use-upstream-connections"
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
  onFocus,
  inputRef,
}: {
  field: NodeField
  value: string
  onChange: (value: string) => void
  onFocus: () => void
  // Handed the live element so a connection chip can drop its token in at the
  // caret. Both controls take it, because a token is worth inserting into a
  // one-line URL as much as into a long prompt.
  inputRef: (element: HTMLInputElement | HTMLTextAreaElement | null) => void
}) {
  if (field.multiline) {
    // Textarea carries field-sizing-content, so it starts at a few lines and
    // grows with what is typed instead of scrolling inside a fixed box.
    return (
      <Textarea
        id={field.key}
        ref={inputRef}
        value={value}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
      />
    )
  }

  return (
    <Input
      id={field.key}
      ref={inputRef}
      value={value}
      placeholder={field.placeholder}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
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

  // Both of these run ahead of the empty state below, because a hook cannot be
  // called conditionally. "" is the id the connections hook answers with an
  // empty list, which is the right answer when nothing is selected anyway.
  const connections = useUpstreamConnections(node?.id ?? "")

  // Which field a chip drops its token into. Recorded on focus rather than on
  // change, so putting the caret in a field is enough to aim the next chip —
  // no need to have typed in it first.
  const [lastFieldKey, setLastFieldKey] = useState<string | null>(null)

  // The live elements, so a token goes in where the caret is rather than only
  // at the end, and the caret can be put back after it.
  const fieldRefs = useRef<
    Record<string, HTMLInputElement | HTMLTextAreaElement | null>
  >({})

  if (!node) {
    return (
      <Section title="Editor">
        <p className="p-3 text-sm text-muted-foreground">No node selected</p>
      </Section>
    )
  }

  const { type, title, values } = node.data
  const def: NodeDefinition = nodeRegistry[type]

  // Held as its own const so the closure below does not depend on the narrowing
  // above surviving into a nested function.
  const nodeId = node.id

  // Where a chip lands: the field last focused, or the first one. Checking the
  // remembered key against this node's own fields is what makes selecting a
  // different node fall back to its first field, rather than aiming at a key
  // that node does not have.
  const targetKey =
    def.fields.find((field) => field.key === lastFieldKey)?.key ??
    def.fields[0]?.key

  function insertToken(token: string) {
    if (!targetKey) {
      return
    }

    const element = fieldRefs.current[targetKey]
    const current = values[targetKey] ?? ""

    // Where the caret sits, or the end of the text for a field that has not
    // been focused and so has no selection to speak of.
    const start = element?.selectionStart ?? current.length
    const end = element?.selectionEnd ?? current.length

    updateNodeData(nodeId, (currentNode) => ({
      values: {
        ...currentNode.data.values,
        [targetKey]: current.slice(0, start) + token + current.slice(end),
      },
    }))

    // Put the caret after what was just inserted, once the new value has been
    // painted, so a second chip lands after the first rather than back where
    // the caret was before either of them.
    const caret = start + token.length

    requestAnimationFrame(() => {
      element?.focus()
      element?.setSelectionRange(caret, caret)
    })
  }

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
                inputRef={(element) => {
                  fieldRefs.current[field.key] = element
                }}
                onFocus={() => setLastFieldKey(field.key)}
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

        {/* Only worth showing when there is both something to insert and a
            field to insert it into — a chip that quietly did nothing would be
            worse than no chip. */}
        {connections.length > 0 && targetKey ? (
          <div className="flex flex-col gap-1.5 border-t border-border pt-3">
            <p className="text-xs font-medium">Connections</p>

            <div className="flex flex-wrap gap-1">
              {connections.map((connection) => (
                <button
                  key={connection.token}
                  type="button"
                  onClick={() => insertToken(connection.token)}
                  // The token itself on hover, since the label says which node
                  // and which output but not what actually gets inserted.
                  title={connection.token}
                  className="flex max-w-full items-center gap-1.5 rounded-md border border-border bg-card px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <NodeIcon type={connection.type} className="size-5" />
                  <span className="truncate">{connection.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
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
//
// Annotated rather than left inferred: the registry is declared with `satisfies`
// to keep each entry's literal type, which means the optional fields only exist
// on the entries that set them — so an inferred union has no `premium` to read
// on the nodes that are free. This asks for the manifest shape instead.
const definitions: NodeDefinition[] = Object.values(nodeRegistry)

// The Toolbar tab: a button per node type that adds it to the canvas.
function Palette() {
  // The ReactFlowProvider around the workflow page puts this sidebar and the
  // canvas on one store, so these read and write the same graph even though
  // the palette renders outside the canvas.
  const { addNodes, getNodes, getViewport } = useReactFlow<StepNodeType>()
  const store = useStoreApi()

  // What the premium nodes below are gated on. isLoaded matters as much as
  // isPro: before Clerk has the session the honest answer is "not yet known",
  // and treating that as "not pro" would hang a lock on the Agent node for a
  // moment on every load — including for the organizations paying for it.
  const { isPro, isLoaded, upgrade } = useProPlan()

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
                .map((def) => {
                  // Locked only once we know the answer is no. Until then a
                  // premium node is neither addable nor sold as unavailable —
                  // just briefly inert, which is the truth of it.
                  const locked = def.premium && isLoaded && !isPro
                  const undecided = def.premium && !isLoaded

                  return (
                    <Button
                      key={def.type}
                      variant="ghost"
                      disabled={undecided}
                      // Not disabled when locked: the click is the whole point
                      // of the lock, and a disabled button swallows it.
                      onClick={() =>
                        locked ? upgrade() : add(def.type as NodeType)
                      }
                      title={locked ? "Upgrade to pro to use this node" : ""}
                      className={cn(
                        "justify-start gap-2.5 px-1.5 text-xs",
                        locked && "text-muted-foreground"
                      )}
                    >
                      <NodeIcon type={def.type as NodeType} />
                      {def.label}
                      {locked ? <Lock className="ml-auto size-3" /> : null}
                    </Button>
                  )
                })}
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

        // The server already has this one: the action's throw went through
        // onRequestError with the organization and the workflow id attached.
        // This line only records that the dialog was the surface it surfaced
        // on, so a delete that fails for everyone is distinguishable from one
        // person's stale tab.
        Sentry.logger.warn("Delete workflow failed in the client", {
          surface: "actions-menu",
          workflow_id: workflowId,
          reason: error instanceof Error ? error.message : "unknown",
        })

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

// Starts a run of the current workflow, or stops the one that is going.
//
// One button rather than two, because the two states are mutually exclusive: at
// most one run of a workflow is live at a time, so a Run button beside a Stop
// button would always have one of them doing nothing.
function RunButton({ workflowId }: { workflowId: string }) {
  const { getNodes, getEdges } = useReactFlow<StepNodeType>()
  const [isPending, startTransition] = useTransition()

  // The run this button just queued, held only until the subscription catches
  // up with it. Without this the button would flip back to Run for the moment
  // between the action returning and the first realtime update arriving — long
  // enough to see, and long enough to click.
  const [queuedRunId, setQueuedRunId] = useState<string | null>(null)

  const latest = useLatestRun()
  const liveRun = latest && isRunLive(latest) ? latest : null

  // Adjusted during render rather than in an effect, matching how the sidebar
  // below follows the selection. Clearing on "the subscription has said
  // something about this run" rather than on "it is live" is what makes a run
  // that failed immediately give the button back instead of stranding it on
  // Stop.
  if (queuedRunId && latest?.id === queuedRunId) {
    setQueuedRunId(null)
  }

  // Stoppable while the subscription reports a live run, and during the gap
  // described above. The id is what cancelling needs, and either source is a
  // real run id.
  const stoppableRunId = liveRun?.id ?? queuedRunId

  const handleStop = () => {
    if (!stoppableRunId) {
      return
    }

    startTransition(async () => {
      try {
        await cancelRunAction(workflowId, stoppableRunId)
      } catch (error) {
        // The action's throw is already an issue via onRequestError. What this
        // adds is which of the two id sources was being stopped: a failure that
        // only happens on a run the subscription has not reported yet is a
        // different problem from one on a run it has.
        Sentry.logger.warn("Run failed to cancel from the client", {
          surface: "run-button",
          workflow_id: workflowId,
          run_id: stoppableRunId,
          subscription_caught_up: Boolean(liveRun),
          reason: error instanceof Error ? error.message : "unknown",
        })

        toast.error(
          error instanceof Error ? error.message : "Could not stop the run"
        )
      }
    })
  }

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
        // The run id is kept now, unlike before: the canvas still picks the run
        // up through the tag on its own, but the button needs something to offer
        // Stop on before that first update lands.
        const { runId } = await runWorkflowAction(workflowId, graph)

        setQueuedRunId(runId)
      } catch (error) {
        // As with delete, the action's own throw is already an issue. The graph
        // size is what this adds: a run that fails to queue only on large
        // canvases is a payload limit rather than a validation problem, and
        // that is not visible from the server's side of the call.
        Sentry.logger.warn("Run failed to queue from the client", {
          surface: "run-button",
          workflow_id: workflowId,
          node_count: graph.nodes.length,
          edge_count: graph.edges.length,
          reason: error instanceof Error ? error.message : "unknown",
        })

        toast.error(
          error instanceof Error ? error.message : "Could not start the run"
        )
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {stoppableRunId ? (
        <Button
          size="sm"
          variant="destructive"
          onClick={handleStop}
          disabled={isPending}
        >
          <Square fill="currentColor" />
          {isPending ? "Stopping…" : "Stop"}
        </Button>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          onClick={handleRun}
          disabled={isPending}
        >
          <Play fill="primary" />
          Run
        </Button>
      )}

      {/* Reads the shared subscription, so it needs nothing from either click
          and renders nothing until there is a run to report. */}
      <RunStatus />
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
