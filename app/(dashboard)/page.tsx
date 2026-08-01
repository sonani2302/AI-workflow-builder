import { Suspense } from "react"
import { Workflow } from "lucide-react"

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { CreateWorkflowButton } from "@/features/workflows/components/create-workflow-button"
import { WorkflowDeletedToast } from "@/features/workflows/components/workflow-deleted-toast"

export default function Page() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      {/* Suspended because it reads the URL's query: useSearchParams makes the
          client tree up to the nearest boundary render on the client, and
          without one that would be this whole page. It draws nothing, so there
          is nothing for the fallback to stand in for. */}
      <Suspense fallback={null}>
        <WorkflowDeletedToast />
      </Suspense>

      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Workflow />
          </EmptyMedia>
          <EmptyTitle>No workflow selected</EmptyTitle>
          <EmptyDescription>
            Select a workflow from the sidebar or create a new one to get
            started.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <CreateWorkflowButton />
        </EmptyContent>
      </Empty>
    </div>
  )
}
