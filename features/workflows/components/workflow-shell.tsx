import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Canvas } from "@/features/workflows/components/canvas"
import { ConsolePanel } from "@/features/workflows/components/console-panel"
import { RightSidebar } from "@/features/workflows/components/right-sidebar"

/**
 * Layout shell for the workflow editor. Sizes are expressed in rem rather than
 * percentages so the panels keep a predictable footprint at any viewport width.
 */
export function WorkflowShell({ workflowId }: { workflowId: string }) {
  return (
    <ResizablePanelGroup orientation="horizontal" className="size-full">
      {/* Primary column: canvas above, logs below. */}
      <ResizablePanel minSize="30rem">
        <ResizablePanelGroup orientation="vertical">
          <ResizablePanel minSize="18rem">
            <Canvas workflowId={workflowId} />
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Taller by default than the placeholder it replaces: the console
              lists runs and their steps, and 8rem left room for about three
              rows of them. It can still be dragged down to that. */}
          <ResizablePanel defaultSize="14rem" minSize="6rem">
            <ConsolePanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Sizes its own panel, so it is not wrapped in one here. */}
      <RightSidebar workflowId={workflowId} />
    </ResizablePanelGroup>
  )
}
