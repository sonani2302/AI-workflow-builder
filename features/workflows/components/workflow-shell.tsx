import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Canvas } from "@/features/workflows/components/canvas"
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

          <ResizablePanel defaultSize="8rem" minSize="6rem">
            <div className="flex size-full items-center justify-center">
              <span className="text-sm font-medium">Logs</span>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Sizes its own panel, so it is not wrapped in one here. */}
      <RightSidebar />
    </ResizablePanelGroup>
  )
}
