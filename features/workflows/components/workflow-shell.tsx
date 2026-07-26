import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
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
            <div className="flex size-full flex-col items-center justify-center gap-1">
              <span className="text-sm font-medium">Canvas</span>
              <span className="font-mono text-xs text-muted-foreground">
                {workflowId}
              </span>
            </div>
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

      <ResizablePanel defaultSize="16rem" minSize="14rem" maxSize="36rem">
        <RightSidebar />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
